/**
 * PayFi Agent — 交互模式 REPL
 *
 * 启动后等待用户输入指令，逐条处理。
 * 支持真实签名（需 PAYFI_PRIVATE_KEY）。
 *
 * 用法：
 *   $env:PAYFI_PRIVATE_KEY="0x私钥"
 *   npx tsx src/repl.ts
 *
 * 交互命令：
 *   付 10 USDC 给 0x...           — 发起转账
 *   付 5 USDC 给 0x... 获取 报告    — 付费获取数据
 *   history                       — 查看交易历史
 *   stats                         — 查看累计统计
 *   quit / exit                   — 退出
 */

import * as readline from "node:readline";
import * as path from "node:path";
import { encodeFunctionData, parseUnits, type Hash } from "viem";
import {
  USDC_ADDRESS,
  USDC_DECIMALS,
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
  listAvailablePapers,
  searchPapers,
  synthesizePaper,
  getPurchasedArticles,
  clearPurchasedArticles,
  savePaperToDisk,
  saveReceipt,
  getPaperKeys,
  isPaperPurchased,
  getUnpurchasedPapers,
  getPaperByIndex,
  findPaperByName,
  resetAll,
  listPurchasedPapers,
  getPaperTitle,
  type PaperSearchResult,
} from "./data-payment.js";
import { logTransaction, printTxSummary } from "./notion.js";
import { TxStore } from "./store.js";
import { routeIntent, intentToCommand, type IntentResult } from "./llm-router.js";

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

// ── 全局 ──────────────────────────────────────────────────

let store: TxStore;
let agentAddress: string;

// ── 意图解析 ──────────────────────────────────────────────

function parseIntent(input: string): PaymentIntent | null {
  const match = input.match(
    /付\s*(\d+(?:\.\d+)?)\s*(USDC|usdc)\s*给\s*(0x[a-fA-F0-9]{40})/i,
  );
  if (!match) return null;
  return {
    to: match[3],
    amount: parseUnits(match[1], USDC_DECIMALS),
    reason: input,
  };
}

// ── 白话意图路由 ──────────────────────────────────────────

/**
 * 将白话输入映射到内部命令。
 * 支持: 编号、范围、名称、全部
 */
function routeNaturalLanguage(input: string): string | null {
  // "帮我全部购买" / "都买了" / "全买" / "买所有" → buy-all
  if (/全部|所有|都买|全都|每篇|每个/i.test(input) &&
      /买|购买|付费/i.test(input)) {
    return "buy-all";
  }

  // "帮我买1-3号论文" → buy 1..3
  const rangeMatch = input.match(/(\d+)\s*[-–—到至]\s*(\d+)\s*[号篇本]/);
  if (rangeMatch && /买|购买|付费/i.test(input)) {
    const from = parseInt(rangeMatch[1]);
    const to = parseInt(rangeMatch[2]);
    return `buy-range ${from} ${to}`;
  }

  // "帮我买 2 号论文" → buy single by index
  const idxMatch = input.match(/[第]?\s*(\d+)\s*[号篇本]\s*(?:论文)?/);
  if (idxMatch && /买|购买|付费/i.test(input) && !/几|所有|全部|都/i.test(input)) {
    return `buy-idx ${idxMatch[1]}`;
  }

  // "帮我买几篇论文" / "帮我买论文" (通用，未指定) → buy-all
  if (/帮我.*买.*论文|买.*几篇.*论文|买.*论文|买.*文章/i.test(input) && !/\d/.test(input)) {
    return "buy-all";
  }

  // 论文生成场景
  if (/写.*论文|写.*报告|生成.*论文|生成.*报告|帮我.*写.*论文|帮我.*写.*报告|写.*一篇|写.*文章/i.test(input)) {
    return "paper";
  }

  // 查询场景
  if (/有什么.*论文|可以.*买.*什么|论文.*列表|查看.*论文|搜索.*论文|列出.*论文|有没有.*论文/i.test(input)) {
    // "有没有关于MEV的论文" → search
    const searchMatch = input.match(/有没有.*关于\s*(.+?)\s*的.*论文|搜索\s*(.+)/);
    if (searchMatch) {
      const q = searchMatch[1] || searchMatch[2];
      if (q) return `search ${q.trim()}`;
    }
    return "papers";
  }

  // 已购查询
  if (/已经.*买了.*哪些|我.*买了.*什么|查看.*已购|已购.*论文|购买.*记录/i.test(input)) {
    return "purchased";
  }

  // 重置
  if (/重置|清空.*所有|恢复.*初始|重新.*开始|全部.*删除/i.test(input)) {
    return "reset";
  }

  // 查看历史/统计
  if (/查看.*历史|交易.*记录|最近.*交易|我.*花了.*多少|统计/i.test(input)) {
    if (/多少|花了|统计/i.test(input)) return "stats";
    return "history";
  }

  return null;
}

async function handleCommand(input: string): Promise<void> {
  let trimmed = input.trim();
  if (!trimmed) return;

  // 语义路由：LLM 优先 → 正则兜底
  const intentResult = await routeIntent(trimmed);
  if (intentResult.intent !== "unknown") {
    trimmed = intentToCommand(intentResult);
  }

  // 内置命令 + 白话路由
  if (["quit", "exit", "q"].includes(trimmed.toLowerCase())) {
    console.log("👋 再见！");
    process.exit(0);
  }

  if (trimmed.toLowerCase() === "history") {
    showHistory();
    return;
  }

  if (trimmed.toLowerCase() === "stats") {
    showStats();
    return;
  }

  if (trimmed.toLowerCase() === "papers" || trimmed.toLowerCase() === "list") {
    console.log(listAvailablePapers());
    return;
  }

  if (trimmed.toLowerCase().startsWith("search ")) {
    const query = trimmed.slice(7).trim();
    const results = searchPapers(query);
    if (results.length === 0) {
      console.log(`❌ 未找到包含 "${query}" 的论文`);
    } else {
      console.log(`📚 搜索 "${query}" — 找到 ${results.length} 篇:`);
      for (const r of results) {
        const status = r.purchased ? "✅ 已购" : "❌ 待购";
        console.log(`  ${r.index}. [${status}] ${r.title}`);
        console.log(`     标签: ${r.keywords.join(", ")}`);
        if (!r.purchased) console.log(`     购买: 帮我买 ${r.index} 号论文`);
      }
    }
    return;
  }

  if (trimmed.toLowerCase() === "purchased") {
    console.log(listPurchasedPapers());
    return;
  }

  if (trimmed.toLowerCase() === "paper" || trimmed.toLowerCase() === "论文") {
    const articles = getPurchasedArticles();
    if (articles.length === 0) {
      console.log("❌ 尚未购买任何论文。");
      console.log("   用 papers 查看可购买的论文列表");
      console.log("   用 search <关键词> 搜索论文");
      return;
    }
    console.log();
    console.log(synthesizePaper());
    return;
  }

  if (trimmed.toLowerCase() === "clear") {
    clearPurchasedArticles();
    console.log("✅ 已购论文缓存已清空");
    return;
  }

  if (trimmed.toLowerCase() === "reset") {
    const { cleared } = resetAll();
    console.log(`✅ 已重置所有数据`);
    if (cleared.length > 0) {
      console.log(`   删除文件: ${cleared.length} 个`);
      for (const f of cleared) console.log(`   🗑️  ${f}`);
    }
    console.log("   💡 论文库已重置，可重新购买");
    return;
  }

  if (trimmed.toLowerCase() === "buy-all") {
    await autoBuyPapers(null, false);
    return;
  }

  if (trimmed.toLowerCase() === "rebuy") {
    console.log("⚠️  强制重新购买模式：将覆盖已购记录，重复付费。");
    await autoBuyPapers(null, true);
    return;
  }

  if (trimmed.toLowerCase().startsWith("buy-idx ")) {
    const idx = parseInt(trimmed.split(" ")[1]);
    await autoBuyPapers([idx], false);
    return;
  }

  if (trimmed.toLowerCase().startsWith("buy-range ")) {
    const parts = trimmed.split(" ");
    const from = parseInt(parts[1]);
    const to = parseInt(parts[2]);
    const indices: number[] = [];
    for (let i = from; i <= to; i++) indices.push(i);
    await autoBuyPapers(indices, false);
    return;
  }

  // 白话未命中，尝试名称匹配
  if (/买|购买|付费/i.test(trimmed)) {
    const nameMatch = findPaperByName(trimmed.replace(/帮我买|帮我购买|买|购买|付费|获取\s*/g, "").trim());
    if (nameMatch) {
      const keys = getPaperKeys();
      const idx = keys.indexOf(nameMatch) + 1;
      if (idx > 0) {
        await autoBuyPapers([idx], false);
        return;
      }
    }
  }

  // 意图解析
  const intent = parseIntent(trimmed);
  if (!intent) {
    // 区分错误类型：支付相关给出格式提示，其他给通用提示
    if (/付|转|USDC|usdc|0x/i.test(trimmed)) {
      console.log("❌ 无法解析支付指令。格式：付 10 USDC 给 0x...");
    } else {
      console.log("❌ 无法理解。试试：帮我买论文 / 有什么论文 / 帮我写论文 / 查看已购");
    }
    return;
  }

  console.log();
  console.log("──────────────────────────────────────────────");

  // Step 1: 解析
  console.log(`🔍 意图: 付 ${formatUSDC(intent.amount)} USDC 给 ${intent.to.slice(0, 10)}...`);

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
    console.log(generateRiskNotification(risk, intent));
    store.addTransaction({
      txHash: `rejected_${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      to: intent.to,
      amountRaw: intent.amount.toString(),
      amountUsdc: formatUSDC(intent.amount),
      type: parseDataPaymentIntent(trimmed) ? "data_payment" : "payment",
      riskLevel: risk.level,
      status: "rejected",
      explorerUrl: "",
      reason: intent.reason,
    });
    store.flush();
    return;
  }

  // Step 3: 构建交易
  const data = encodeFunctionData({
    abi: usdcAbi,
    functionName: "transfer",
    args: [intent.to as `0x${string}`, intent.amount],
  });

  // Step 4: 签名广播
  let result: BroadcastResult | null = null;
  if (!isAutoSignEnabled()) {
    console.log();
    console.log("   ⚠️  Mock 模式（未设 PAYFI_PRIVATE_KEY）");
    console.log(`   将向 ${intent.to} 转 ${formatUSDC(intent.amount)} USDC`);
    console.log("   设置环境变量以启用真实签名。");
  } else {
    console.log("   📡 签名广播中...");
    try {
      result = await signAndBroadcast(
        USDC_ADDRESS as `0x${string}`,
        data,
        0n,
      );
      console.log(`   ✅ 成功! ${result.explorerUrl}`);
    } catch (err: any) {
      console.log(`   ❌ 失败: ${err.message || err}`);
    }
  }

  // Step 5: 数据付费
  const dataReq = parseDataPaymentIntent(trimmed);
  if (dataReq) {
    const txHash: Hash = result?.txHash || `mock_${Date.now().toString(16)}` as Hash;
    const content = await fetchPaidContent(dataReq, txHash);
    console.log();
    console.log(content);
  }

  // Step 6: 持久化
  store.addTransaction({
    txHash: result?.txHash || `mock_${Date.now().toString(16)}`,
    timestamp: new Date().toISOString(),
    to: intent.to,
    amountRaw: intent.amount.toString(),
    amountUsdc: formatUSDC(intent.amount),
    type: dataReq ? "data_payment" : "payment",
    riskLevel: risk.level,
    status: result ? "confirmed" : "pending",
    explorerUrl: result?.explorerUrl || "(Mock 模式)",
    reason: intent.reason,
    gasUsed: result?.receipt?.gasUsed?.toString(),
  });
  store.flush();

  console.log(`   💾 已保存 (共 ${store.getMetrics().totalTxCount} 笔)`);
  console.log("──────────────────────────────────────────────");
}

// ── 自动购买 ──────────────────────────────────────────────

async function autoBuyPapers(indices: number[] | null, force: boolean): Promise<void> {
  const PAYEE = "0x4CA732A3663e22cA0024ACaA77051813Eef4821c";
  const PRICE = 5;
  const PRICE_BI = parseUnits(PRICE.toString(), USDC_DECIMALS);

  // 解析要买的论文列表
  let targets: string[] = [];
  if (indices) {
    for (const i of indices) {
      const key = getPaperByIndex(i);
      if (key) targets.push(key);
    }
  } else {
    targets = getPaperKeys();
  }

  // 去重：排除已购买（force 模式不排除）
  const toBuy = force ? targets : targets.filter(k => !isPaperPurchased(k));
  const skipped = force ? 0 : targets.length - toBuy.length;

  console.log();
  console.log("═".repeat(55));
  console.log(`  📚 智能购买论文${force ? " (强制模式)" : ""}`);
  console.log("═".repeat(55));
  console.log(`  收款: ${PAYEE}`);
  console.log(`  目标: ${targets.length} 篇${force ? "" : ` (已购 ${skipped} 篇跳过)`}`);
  console.log(`  待购: ${toBuy.length} 篇 × ${PRICE} = ${toBuy.length * PRICE} USDC`);
  if (!isAutoSignEnabled()) console.log("  ⚠️  未设 PAYFI_PRIVATE_KEY → Mock 模式");

  // 展示购买清单（防歧义：让用户确认买的是哪些）
  if (targets.length > 0) {
    console.log();
    console.log("  📋 购买清单:");
    const indices = targets.map(t => getPaperKeys().indexOf(t) + 1);
    for (let i = 0; i < targets.length; i++) {
      const purchased = !toBuy.includes(targets[i]);
      const icon = purchased ? "⏭️" : "💰";
      console.log(`     ${icon} 第${indices[i]}号: ${getPaperTitle(targets[i]).slice(0, 50)}...`);
    }
  }

  console.log();

  if (toBuy.length === 0 && !force) {
    console.log("  ✅ 所有目标论文均已购买，无需重复付费。");
    console.log("  💡 如需重新购买，请使用 rebuy 或 reset");
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const name = targets[i];
    if (!toBuy.includes(name)) {
      console.log(`⏭️  [${i + 1}/${targets.length}] ${name} — 已购，跳过`);
      continue;
    }

    console.log(`📄 [${i + 1}/${targets.length}] ${name}`);

    const intent: PaymentIntent = { to: PAYEE, amount: PRICE_BI, reason: `购买: ${name}` };

    // 安全检测
    let risk: RiskReport;
    try {
      risk = await runSecurityCheckAsync(intent, agentAddress, undefined, store);
    } catch {
      risk = runSecurityCheckSync(intent);
    }

    if (!risk.safe) {
      console.log(`   ⛔ 安全拦截: ${risk.summary}`);
      continue;
    }
    console.log(`   🛡️  [${risk.level.toUpperCase()}] 安全`);

    // 签名广播
    let result: BroadcastResult | null = null;
    if (isAutoSignEnabled()) {
      const data = encodeFunctionData({
        abi: usdcAbi,
        functionName: "transfer",
        args: [PAYEE as `0x${string}`, PRICE_BI],
      });
      try {
        result = await signAndBroadcast(USDC_ADDRESS as `0x${string}`, data, 0n);
        console.log(`   ✅ ${result.explorerUrl}`);
      } catch (err: any) {
        console.log(`   ❌ 失败: ${err.message || err}`);
        continue;
      }
    } else {
      console.log("   ⚠️  Mock — 模拟购买");
    }

    // 获取内容 + 保存到磁盘
    const txHash = (result?.txHash || `mock_${Date.now().toString(16)}`) as Hash;
    const content = await fetchPaidContent(
      { source: name, url: "", amountUsdc: PRICE, payeeAddress: PAYEE, reason: intent.reason },
      txHash,
    );

    // 保存单篇到 downloads/paper/
    const latestArticle = getPurchasedArticles().at(-1);
    if (latestArticle) {
      const fp = savePaperToDisk(latestArticle);
      console.log(`   📁 已保存: downloads/paper/${path.basename(fp)}`);

      // 保存交易凭证
      const receiptPath = saveReceipt(txHash,
        `PayFi Agent 交易凭证\n时间: ${new Date().toISOString()}\n内容: ${name}\n金额: ${PRICE} USDC\n收款: ${PAYEE}\n交易: ${txHash}`
      );
      console.log(`   🧾 凭证: downloads/receipts/${path.basename(receiptPath)}`);
    }

    console.log();

    // 持久化
    store.addTransaction({
      txHash: result?.txHash || `mock_${Date.now().toString(16)}`,
      timestamp: new Date().toISOString(),
      to: PAYEE,
      amountRaw: PRICE_BI.toString(),
      amountUsdc: formatUSDC(PRICE_BI),
      type: "data_payment",
      riskLevel: risk.level,
      status: result ? "confirmed" : "pending",
      explorerUrl: result?.explorerUrl || "(Mock)",
      reason: intent.reason,
    });
  }
  store.flush();

  console.log(`📊 本次新购 ${toBuy.length} 篇`);
  console.log("   💡 输入 paper 生成研究论文");
}

// ── 历史 ──────────────────────────────────────────────────

function showHistory(): void {
  const txs = store.getTransactions(10);
  if (txs.length === 0) {
    console.log("📭 暂无交易记录");
    return;
  }
  console.log(`📊 最近 ${txs.length} 笔交易:`);
  console.log("─".repeat(70));
  for (const tx of txs) {
    const status = tx.status === "confirmed" ? "✅" : tx.status === "rejected" ? "⛔" : "⏳";
    console.log(`${status} ${tx.timestamp.slice(0, 19)} | ${tx.amountUsdc} USDC → ${tx.to.slice(0, 10)}... | ${tx.type}`);
  }
  console.log("─".repeat(70));
}

function showStats(): void {
  const m = store.getMetrics();
  console.log(`📈 PayFi Agent 统计:`);
  console.log(`   总交易数: ${m.totalTxCount}`);
  console.log(`   累计金额: ${formatUSDC(BigInt(m.totalVolumeUsdc))} USDC`);
  console.log(`   今日花费: ${formatUSDC(store.getTodaySpent())} USDC`);
}

// ── 启动 ──────────────────────────────────────────────────

async function main() {
  store = new TxStore();

  // Agent 地址
  try {
    const signer = createSigner();
    agentAddress = signer.account.address;
  } catch {
    agentAddress = "0xdDF3fE9FCC5514e7B791c8c2DDC21a1E01da492B";
  }
  store.setAgentAddress(agentAddress);

  console.log("═".repeat(50));
  console.log("  💰 PayFi Agent — 交互模式");
  console.log("═".repeat(50));
  console.log();
  console.log(`  网络: Monad Testnet (Chain ID 10143)`);
  console.log(`  钱包: ${agentAddress}`);
  console.log(`  代币: USDC (${USDC_ADDRESS.slice(0, 10)}...)`);
  console.log(`  签名: ${isAutoSignEnabled() ? "🔑 真实模式" : "⚠️  Mock 模式"}`);
  console.log(`  意图: ${process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY ? "🧠 LLM 语义路由" : "📋 正则路由"}`);
  console.log(`  历史: ${store.getMetrics().totalTxCount} 笔交易`);
  console.log();
  console.log("  输入指令格式:");
  console.log("    付 10 USDC 给 0x收款地址");
  console.log("    付 5 USDC 给 0x收款地址 获取 论文名称");
  console.log();
  console.log("  论文系统:");
  console.log("    papers              查看可购买的 Web3 支付论文");
  console.log("    search MEV          搜索论文");
  console.log("    buy-all             自动购买全部 4 篇 + 生成论文");
  console.log("    paper               基于已购论文生成研究文章");
  console.log("    clear               清空已购论文缓存");
  console.log("    reset               重置所有数据（缓存+文件）");
  console.log("    rebuy               强制重新购买（覆盖已购）");
  console.log();
  console.log("  其他命令: history, stats, quit");
  console.log();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "PayFi> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    await handleCommand(line);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\n👋 PayFi Agent 已退出。");
    store.flush();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
