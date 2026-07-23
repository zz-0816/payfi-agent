/**
 * PayFi Agent — 主入口（无状态引擎 + 持久化存储）
 *
 * 流程: 意图解析 → 安全检测(查链) → 构建交易 → 签名广播 → 获取数据 → 持久化日志
 *
 * 运行: npx tsx src/agent.ts
 * 真实签名: export PAYFI_PRIVATE_KEY="0x你的Monad测试网私钥"
 */

import { encodeFunctionData, parseUnits, type Hash } from "viem";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
  USER_ADDRESS,
  isAutoSignEnabled,
} from "./config.js";
import {
  runSecurityCheckAsync,
  runSecurityCheckSync,
  generateRiskNotification,
  formatUSDC,
  type PaymentIntent,
  type RiskReport,
} from "./security.js";
import {
  signAndBroadcast,
  createSigner,
  type BroadcastResult,
} from "./wallet.js";
import {
  parseDataPaymentIntent,
  fetchPaidContent,
} from "./data-payment.js";
import { logTransaction, printTxSummary } from "./notion.js";
import { TxStore, type StoredTx } from "./store.js";

// ── USDC transfer ABI ──────────────────────────────────────

const usdcAbi = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// ── 全局 Store ──────────────────────────────────────────────

let store: TxStore;

// ── 意图解析 ────────────────────────────────────────────────

function parseIntent(input: string): PaymentIntent | null {
  const match = input.match(
    /付\s*(\d+(?:\.\d+)?)\s*(USDC|usdc)\s*给\s*(0x[a-fA-F0-9]{40})/i,
  );
  if (!match) {
    console.error("❌ 无法解析意图。格式：付 10 USDC 给 0x...");
    return null;
  }
  return {
    to: match[3],
    amount: parseUnits(match[1], USDC_DECIMALS),
    reason: input,
  };
}

// ── 交易构建（viem 直连）────────────────────────────────────

function buildUsdcTransfer(to: string, amount: bigint) {
  return encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [to as `0x${string}`, amount],
  });
}

// ── 显示函数 ────────────────────────────────────────────────

function banner(title: string): void {
  console.log("═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function section(label: string): void {
  console.log();
  console.log("─".repeat(60));
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

// ── 6-Step 流程 ─────────────────────────────────────────────

async function processIntent(input: string): Promise<void> {
  section(`📝 用户指令: "${input}"`);

  // Step 1: 意图解析
  console.log("🔍 Step 1 — 意图解析:");
  const intent = parseIntent(input);
  if (!intent) return;
  console.log(`   收款方: ${intent.to}`);
  console.log(`   金额:   ${formatUSDC(intent.amount)} USDC`);

  // Step 2: 安全检测（查链上日累计）
  console.log("🛡️  Step 2 — 安全检测:");

  let risk: RiskReport;
  const agentAddr = store.getAgentAddress() || USER_ADDRESS;

  if (agentAddr === "0x_YOUR_COURSE_WALLET_ADDRESS") {
    // 还没配置真实地址 → 用同步模式（不查链）
    console.log("   ⚠️  Agent 地址未配置，使用同步模式（不查链上日累计）");
    risk = runSecurityCheckSync(intent);
  } else {
    // 真实地址 → 异步模式查链
    console.log("   📡 查询链上今日累计...");
    risk = await runSecurityCheckAsync(intent, agentAddr, undefined, store);
  }

  console.log(`   等级:   [${risk.level.toUpperCase()}]`);
  console.log(`   结果:   ${risk.summary}`);
  if (risk.details) risk.details.forEach(d => console.log(`          ${d}`));

  if (!risk.safe) {
    console.log();
    console.log(generateRiskNotification(risk, intent));
    console.log("⛔ 交易已自动拦截。");

    // 记录被拒交易
    store.addTransaction({
      txHash: `rejected_${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      to: intent.to,
      amountRaw: intent.amount.toString(),
      amountUsdc: formatUSDC(intent.amount),
      type: parseDataPaymentIntent(input) ? "data_payment" : "payment",
      riskLevel: risk.level,
      status: "rejected",
      explorerUrl: "",
      reason: intent.reason,
      dailySpentAtTime: risk.dailySpentOnChain?.toString() || "N/A",
    });
    store.flush();  // 确保被拒交易也落盘

    logTxSummary(input, intent, risk, null);
    return;
  }

  // Step 3: 构建交易
  console.log("🔧 Step 3 — 构建交易:");
  const data = buildUsdcTransfer(intent.to, intent.amount);
  console.log("   ✅ USDC transfer 交易已构建（未签名）");
  console.log(`   合约: ${USDC_ADDRESS}`);
  console.log(`   收款: ${intent.to}`);

  // Step 4: 签名 + 广播
  let broadcastResult: BroadcastResult | null = null;
  console.log("✍️  Step 4 — 签名广播:");

  if (!isAutoSignEnabled()) {
    console.log("   ⚠️  未设置 PAYFI_PRIVATE_KEY，进入 Mock 签名模式");
    console.log("   📋 交易详情:");
    console.log(`   代币:   USDC (${USDC_ADDRESS.slice(0, 10)}...)`);
    console.log(`   收款:   ${intent.to}`);
    console.log(`   金额:   ${formatUSDC(intent.amount)} USDC`);
    console.log(`   风险:   [${risk.level.toUpperCase()}]`);
    console.log();
    console.log("   💡 设置 PAYFI_PRIVATE_KEY 以启用真实签名");
  } else {
    try {
      broadcastResult = await signAndBroadcast(
        USDC_ADDRESS as `0x${string}`,
        data,
        0n,
      );
    } catch (err: any) {
      console.error("❌ 签名/广播失败:", err.message || err);
    }
  }

  // Step 5: 获取付费数据
  const dataReq = parseDataPaymentIntent(input);
  if (dataReq) {
    console.log("📥 Step 5 — 获取付费数据:");
    const txHash: Hash = broadcastResult?.txHash || `0x_mock_${Date.now().toString(16)}` as Hash;
    const content = await fetchPaidContent(dataReq, txHash);
    console.log(content);
  } else {
    console.log("📥 Step 5 — 非数据付费请求，跳过。");
  }

  // Step 6: 持久化日志
  persistTx(input, intent, risk, broadcastResult);
}

// ── 日志持久化 ──────────────────────────────────────────────

function persistTx(
  input: string,
  intent: PaymentIntent,
  risk: RiskReport,
  result: BroadcastResult | null,
): void {
  const txHash = result?.txHash
    || `mock_${Date.now().toString(16)}`;

  store.addTransaction({
    txHash,
    timestamp: new Date().toISOString(),
    to: intent.to,
    amountRaw: intent.amount.toString(),
    amountUsdc: formatUSDC(intent.amount),
    type: parseDataPaymentIntent(input) ? "data_payment" : "payment",
    riskLevel: risk.level,
    status: result ? "confirmed" : "pending",
    explorerUrl: result?.explorerUrl || "(Mock 模式)",
    reason: intent.reason,
    gasUsed: result?.receipt?.gasUsed?.toString(),
    dailySpentAtTime: risk.dailySpentOnChain?.toString() || "N/A",
  });

  store.flush();

  logTxSummary(input, intent, risk, result);
}

function logTxSummary(
  input: string,
  intent: PaymentIntent,
  risk: RiskReport,
  result: BroadcastResult | null,
): void {
  section("📊 交易日志");

  const txHash = result?.txHash
    || `mock_${Date.now().toString(16)}`;
  const explorerUrl = result?.explorerUrl || "(Mock 模式)";

  const entry = logTransaction({
    txHash: txHash as Hash,
    explorerUrl,
    type: parseDataPaymentIntent(input) ? "data_payment" : "payment",
    to: intent.to,
    amount: formatUSDC(intent.amount),
    reason: intent.reason,
    risk,
    gasUsed: result?.receipt?.gasUsed?.toString(),
  });

  printTxSummary(entry);

  // 显示存储路径
  console.log();
  console.log(`   💾 已持久化到 .payfi-data/store.json`);
  console.log(`   📈 总交易数: ${store.getMetrics().totalTxCount}`);
}

// ── 主流程 ──────────────────────────────────────────────────

async function main() {
  banner("💰 PayFi Agent — AI 稳定币支付助手");

  // 初始化存储
  store = new TxStore();

  // 获取 Agent 地址
  const agentAddr = getUserAddress();
  store.setAgentAddress(agentAddr);

  console.log();
  console.log(`✅ 网络:   Monad Testnet (Chain ID ${10143})`);
  console.log(`   钱包:   ${agentAddr}`);
  console.log(`   代币:   USDC (${USDC_ADDRESS.slice(0, 10)}...${USDC_ADDRESS.slice(-6)})`);
  console.log(`   签名:   ${isAutoSignEnabled() ? "🔑 真实模式" : "⚠️  Mock 模式"}`);
  console.log(`   存储:   .payfi-data/store.json (${store.getMetrics().totalTxCount} 历史交易)`);

  // 链上交叉校验（如果有真实地址）
  if (agentAddr !== "0x_YOUR_COURSE_WALLET_ADDRESS") {
    try {
      console.log();
      console.log("🔍 启动时链上交叉校验...");
      const validation = await store.crossValidate(agentAddr as `0x${string}`);
      console.log(`   ${validation.message}`);
      if (validation.fixed) {
        store.flush();
        console.log("   💾 本地记录已修正并保存。");
      }
    } catch (err) {
      console.log(`   ⚠️  交叉校验跳过: ${(err as Error).message}`);
    }
  }

  console.log();

  // ── Demo 场景 ─────────────────────────────────────────────

  const demos = [
    "付 10 USDC 给 0x1111111111111111111111111111111111111111",
    "付 5 USDC 给 0x2222222222222222222222222222222222222222 获取 链上分析报告",
    "付 99999 USDC 给 0xdead000000000000000000000000000000000000",
  ];

  for (const input of demos) {
    await processIntent(input);
  }

  console.log();
  banner("✅ Demo 完成");
  console.log();
  console.log(`💾 所有数据已持久化到 .payfi-data/store.json`);
  console.log(`📊 本地记录交易数: ${store.getMetrics().totalTxCount}`);
  console.log(`💰 累计交易量: ${formatUSDC(BigInt(store.getMetrics().totalVolumeUsdc))} USDC`);
}

/** 获取 Agent 钱包地址（优先真实私钥推导，其次配置） */
function getUserAddress(): string {
  try {
    const signer = createSigner();
    return signer.account.address;
  } catch {
    return USER_ADDRESS;
  }
}

main().catch(console.error);
