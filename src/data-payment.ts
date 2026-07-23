/**
 * PayFi Agent — 数据付费模块
 *
 * 当用户需要付费获取数据/知识时，Agent 完成支付后拉取内容。
 *
 * 包含：
 *   - 4 篇 Web3 支付研究论文（Mock 数据源，每篇 5 USDC）
 *   - 论文合成引擎（购买后自动整合成论文）
 */

import { type Hash } from "viem";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── 类型 ───────────────────────────────────────────────────

export interface PaidDataRequest {
  source: string;
  url: string;
  amountUsdc: number;
  payeeAddress: string;
  reason: string;
}

export interface PurchasedArticle {
  title: string;
  txHash: string;
  content: string;
  keywords: string[];
}

// ─── 下载目录 ────────────────────────────────────────────

const DOWNLOADS_DIR = path.join(process.cwd(), "downloads");
const PAPER_DIR = path.join(DOWNLOADS_DIR, "paper");
const RECEIPTS_DIR = path.join(DOWNLOADS_DIR, "receipts");

function ensureDirs(): void {
  for (const d of [PAPER_DIR, RECEIPTS_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

const CACHE_FILE = path.join(process.cwd(), ".payfi-data", "purchased-articles.json");
const UID_FILE = path.join(process.cwd(), ".payfi-data", "purchased-uids.json");

let purchasedArticles: PurchasedArticle[] = [];
let purchasedUIDs: Set<string> = new Set();

function loadCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      purchasedArticles = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
    if (fs.existsSync(UID_FILE)) {
      purchasedUIDs = new Set(JSON.parse(fs.readFileSync(UID_FILE, "utf-8")));
    }
  } catch { /* 忽略 */ }
}

function saveCache(): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(purchasedArticles, null, 2));
    fs.writeFileSync(UID_FILE, JSON.stringify([...purchasedUIDs], null, 2));
  } catch { /* 忽略 */ }
}

// 启动时自动加载已有缓存
loadCache();

// ─── 保存单篇论文到 downloads/paper/ ────────────────────

export function savePaperToDisk(article: PurchasedArticle): string {
  ensureDirs();
  const safeName = article.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_").slice(0, 60);
  const filename = `${safeName}.md`;
  const filepath = path.join(PAPER_DIR, filename);
  fs.writeFileSync(filepath, article.content, "utf-8");
  return filepath;
}

// ─── 保存交易凭证到 downloads/receipts/ ─────────────────

export function saveReceipt(txHash: string, details: string): string {
  ensureDirs();
  const filename = `receipt-${txHash.slice(0, 10)}-${Date.now().toString(36)}.txt`;
  const filepath = path.join(RECEIPTS_DIR, filename);
  fs.writeFileSync(filepath, details, "utf-8");
  return filepath;
}

// ─── Web3 支付研究论文 Mock 数据 ──────────────────────────

const WEB3_PAPERS: Record<string, { uid: string; title: string; content: string; keywords: string[] }> = {
  "Anti-MEV Payment Channels": {
    uid: "PAPER_001",
    title: "Anti-MEV Payment Channels: Protecting User Transactions from Front-running",
    content: `【论文 1/4 — Anti-MEV Payment Channels】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: Anti-MEV Payment Channels: Protecting User Transactions from Front-running
作者: Zhang et al. (2024)
期刊: IEEE Transactions on Blockchain, Vol.5(3), pp.112-128
DOI:  10.1109/TBC.2024.mEv001

摘要:
本文提出一种抗 MEV（矿工可提取价值）的支付通道架构。
通过在 Layer 2 状态通道中引入时间锁定 + 批量结算机制，
有效防止抢跑（front-running）和三明治攻击（sandwich attack）。
实验结果表明，Anti-MEV 通道在 Uniswap V3 测试环境中将
MEV 损失降低了 87.3%，同时保持与传统支付通道相当的吞吐量。

关键发现:
1. 时间锁定窗口 ≥ 2 blocks 可防止 99% 的抢跑攻击
2. 批量结算将 Gas 成本分摊，单笔成本从 $12 → $0.34
3. 与现有 ERC-4337 账户抽象标准兼容

引用: Zhang, L., Chen, W., & Park, S. (2024).
"Anti-MEV Payment Channels." IEEE TBC, 5(3), 112-128.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    keywords: ["MEV", "Payment Channel", "Layer 2", "Front-running", "ERC-4337"],
  },

  "Stablecoin Cross-border Settlement": {
    uid: "PAPER_002",
    title: "Stablecoin-Based Cross-Border Settlement: Latency, Cost, and Regulatory Implications",
    content: `【论文 2/4 — Stablecoin Cross-border Settlement】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: Stablecoin-Based Cross-Border Settlement: Latency, Cost & Regulatory Implications
作者: Müller, K., & Okafor, C. (2024)
期刊: Journal of Digital Finance, Vol.12(2), pp.45-67
DOI:  10.2139/jdf.2024.stable001

摘要:
本研究对比了 USDC、USDT 和传统 SWIFT 在跨境支付场景中的
延迟、成本和合规性。基于 50,000 笔真实交易数据分析，
链上稳定币结算平均延迟 13.2 秒，费用 $0.02，
而 SWIFT 对应数据为 2.3 天和 $25-45。
同时讨论了 FATF 旅行规则对链上稳定币支付的影响。

关键数据:
┌──────────┬─────────┬──────────┬───────────┐
│ 方式     │ 延迟    │ 费用     │ 成功率    │
├──────────┼─────────┼──────────┼───────────┤
│ SWIFT    │ 2.3 天  │ $25-45   │ 98.7%     │
│ USDC     │ 13.2 秒 │ $0.02    │ 99.8%     │
│ USDT     │ 15.1 秒 │ $0.03    │ 99.6%     │
│ XRP      │ 4.1 秒  │ $0.0004  │ 99.9%     │
└──────────┴─────────┴──────────┴───────────┘

引用: Müller, K., & Okafor, C. (2024). "Stablecoin Cross-Border." JDF, 12(2), 45-67.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    keywords: ["Stablecoin", "Cross-border", "SWIFT", "USDC", "Regulation", "FATF"],
  },

  "zk-SNARK Payment Privacy": {
    uid: "PAPER_003",
    title: "Achieving Payment Privacy via zk-SNARKs on EVM-Compatible Chains",
    content: `【论文 3/4 — zk-SNARK Payment Privacy】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: Achieving Payment Privacy via zk-SNARKs on EVM-Compatible Chains
作者: Nakamoto, R., & Vitalis, A. (2025)
期刊: Proceedings on Privacy Enhancing Technologies (PoPETs), Vol.2025(1)
DOI:  10.2478/popets-2025-zkp001

摘要:
提出 ZK-Pay —— 一个基于 zk-SNARK 的链上隐私支付协议。
发送方在链下生成零知识证明，证明其拥有足够余额且未双花，
链上合约仅验证 proof 而不暴露金额、发送方或接收方地址。
在 Monad Testnet 上部署的 ZK-Pay 合约，单笔验证 Gas 仅 230K，
证明生成时间 < 2 秒（浏览器环境）。

技术栈:
- Groth16 证明系统
- Circom 2.0 电路编译器
- Solidity 0.8.20 链上验证器
- Monad Testnet 部署 (Chain ID 10143)

性能指标:
• 证明生成: 1.8s (浏览器 Wasm)
• 链上验证 Gas: 230,000
• 隐私集大小: 2^16 = 65,536
• 吞吐量: ~50 tx/s

引用: Nakamoto, R., & Vitalis, A. (2025). "ZK-Pay Privacy." PoPETs, 2025(1).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    keywords: ["zk-SNARK", "Privacy", "Zero-knowledge", "Monad", "Groth16", "Circom"],
  },

  "Agentic Payment Protocols": {
    uid: "PAPER_004",
    title: "The Rise of Agentic Payments: Autonomous AI Agents as Economic Actors on Public Blockchains",
    content: `【论文 4/4 — Agentic Payment Protocols】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: The Rise of Agentic Payments:
      Autonomous AI Agents as Economic Actors on Public Blockchains
作者: Kim, J., Patel, R., & Santos, M. (2025)
期刊: ACM Conference on Financial Cryptography (FC '25), pp.234-256
DOI:  10.1145/fc2025.agent-pay

摘要:
本文首次系统性地定义了"代理支付"（Agentic Payments）范式
——AI Agent 在公链上作为独立经济实体执行支付操作。
提出 APF（Agentic Payment Framework）三层架构：
  1. Intent Layer — 自然语言 → 结构化指令（LLM + 双重校验）
  2. Safety Layer — 链上/链下混合安全检测（黑名单/限额/恶意检测）
  3. Execution Layer — 仅人类持有私钥，Agent 构建交易 → 人签名

调查数据显示，2025 Q1 链上 AI Agent 交易量达到 $2.7B，
预计 2026 年超过 $20B。主要应用场景：
• 数据付费（AI 购买 API/数据集）           — 38%
• DeFi 自动化（收益策略/再平衡）           — 27%
• 内容创作（AI 购买素材/版权）             — 19%
• 物联网 M2M 支付                         — 16%

安全建议（5 条铁律）:
1. 私钥永不落 Agent 代码
2. 单笔 + 日累计双重限额
3. 链上 approve 做最终兜底
4. Agent 决策需人类确认后才执行
5. 紧急开关（一键冻结 Agent 钱包权限）

引用: Kim, J., Patel, R., & Santos, M. (2025). "Agentic Payments." FC '25, 234-256.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    keywords: ["Agentic Payment", "AI Agent", "Autonomous", "Safety", "Framework"],
  },
};

// ─── 已购文章追踪 ──────────────────────────────────────────

export function getPurchasedArticles(): PurchasedArticle[] {
  return [...purchasedArticles];
}

export function clearPurchasedArticles(): void {
  purchasedArticles.length = 0;
  purchasedUIDs.clear();
  saveCache();
}

// ─── 意图解析 ───────────────────────────────────────────────

export function parseDataPaymentIntent(userInput: string): PaidDataRequest | null {
  const match = userInput.match(
    /(?:获取|买|付费|购买|订阅)\s*(.+?)\s*付?\s*(\d+(?:\.\d+)?)\s*USDC\s*给\s*(0x[a-fA-F0-9]{40})/i,
  );
  if (match) {
    return {
      source: match[1].trim(),
      url: `https://mock-paywall.example.com/${encodeURIComponent(match[1].trim())}`,
      amountUsdc: parseFloat(match[2]),
      payeeAddress: match[3],
      reason: userInput,
    };
  }

  const match2 = userInput.match(
    /付\s*(\d+(?:\.\d+)?)\s*USDC\s*给\s*(0x[a-fA-F0-9]{40})\s*(?:获取|买|付费|购买)\s*(.+)/i,
  );
  if (match2) {
    return {
      source: match2[3].trim(),
      url: `https://mock-paywall.example.com/${encodeURIComponent(match2[3].trim())}`,
      amountUsdc: parseFloat(match2[1]),
      payeeAddress: match2[2],
      reason: userInput,
    };
  }

  return null;
}

// ─── 获取付费内容 ──────────────────────────────────────────

export async function fetchPaidContent(
  request: PaidDataRequest,
  txHash: Hash,
): Promise<string> {
  console.log("   📥 获取付费内容...");
  console.log(`   📡 数据源: ${request.source}`);

  await sleep(800);

  // 匹配 Web3 论文库
  for (const [key, paper] of Object.entries(WEB3_PAPERS)) {
    if (request.source.includes(key) || key.includes(request.source)) {
      // 去重：按 UID 检查，避免重复购买导致数组膨胀
      if (purchasedUIDs.has(paper.uid)) {
        // UID 已存在，不重复添加到 articles 数组
        // 但返回内容（可能来自缓存重新获取）
        const existing = purchasedArticles.find(a =>
          a.title === paper.title || a.content.includes(key)
        );
        if (existing) return existing.content;
      }

      purchasedArticles.push({
        title: paper.title,
        txHash,
        content: paper.content,
        keywords: paper.keywords,
      });
      purchasedUIDs.add(paper.uid);  // 标记 UID 已购
      saveCache();
      return paper.content;
    }
  }

  // 通用回复
  return `【付费内容已解锁 - ${request.source}】
━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 支付凭证: ${txHash}
💵 金额: ${request.amountUsdc} USDC
📅 解锁时间: ${new Date().toISOString()}
📄 "${request.source}" 的内容已获取。
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

// ─── Web3 论文库查询 ──────────────────────────────────────

/** 获取所有论文 key 的有序列表（用于编号） */
export function getPaperKeys(): string[] {
  return Object.keys(WEB3_PAPERS);
}

/** 获取论文 UID */
export function getPaperUID(name: string): string | null {
  for (const [key, paper] of Object.entries(WEB3_PAPERS)) {
    if (key.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(key.toLowerCase())) {
      return paper.uid;
    }
  }
  return null;
}

/** 检查某篇论文是否已购买（基于 UID） */
export function isPaperPurchased(name: string): boolean {
  const uid = getPaperUID(name);
  return uid ? purchasedUIDs.has(uid) : false;
}

/** 获取未购买的论文 key 列表（基于 UID） */
export function getUnpurchasedPapers(): string[] {
  return getPaperKeys().filter(k => !isPaperPurchased(k));
}

/** 清空所有缓存 + 删除下载文件 */
export function resetAll(): { cleared: string[] } {
  const cleared: string[] = [];

  // 清空内存
  purchasedArticles.length = 0;
  purchasedUIDs.clear();
  saveCache();

  // 删除已购论文文件
  if (fs.existsSync(PAPER_DIR)) {
    for (const f of fs.readdirSync(PAPER_DIR)) {
      if (f.endsWith(".md")) {
        fs.unlinkSync(path.join(PAPER_DIR, f));
        cleared.push(`downloads/paper/${f}`);
      }
    }
  }

  // 删除凭证
  if (fs.existsSync(RECEIPTS_DIR)) {
    for (const f of fs.readdirSync(RECEIPTS_DIR)) {
      if (f.endsWith(".txt")) {
        fs.unlinkSync(path.join(RECEIPTS_DIR, f));
        cleared.push(`downloads/receipts/${f}`);
      }
    }
  }

  return { cleared };
}

/** 结构化搜索结果 */
export interface PaperSearchResult {
  index: number;
  key: string;
  title: string;
  uid: string;
  keywords: string[];
  purchased: boolean;
}

export function searchPapers(query: string): PaperSearchResult[] {
  const results: PaperSearchResult[] = [];
  const keys = getPaperKeys();
  const lowerQ = query.toLowerCase();

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const paper = WEB3_PAPERS[key];
    const matchTitle = key.toLowerCase().includes(lowerQ) || lowerQ.includes(key.toLowerCase());
    const matchKeyword = paper.keywords.some(k => k.toLowerCase().includes(lowerQ));
    // 模糊匹配：拆分查询词逐个匹配
    const queryWords = lowerQ.split(/\s+/);
    const matchFuzzy = queryWords.some(w =>
      key.toLowerCase().includes(w) || paper.keywords.some(k => k.toLowerCase().includes(w))
    );

    if (matchTitle || matchKeyword || matchFuzzy) {
      results.push({
        index: i + 1,
        key,
        title: paper.title,
        uid: paper.uid,
        keywords: paper.keywords,
        purchased: purchasedUIDs.has(paper.uid),
      });
    }
  }
  return results;
}

/** 列出已购买的论文 */
export function listPurchasedPapers(): string {
  const articles = getPurchasedArticles();
  if (articles.length === 0) return "📭 暂无已购论文";

  const lines = [`📚 已购论文 (${articles.length} 篇):`, ""];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    lines.push(`${i + 1}. ${a.title}`);
    lines.push(`   交易: ${a.txHash.slice(0, 14)}...`);
    lines.push(`   关键词: ${a.keywords.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function listAvailablePapers(): string {
  const lines = ["📚 Web3 支付研究论文 (每篇 5 USDC):", ""];
  let i = 1;
  for (const [key, paper] of Object.entries(WEB3_PAPERS)) {
    const purchased = isPaperPurchased(key);
    const status = purchased ? "✅ 已购" : "❌ 待购";
    lines.push(`${i}. [${status}] ${paper.title}`);
    lines.push(`   标签: ${paper.keywords.join(", ")}`);
    if (!purchased) {
      lines.push(`   购买: 帮我买 ${i} 号论文  或  帮我买 ${key}`);
    }
    lines.push("");
    i++;
  }
  return lines.join("\n");
}

/** 根据编号获取论文 key（1-based） */
export function getPaperByIndex(index: number): string | null {
  const keys = getPaperKeys();
  const i = index - 1;
  return (i >= 0 && i < keys.length) ? keys[i] : null;
}

/** 根据名称模糊匹配论文 key */
export function findPaperByName(name: string): string | null {
  const lower = name.toLowerCase();
  for (const key of Object.keys(WEB3_PAPERS)) {
    if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) {
      return key;
    }
  }
  return null;
}

/** 根据 key 获取论文标题 */
export function getPaperTitle(key: string): string {
  return WEB3_PAPERS[key]?.title || key;
}

// ─── 论文合成引擎 ──────────────────────────────────────────

export function synthesizePaper(): string {
  // 按 UID 去重
  const seen = new Set<string>();
  const unique = purchasedArticles.filter(a => {
    const uid = getPaperUID(a.title.split(":")[0]) || a.txHash;
    if (seen.has(uid)) return false;
    seen.add(uid);
    return true;
  });

  if (unique.length === 0) {
    return "❌ 尚未购买任何论文。请先使用「帮我买论文」购买。";
  }

  const lines = [
    "═".repeat(64),
    "  📄 AI 合成论文",
    "═".repeat(64),
    "",
    `  基于 ${unique.length} 篇已购论文自动生成`,
    "",
    "─".repeat(64),
    "  标题: Web3 支付技术的现状、挑战与未来方向",
    "        —— 基于 4 篇前沿研究的综合评述",
    "─".repeat(64),
    "",
    "【摘要】",
    "本文综合分析了 4 篇 Web3 支付领域的前沿研究，覆盖抗 MEV 支付通道、",
    "稳定币跨境结算、zk-SNARK 隐私支付和 AI Agent 自主支付四大方向。",
    "通过整合各研究的实验数据和理论框架，本文提出 Web3 支付的",
    "四层技术栈模型，并讨论合规性、安全性和可扩展性三大挑战。",
    "",
    "【关键词】Web3 支付；MEV 防护；稳定币；零知识证明；AI Agent",
    "",
    "─".repeat(64),
    "  1. 引言",
    "─".repeat(64),
    "",
    "Web3 支付生态系统正在经历从「人类手动签名」到「AI Agent 自主执行」",
    "的范式转变。传统支付基础设施（SWIFT、ACH）的平均结算时间为 2-3 天，",
    "费用在 $25-45/笔（Müller & Okafor, 2024）。而基于公链的稳定币支付",
    "将结算时间降至 13 秒、费用降至 $0.02。这一数量级差异正在推动全球",
    "支付基础设施的底层重构。",
    "",
    "本文聚焦四个关键方向：(1) 支付通道的抗 MEV 设计；(2) 稳定币在跨境",
    "结算中的实证研究；(3) 零知识证明在支付隐私中的应用；(4) AI Agent",
    "作为链上经济主体的安全性框架。",
    "",
    "─".repeat(64),
    "  2. 文献综述",
    "─".repeat(64),
  ];

  // 为每篇已购论文生成综述段落
  for (let i = 0; i < unique.length; i++) {
    const a = unique[i];
    const num = i + 1;

    if (a.title.includes("Anti-MEV")) {
      lines.push(
        `  2.${num} 抗 MEV 支付通道 (Zhang et al., 2024)`,
        "",
        "Zhang 等人提出在 Layer 2 支付通道中嵌入时间锁定 + 批量结算机制，",
        "将 MEV 损失降低 87.3%。该方案的关键创新在于将批量结算 Gas 成本",
        "从 $12/笔分摊至 $0.34/笔，使高频小额支付在经济上可行。",
        "该方案已证明与 ERC-4337 标准兼容，具备实际部署条件。",
        "",
        "然而，该方案的 2-block 时间锁定窗口在 Monad 等高吞吐链上",
        "（~1s/block）可能不足以应对复杂 MEV 策略。未来需研究自适应锁定窗口。",
        "",
      );
    } else if (a.title.includes("Cross-Border")) {
      lines.push(
        `  2.${num} 稳定币跨境结算 (Müller & Okafor, 2024)`,
        "",
        "Müller 和 Okafor 基于 50,000 笔交易提供了迄今为止最全面的",
        "稳定币跨境支付实证数据。关键发现：USDC 在延迟（13.2s）、费用",
        "（$0.02）和成功率（99.8%）三个维度上均显著优于 SWIFT。",
        "",
        "但 FATF 旅行规则的合规成本（约 $0.50-1.00/笔）可能削弱",
        "稳定币的费用优势。未来需研究合规自动化方案以降低边际成本。",
        "",
      );
    } else if (a.title.includes("zk-SNARK")) {
      lines.push(
        `  2.${num} zk-SNARK 支付隐私 (Nakamoto & Vitalis, 2025)`,
        "",
        "Nakamoto 和 Vitalis 提出 ZK-Pay 协议，利用 Groth16 证明系统",
        "在 EVM 链上实现隐私支付。该方案将链上验证 Gas 压缩至 230K，",
        "证明生成时间 < 2s（浏览器 Wasm），使隐私支付在消费级设备上可行。",
        "",
        "局限：隐私集大小为 65,536（2^16），在大规模应用中仍存在",
        "匿名性衰减风险。Groth16 的可信设置也是去中心化部署的障碍。",
        "",
      );
    } else if (a.title.includes("Agentic Payment")) {
      lines.push(
        `  2.${num} AI Agent 自主支付 (Kim, Patel & Santos, 2025)`,
        "",
        "Kim 等人首次提出 Agentic Payment Framework (APF) 三层架构：",
        "意图层 (Intent) → 安全层 (Safety) → 执行层 (Execution)。",
        "数据显示 2025 Q1 AI Agent 链上交易量达 $2.7B，增速远超预期。",
        "",
        "本文提出的 5 条安全铁律——私钥不落代码、双重限额、链上兜底、",
        "人类确认、紧急开关——已成为 Agent 支付领域的事实标准。",
        "APF 框架与本项目 PayFi Agent 的架构高度一致。",
        "",
      );
    }
  }

  lines.push(
    "─".repeat(64),
    "  3. 讨论：Web3 支付的三大挑战",
    "─".repeat(64),
    "",
    "3.1 安全挑战",
    "上述 4 项研究一致指出，安全性是 Web3 支付的瓶颈。MEV 攻击、",
    "智能合约漏洞和私钥管理构成了三层威胁。Agent 支付引入了新的",
    "攻击面——LLM 幻觉可能导致误支付。Kim 等人提出的 5 条铁律",
    "为 Agent 支付安全提供了可操作的框架。",
    "",
    "3.2 合规挑战",
    "FATF 旅行规则要求超过 $1000 的交易需收集发送方/接收方 KYC 信息。",
    "这对于隐私支付协议（如 ZK-Pay）构成直接冲突——如何在满足",
    "合规要求的同时保持链上匿名性，是一个未解决的矛盾。",
    "",
    "3.3 可扩展性挑战",
    "Zhang 等人的批量结算方案将单笔 Gas 降至 $0.34，但与 Visa 的",
    "$0.001-0.003/笔仍有 100 倍差距。Layer 2 Rollup 和状态通道的",
    "进一步优化是实现 Web3 支付大规模商用的关键路径。",
    "",
    "─".repeat(64),
    "  4. 结论",
    "─".repeat(64),
    "",
    "本文综合分析了 4 篇 Web3 支付前沿研究。核心结论：",
    "",
    "1. 技术可行性已证实——稳定币支付在速度、费用和成功率上均优于传统系统",
    "2. 安全性需多层防护——链上硬顶 + 链下策略 + 人类确认三道防线",
    "3. 隐私与合规的矛盾是最大未解决问题——需零知识证明与监管科技的融合",
    "4. AI Agent 支付是确定性趋势——2026 年市场规模预计 > $20B",
    "",
    "─".repeat(64),
    "  参考文献",
    "─".repeat(64),
    "",
  );

  for (const a of unique) {
    lines.push(`[${a.title.split(":")[0].trim()}]`);
    const citeMatch = a.content.match(/引用:\s*(.+)/);
    if (citeMatch) {
      lines.push(citeMatch[1]);
    }
    lines.push(`交易凭证: ${a.txHash}`);
    lines.push("");
  }

  lines.push("─".repeat(64));
  lines.push(`生成时间: ${new Date().toISOString()}`);
  lines.push(`数据来源: ${unique.length} 篇已购买论文`);
  lines.push(`总花费: ${unique.length * 5} USDC`);
  lines.push("─".repeat(64));

  const paperText = lines.join("\n");

  // 保存到 downloads/paper/
  try {
    ensureDirs();
    const filename = `paper-${new Date().toISOString().slice(0, 10)}.md`;
    const filepath = path.join(PAPER_DIR, filename);
    fs.writeFileSync(filepath, paperText, "utf-8");
    console.log(`   📁 论文已保存: downloads/paper/${filename}`);
  } catch { /* 忽略 */ }

  return paperText;
}

// ─── 工具 ───────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
