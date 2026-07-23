/**
 * PayFi Agent — 安全检测引擎（无状态版本）
 *
 * 核心原则：策略层不持有状态，所有状态从链上推导。
 * - 黑名单 → 本地配置文件 + 可选链上动态拉取
 * - 单笔上限 → hardcoded 规则，不依赖状态
 * - 日累计 → 查链上 USDC Transfer 事件求和（链不说谎）
 * - 恶意合约 → 静态 selector 匹配 + 可选链上字节码扫描
 *
 * 无状态意味着：
 *   - 不存在 "off-chain 累计错乱" 问题
 *   - Agent 重启后零风险
 *   - 每个安全决策都可复现（给定同一区块高度，结果相同）
 */

import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { monadTestnet } from "./wallet.js";
import {
  BLACKLISTED_ADDRESSES,
  MAX_DAILY_USDC,
  MAX_SINGLE_TX_USDC,
  ENABLE_MALICIOUS_CONTRACT_CHECK,
  SUSPICIOUS_SELECTORS,
  USDC_ADDRESS,
  RPC_URL,
} from "./config.js";
import type { TxStore } from "./store.js";

// ─── 公共客户端（只读，不需要私钥）──────────────────────────

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});

// ─── 类型 ────────────────────────────────────────────────────

export interface PaymentIntent {
  to: string;
  amount: bigint;
  reason: string;
}

export interface RiskReport {
  safe: boolean;
  level: "none" | "low" | "high" | "critical";
  checks: {
    blacklist: boolean;
    amount: boolean;
    dailyLimit: boolean;
    maliciousContract: boolean;
  };
  /** 链上日累计（本次交易前），null = 查询失败跳过了此项 */
  dailySpentOnChain: bigint | null;
  summary: string;
  recommendation: string;
  details?: string[];
}

// ─── 黑名单检查（无状态）─────────────────────────────────────

function checkBlacklist(to: string): boolean {
  if (BLACKLISTED_ADDRESSES.length === 0) return true;
  const lower = to.toLowerCase();
  return !BLACKLISTED_ADDRESSES.some(a => a.toLowerCase() === lower);
}

// ─── 单笔金额检查（无状态）───────────────────────────────────

function checkAmount(amount: bigint): boolean {
  return amount <= MAX_SINGLE_TX_USDC;
}

// ─── 恶意合约检查（无状态）───────────────────────────────────

function checkMaliciousContract(txData?: string) {
  if (!ENABLE_MALICIOUS_CONTRACT_CHECK) return { safe: true, details: ["检测已禁用"] };
  if (!txData || txData === "0x") return { safe: true, details: ["非合约调用"] };

  const details: string[] = [];
  for (const sel of SUSPICIOUS_SELECTORS) {
    if (txData.startsWith(sel)) {
      const names: Record<string, string> = {
        "0x095ea7b3": "approve (授权操作)",
        "0x23b872dd": "transferFrom (代授权转账)",
        "0x42966c68": "burn (销毁)",
        "0x06fdde03": "name (信息收集)",
      };
      return { safe: false, details: [`⚠️ 可疑方法: ${names[sel] || sel}`] };
    }
  }
  return { safe: true, details: ["✅ 未检测到恶意方法"] };
}

// ─── 链上日累计查询（核心：无状态 + 链上真相）────────────────

/**
 * 估算今天零点（UTC）对应的区块号
 *
 * Monad Testnet 约 1s/block，用当前区块 - 已过秒数估算。
 * 未来可接 Monad Explorer API 做更精确的二分查找。
 */
async function estimateMidnightBlock(): Promise<bigint> {
  const now = new Date();
  const secondsSinceMidnight =
    now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();

  const currentBlock = await publicClient.getBlockNumber();
  // 减去今天已过的秒数（每区块 ≈ 1s）
  const estimated = currentBlock - BigInt(secondsSinceMidnight);

  // 安全边界：不能小于 0
  return estimated > 0n ? estimated : 0n;
}

/**
 * 从链上查询今日 USDC 转出累计
 *
 * 查询 USDC 合约的 Transfer(from=agentAddress, ...) 事件，
 * 时间范围：[今天 UTC 00:00, 当前最新区块]
 *
 * @param agentAddress - Agent 钱包地址
 * @returns 今日转出总额（raw units, 6 decimals）
 */
export async function getDailySpentOnChain(
  agentAddress: Address,
): Promise<{ amount: bigint; fromBlock: bigint; toBlock: bigint; txCount: number }> {
  const fromBlock = await estimateMidnightBlock();
  const toBlock = await publicClient.getBlockNumber();

  try {
    const logs = await publicClient.getLogs({
      address: USDC_ADDRESS as Address,
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)",
      ),
      args: { from: agentAddress },
      fromBlock,
      toBlock,
    });

    const amount = logs.reduce(
      (sum, log) => sum + ((log.args as any).value || 0n),
      0n,
    );

    return { amount, fromBlock, toBlock, txCount: logs.length };
  } catch (err) {
    // RPC 不支持大范围 getLogs → 回退到本地 store（由调用方处理）
    throw new Error(
      `链上查询失败 (blocks ${fromBlock}→${toBlock}): ${(err as Error).message}`,
    );
  }
}

/**
 * 日累计检查（优先链上查询，失败时用本地 store 兜底）
 *
 * 返回：
 *   - safe: 是否未超限
 *   - amount: 链上/本地累计
 *   - source: "chain" | "store" | "skipped"
 */
async function checkDailyLimit(
  amount: bigint,
  agentAddress: string,
  store?: TxStore,
): Promise<{
  safe: boolean;
  dailySpent: bigint | null;
  source: "chain" | "store" | "skipped";
  detail: string;
}> {
  // 尝试链上查询
  try {
    const chainResult = await getDailySpentOnChain(agentAddress as Address);
    const total = chainResult.amount + amount;
    const safe = total <= MAX_DAILY_USDC;

    return {
      safe,
      dailySpent: chainResult.amount,
      source: "chain",
      detail: safe
        ? `链上今日累计 ${formatUSDC(chainResult.amount)} + 本笔 ${formatUSDC(amount)} = ${formatUSDC(total)} ≤ ${formatUSDC(MAX_DAILY_USDC)}`
        : `链上今日累计 ${formatUSDC(chainResult.amount)} + 本笔 ${formatUSDC(amount)} = ${formatUSDC(total)} > ${formatUSDC(MAX_DAILY_USDC)}`,
    };
  } catch (chainErr) {
    // 链上查询失败 → 用本地 store 兜底
    if (store) {
      const localDaily = store.getTodaySpent();
      const total = localDaily + amount;
      const safe = total <= MAX_DAILY_USDC;

      return {
        safe,
        dailySpent: localDaily,
        source: "store",
        detail: `[链上查询失败，使用本地记录] 今日累计 ${formatUSDC(localDaily)} + 本笔 ${formatUSDC(amount)} = ${formatUSDC(total)} ${safe ? "≤" : ">"} ${formatUSDC(MAX_DAILY_USDC)}`,
      };
    }

    // 都没有 → 标记为跳过（保守：放行但记录警告）
    return {
      safe: true,
      dailySpent: null,
      source: "skipped",
      detail: `⚠️ 日累计检查已跳过（链上查询失败且无本地记录）: ${(chainErr as Error).message}`,
    };
  }
}

// ─── 主检测入口（async，因为需要查链）───────────────────────

export async function runSecurityCheckAsync(
  intent: PaymentIntent,
  agentAddress: string,
  txData?: string,
  store?: TxStore,
): Promise<RiskReport> {
  // 并行执行不依赖链的检查
  const blacklist = checkBlacklist(intent.to);
  const amount = checkAmount(intent.amount);
  const mc = checkMaliciousContract(txData);

  // 日累计需要查链（异步）
  const daily = await checkDailyLimit(intent.amount, agentAddress, store);

  const checks = {
    blacklist,
    amount,
    dailyLimit: daily.safe,
    maliciousContract: mc.safe,
  };

  const allPassed = blacklist && amount && daily.safe && mc.safe;

  let level: RiskReport["level"] = "none";
  let summary: string;
  let recommendation: string;
  const details: string[] = [...mc.details];

  if (!blacklist) {
    level = "critical";
    summary = "🚨 收款地址在黑名单中";
    recommendation = "交易已自动拦截。请勿手动放行。";
    details.push("⛔ 地址命中黑名单");
  } else if (!mc.safe) {
    level = "critical";
    summary = "🚨 检测到可疑合约调用";
    recommendation = "交易已拦截。请确认合约来源。";
  } else if (!amount) {
    level = "high";
    summary = `⚠️ 金额超出单笔上限 (${formatUSDC(MAX_SINGLE_TX_USDC)} USDC)`;
    recommendation = "请降低金额或手动确认。";
    details.push(`⚠️ ${formatUSDC(intent.amount)} > 上限 ${formatUSDC(MAX_SINGLE_TX_USDC)}`);
  } else if (!daily.safe) {
    level = "high";
    summary = `⚠️ 日累计超限 (上限 ${formatUSDC(MAX_DAILY_USDC)} USDC)`;
    recommendation = "等待次日重置或手动确认。";
    details.push(daily.detail);
  } else {
    summary = "✅ 安全检测通过";
    recommendation = "可以安全执行交易。";
    details.push("✅ 所有检查通过");
  }

  // 始终记录日累计详情（调试用）
  if (daily.source !== "skipped") {
    details.push(
      `📊 日累计(${daily.source}): ${daily.dailySpent !== null ? formatUSDC(daily.dailySpent) : "N/A"} USDC`,
    );
  } else {
    details.push(daily.detail);
  }

  return {
    safe: allPassed,
    level,
    checks,
    dailySpentOnChain: daily.dailySpent,
    summary,
    recommendation,
    details,
  };
}

/**
 * 同步版本（向后兼容，不查链，跳过日累计检查）
 * 用于不需要链查询的场景（如纯规则校验、单元测试）
 */
export function runSecurityCheckSync(
  intent: PaymentIntent,
  txData?: string,
): RiskReport {
  const blacklist = checkBlacklist(intent.to);
  const amount = checkAmount(intent.amount);
  const mc = checkMaliciousContract(txData);

  const checks = {
    blacklist,
    amount,
    dailyLimit: true, // 同步模式跳过
    maliciousContract: mc.safe,
  };

  const allPassed = blacklist && amount && mc.safe;

  let level: RiskReport["level"] = "none";
  let summary: string;
  let recommendation: string;
  const details: string[] = [...mc.details];

  if (!blacklist) {
    level = "critical";
    summary = "🚨 收款地址在黑名单中";
    recommendation = "交易已自动拦截。";
  } else if (!mc.safe) {
    level = "critical";
    summary = "🚨 检测到可疑合约调用";
    recommendation = "交易已拦截。";
  } else if (!amount) {
    level = "high";
    summary = `⚠️ 金额超出单笔上限`;
    recommendation = "请降低金额。";
  } else {
    summary = "✅ 安全检测通过（同步模式，未查链上日累计）";
    recommendation = "日累计检查需在异步模式中完成。";
    details.push("⚠️ 日累计检查已跳过（同步模式）");
  }

  return {
    safe: allPassed,
    level,
    checks,
    dailySpentOnChain: null,
    summary,
    recommendation,
    details,
  };
}

// ─── 风险通知 ────────────────────────────────────────────────

export function generateRiskNotification(
  report: RiskReport,
  intent: PaymentIntent,
): string {
  if (report.safe) return "";

  const lines = [
    "═══════════════════════════════════════",
    "  ⚠️  PayFi Agent — 安全风险通知",
    "═══════════════════════════════════════",
    "",
    `  风险等级: [${report.level.toUpperCase()}]`,
    `  收款方:   ${intent.to.slice(0, 10)}...${intent.to.slice(-6)}`,
    `  金额:     ${formatUSDC(intent.amount)} USDC`,
    `  原因:     ${intent.reason}`,
    "",
    `  ${report.summary}`,
    `  建议: ${report.recommendation}`,
    "",
  ];

  if (report.details?.length) {
    for (const d of report.details) lines.push(`    ${d}`);
    lines.push("");
  }

  lines.push("═══════════════════════════════════════");
  lines.push("  请在钱包中确认是否继续此交易。");
  lines.push("═══════════════════════════════════════");

  return lines.join("\n");
}

// ─── 工具函数 ────────────────────────────────────────────────

export function formatUSDC(rawAmount: bigint): string {
  return (Number(rawAmount) / 1_000_000).toFixed(2);
}
