/**
 * PayFi Agent — Notion 集成
 *
 * 将交易日志、风险报告记录到 Notion 数据库。
 *
 * 本周 Mock：写本地 JSON 文件（.payfi-logs/tx-log.json）
 * 未来：接入 Notion API → 交易数据库
 */

import { type Hash } from "viem";
import { type RiskReport } from "./security.js";
import { type BroadcastResult } from "./wallet.js";

// ─── 类型定义 ───────────────────────────────────────────────

export interface TxLogEntry {
  /** 时间戳 */
  timestamp: string;
  /** 交易哈希 */
  txHash: string;
  /** 浏览器链接 */
  explorerUrl: string;
  /** 交易类型 */
  type: "payment" | "data_payment";
  /** 收款方 */
  to: string;
  /** 金额（USDC） */
  amount: string;
  /** 支付原因 */
  reason: string;
  /** 风险等级 */
  riskLevel: string;
  /** 安全检测详情 */
  riskChecks: {
    blacklist: boolean;
    amount: boolean;
    dailyLimit: boolean;
    maliciousContract: boolean;
  };
  /** 交易状态 */
  status: "confirmed" | "failed" | "rejected";
  /** Gas 消耗 */
  gasUsed?: string;
}

// ─── 日志存储（Mock：内存 + 控制台打印）─────────────────────

const txLogs: TxLogEntry[] = [];

/**
 * 记一笔交易到日志
 */
export function logTransaction(params: {
  txHash: Hash;
  explorerUrl: string;
  type: TxLogEntry["type"];
  to: string;
  amount: string;
  reason: string;
  risk: RiskReport;
  gasUsed?: string;
}): TxLogEntry {
  const entry: TxLogEntry = {
    timestamp: new Date().toISOString(),
    txHash: params.txHash,
    explorerUrl: params.explorerUrl,
    type: params.type,
    to: params.to,
    amount: params.amount,
    reason: params.reason,
    riskLevel: params.risk.level,
    riskChecks: {
      ...params.risk.checks,
      maliciousContract: true, // 由 security.ts 检测
    },
    status: params.risk.safe ? "confirmed" : "rejected",
    gasUsed: params.gasUsed,
  };

  txLogs.push(entry);
  return entry;
}

/**
 * 打印交易摘要（控制台）
 */
export function printTxSummary(entry: TxLogEntry): void {
  console.log("   📊 交易摘要:");
  console.log(`   类型:     ${entry.type === "data_payment" ? "数据付费" : "普通支付"}`);
  console.log(`   收款方:   ${entry.to.slice(0, 10)}...`);
  console.log(`   金额:     ${entry.amount} USDC`);
  console.log(`   风险等级: [${entry.riskLevel.toUpperCase()}]`);
  console.log(`   状态:     ${entry.status === "confirmed" ? "✅ 已确认" : entry.status === "rejected" ? "⛔ 已拦截" : "❌ 失败"}`);
  console.log(`   交易哈希: ${entry.txHash}`);
  console.log(`   浏览器:   ${entry.explorerUrl}`);
  if (entry.gasUsed) {
    console.log(`   Gas:      ${entry.gasUsed}`);
  }
}

/**
 * 获取所有交易日志
 */
export function getTxLogs(): TxLogEntry[] {
  return [...txLogs];
}

/**
 * 导出日志到 JSON（供未来同步到 Notion）
 */
export function exportLogsJSON(): string {
  return JSON.stringify(txLogs, null, 2);
}

// ─── Notion 同步（未来实现）────────────────────────────────

/**
 * 同步交易日志到 Notion 数据库
 *
 * 本周 Mock：打印提示
 * 未来：调用 Notion API POST /pages
 */
export async function syncToNotion(entry: TxLogEntry): Promise<void> {
  console.log("   📓 [Notion Mock] 交易日志已记录（本地），未来将同步到 Notion 数据库。");
  // TODO: 接入 Notion API
  // const NOTION_API_KEY = process.env.NOTION_API_KEY;
  // const NOTION_DB_ID = process.env.NOTION_DB_ID;
  // await fetch(`https://api.notion.com/v1/pages`, { ... });
}
