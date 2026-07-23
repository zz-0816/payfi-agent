/**
 * PayFi Agent — 论文购买 Demo
 *
 * 自动购买 4 篇 Web3 支付研究论文，每篇 5 USDC，
 * 全部购买后自动合成研究综述。
 *
 * 收款地址: 0x4CA732A3663e22cA0024ACaA77051813Eef4821c
 * 总花费: 20 USDC
 *
 * 用法:
 *   $env:PAYFI_PRIVATE_KEY="0x私钥"
 *   npx tsx scripts/demo-paper.ts
 */

import { encodeFunctionData, parseUnits, type Hash } from "viem";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
  isAutoSignEnabled,
} from "../src/config.js";
import {
  runSecurityCheckAsync,
  runSecurityCheckSync,
  generateRiskNotification,
  formatUSDC,
  type PaymentIntent,
  type RiskReport,
} from "../src/security.js";
import {
  signAndBroadcast,
  createSigner,
  type BroadcastResult,
} from "../src/wallet.js";
import {
  fetchPaidContent,
  synthesizePaper,
  getPurchasedArticles,
  clearPurchasedArticles,
} from "../src/data-payment.js";
import { logTransaction, printTxSummary } from "../src/notion.js";
import { TxStore } from "../src/store.js";

// ─── 配置 ──────────────────────────────────────────────────

const PAYEE = "0x4CA732A3663e22cA0024ACaA77051813Eef4821c";
const PRICE_PER_PAPER = 5;

const PAPERS = [
  "Anti-MEV Payment Channels",
  "Stablecoin Cross-border Settlement",
  "zk-SNARK Payment Privacy",
  "Agentic Payment Protocols",
];

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

// ─── 工具 ──────────────────────────────────────────────────

function banner(text: string) {
  console.log();
  console.log("═".repeat(64));
  console.log(`  ${text}`);
  console.log("═".repeat(64));
}

function divider(text: string) {
  console.log();
  console.log("─".repeat(64));
  console.log(`  ${text}`);
  console.log("─".repeat(64));
}

// ─── 主流程 ────────────────────────────────────────────────

async function main() {
  clearPurchasedArticles();
  const store = new TxStore();

  // Agent 地址
  let agentAddress: string;
  try {
    const signer = createSigner();
    agentAddress = signer.account.address;
  } catch {
    console.log("❌ 请先设置 PAYFI_PRIVATE_KEY 环境变量");
    process.exit(1);
  }
  store.setAgentAddress(agentAddress);

  banner("📚 PayFi Agent — 论文自动购买 Demo");
  console.log();
  console.log(`  钱包:   ${agentAddress}`);
  console.log(`  网络:   Monad Testnet`);
  console.log(`  代币:   USDC (${USDC_ADDRESS.slice(0, 10)}...${USDC_ADDRESS.slice(-6)})`);
  console.log(`  收款:   ${PAYEE}`);
  console.log(`  篇数:   ${PAPERS.length} 篇 × ${PRICE_PER_PAPER} USDC = ${PAPERS.length * PRICE_PER_PAPER} USDC`);
  console.log(`  签名:   ${isAutoSignEnabled() ? "🔑 真实模式" : "⚠️  Mock 模式"}`);
  console.log();

  let totalSpent = 0;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < PAPERS.length; i++) {
    const paperName = PAPERS[i];
    divider(`📄 论文 ${i + 1}/${PAPERS.length}: ${paperName}`);

    const amount = parseUnits(PRICE_PER_PAPER.toString(), USDC_DECIMALS);
    const intent: PaymentIntent = {
      to: PAYEE,
      amount,
      reason: `购买论文: ${paperName} (${PRICE_PER_PAPER} USDC)`,
    };

    // Step 1: 意图
    console.log(`🔍 意图: 付 ${PRICE_PER_PAPER} USDC → ${PAYEE.slice(0, 10)}...`);
    console.log(`   原因: 购买 "${paperName}"`);

    // Step 2: 安全检测
    console.log("🛡️  安全检测...");
    let risk: RiskReport;
    try {
      risk = await runSecurityCheckAsync(intent, agentAddress, undefined, store);
    } catch {
      risk = runSecurityCheckSync(intent);
    }
    console.log(`   等级: [${risk.level.toUpperCase()}] ${risk.summary}`);

    if (!risk.safe) {
      console.log(`   ⛔ 已拦截: ${risk.recommendation}`);
      failCount++;
      continue;
    }

    // Step 3: 构建交易
    const data = encodeFunctionData({
      abi: usdcAbi,
      functionName: "transfer",
      args: [PAYEE as `0x${string}`, amount],
    });
    console.log("🔧 交易已构建");

    // Step 4: 签名广播
    let result: BroadcastResult | null = null;
    if (isAutoSignEnabled()) {
      console.log("✍️  签名广播...");
      try {
        result = await signAndBroadcast(USDC_ADDRESS as `0x${string}`, data, 0n);
        console.log(`   ✅ 成功! ${result.explorerUrl}`);
        successCount++;
        totalSpent += PRICE_PER_PAPER;
      } catch (err: any) {
        console.log(`   ❌ 失败: ${err.message || err}`);
        failCount++;
        continue;
      }
    } else {
      console.log("   ⚠️  Mock 模式 — 模拟购买");
      successCount++;
      totalSpent += PRICE_PER_PAPER;
    }

    // Step 5: 获取论文内容
    console.log("📥 获取论文内容...");
    const txHash: Hash = result?.txHash || `mock_${Date.now().toString(16)}` as Hash;
    const content = await fetchPaidContent(
      {
        source: paperName,
        url: `https://mock-paywall.example.com/${encodeURIComponent(paperName)}`,
        amountUsdc: PRICE_PER_PAPER,
        payeeAddress: PAYEE,
        reason: intent.reason,
      },
      txHash,
    );
    console.log(content.split("\n").slice(0, 5).join("\n"));
    console.log("   ...");
    console.log("   ✅ 已保存到已购论文库");

    // 持久化
    store.addTransaction({
      txHash: result?.txHash || `mock_${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      to: PAYEE,
      amountRaw: amount.toString(),
      amountUsdc: formatUSDC(amount),
      type: "data_payment",
      riskLevel: risk.level,
      status: result ? "confirmed" : "pending",
      explorerUrl: result?.explorerUrl || "(Mock)",
      reason: intent.reason,
      gasUsed: result?.receipt?.gasUsed?.toString(),
    });
  }

  store.flush();

  // ── 结果汇总 ──────────────────────────────────────────────
  banner("📊 购买汇总");
  console.log();
  console.log(`  成功: ${successCount}/${PAPERS.length} 篇`);
  console.log(`  失败: ${failCount}`);
  console.log(`  花费: ${totalSpent} USDC`);
  console.log(`  余额: 待查 (MockUSDC)`);
  console.log();

  // ── 生成论文 ──────────────────────────────────────────────
  const articles = getPurchasedArticles();
  if (articles.length > 0) {
    console.log(synthesizePaper());
  } else {
    console.log("❌ 没有成功购买任何论文，无法生成。");
  }

  console.log();
  banner("✅ Demo 完成");
}

main().catch((err) => {
  console.error("❌ 脚本异常:", err);
  process.exit(1);
});
