/**
 * PayFi Agent — 持久化存储层
 *
 * 本地 JSON 文件存储 + 链上交叉校验。
 * 目录：.payfi-data/store.json
 *
 * 职责：
 *   1. 交易历史持久化（重启不丢）
 *   2. 日累计本地缓存（链上查询失败时兜底）
 *   3. 链上交叉校验（启动时验证本地记录是否与链上匹配）
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createPublicClient, http, parseAbiItem, type Address, type Hash } from "viem";
import { monadTestnet } from "./wallet.js";
import { USDC_ADDRESS, RPC_URL } from "./config.js";

// ─── 类型 ────────────────────────────────────────────────────

export interface StoredTx {
  txHash: string;
  timestamp: string;
  to: string;
  amountRaw: string;
  amountUsdc: string;
  type: "payment" | "data_payment";
  riskLevel: string;
  status: "confirmed" | "failed" | "rejected" | "pending";
  explorerUrl: string;
  reason: string;
  gasUsed?: string;
  /** 该笔交易发生时链上日累计（用于审计） */
  dailySpentAtTime?: string;
}

export interface TxStoreData {
  version: 1;
  agentAddress: string;
  createdAt: string;
  updatedAt: string;
  transactions: StoredTx[];
  /** 今日日期 (YYYY-MM-DD UTC) 对应的本地累计 */
  dailyCache: {
    date: string;
    amount: string; // raw bigint as string
    lastTxHash: string | null;
  };
  meta: {
    totalTxCount: number;
    totalVolumeUsdc: string;
    lastSyncedBlock: number;
  };
}

// ─── Store 类 ────────────────────────────────────────────────

export class TxStore {
  private filePath: string;
  private data: TxStoreData;
  private dirty = false;

  constructor(workspaceDir?: string) {
    const dir = workspaceDir || path.join(process.cwd(), ".payfi-data");
    this.filePath = path.join(dir, "store.json");
    this.data = this.load();
  }

  // ── 文件 I/O ─────────────────────────────────────────────

  private load(): TxStoreData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(raw) as TxStoreData;
      }
    } catch (err) {
      console.warn("⚠️  读取 store.json 失败，使用新存储:", (err as Error).message);
    }
    return this.createEmpty();
  }

  private createEmpty(): TxStoreData {
    const now = new Date().toISOString();
    return {
      version: 1,
      agentAddress: "",
      createdAt: now,
      updatedAt: now,
      transactions: [],
      dailyCache: { date: this.todayUTC(), amount: "0", lastTxHash: null },
      meta: { totalTxCount: 0, totalVolumeUsdc: "0", lastSyncedBlock: 0 },
    };
  }

  save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.data.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
      this.dirty = false;
    } catch (err) {
      console.error("❌ 保存 store.json 失败:", (err as Error).message);
    }
  }

  private todayUTC(): string {
    return new Date().toISOString().slice(0, 10);
  }

  // ── Agent 配置 ──────────────────────────────────────────

  setAgentAddress(addr: string): void {
    this.data.agentAddress = addr;
    this.dirty = true;
  }

  getAgentAddress(): string {
    return this.data.agentAddress;
  }

  // ── 交易记录 ────────────────────────────────────────────

  addTransaction(tx: StoredTx): void {
    // 兜底：确保 dailyCache 日期正确
    const today = this.todayUTC();
    if (this.data.dailyCache.date !== today) {
      this.data.dailyCache = { date: today, amount: "0", lastTxHash: null };
    }

    // 更新日累计
    if (tx.status === "confirmed") {
      const current = BigInt(this.data.dailyCache.amount);
      this.data.dailyCache.amount = (current + BigInt(tx.amountRaw)).toString();
      this.data.dailyCache.lastTxHash = tx.txHash;
    }

    // 添加交易
    this.data.transactions.push(tx);
    this.data.meta.totalTxCount = this.data.transactions.length;

    // 更新总量
    const total = BigInt(this.data.meta.totalVolumeUsdc) + BigInt(tx.amountRaw);
    this.data.meta.totalVolumeUsdc = total.toString();

    this.dirty = true;
  }

  getTransactions(limit = 20): StoredTx[] {
    return this.data.transactions.slice(-limit).reverse();
  }

  getTodaySpent(): bigint {
    const today = this.todayUTC();
    if (this.data.dailyCache.date !== today) {
      // 新的一天，重置
      this.data.dailyCache = { date: today, amount: "0", lastTxHash: null };
      this.dirty = true;
      return 0n;
    }
    return BigInt(this.data.dailyCache.amount);
  }

  getMetrics() {
    return { ...this.data.meta };
  }

  // ── 链上交叉校验 ────────────────────────────────────────

  /**
   * 启动时交叉校验：对比本地日累计 vs 链上真实累计
   *
   * 如果本地记录的日累计与链上不一致 → 用链上数据修正本地（链不说谎）
   * 返回校验报告
   */
  async crossValidate(agentAddress: Address): Promise<{
    consistent: boolean;
    localDaily: bigint;
    chainDaily: bigint;
    diff: bigint;
    fixed: boolean;
    message: string;
  }> {
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(RPC_URL),
    });

    const localDaily = this.getTodaySpent();

    try {
      // 查链上今日 Transfer 事件
      const now = new Date();
      const secondsSinceMidnight =
        now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
      const currentBlock = await publicClient.getBlockNumber();
      const fromBlock = currentBlock - BigInt(secondsSinceMidnight);

      const logs = await publicClient.getLogs({
        address: USDC_ADDRESS as Address,
        event: parseAbiItem(
          "event Transfer(address indexed from, address indexed to, uint256 value)",
        ),
        args: { from: agentAddress },
        fromBlock: fromBlock > 0n ? fromBlock : 0n,
        toBlock: currentBlock,
      });

      const chainDaily = logs.reduce(
        (sum, log) => sum + ((log.args as any).value || 0n),
        0n,
      );

      const consistent = chainDaily === localDaily;
      const diff = chainDaily > localDaily ? chainDaily - localDaily : localDaily - chainDaily;

      let fixed = false;
      let message: string;

      if (consistent) {
        message = `✅ 本地记录与链上一致 (${this.formatUsdc(chainDaily)} USDC)`;
      } else {
        // 链上为准，修正本地
        this.data.dailyCache.amount = chainDaily.toString();
        this.dirty = true;
        fixed = true;
        message = `⚠️ 本地记录 (${this.formatUsdc(localDaily)} USDC) 与链上 (${this.formatUsdc(chainDaily)} USDC) 不一致，已用链上数据修正`;
      }

      // 更新同步区块
      this.data.meta.lastSyncedBlock = Number(currentBlock);
      this.dirty = true;

      return { consistent, localDaily, chainDaily, diff, fixed, message };
    } catch (err) {
      return {
        consistent: false,
        localDaily,
        chainDaily: 0n,
        diff: localDaily,
        fixed: false,
        message: `⚠️ 链上校验失败，保持本地记录: ${(err as Error).message}`,
      };
    }
  }

  private formatUsdc(raw: bigint): string {
    return (Number(raw) / 1_000_000).toFixed(2);
  }

  // ── 生命周期 ────────────────────────────────────────────

  /** 确保数据落盘 */
  flush(): void {
    if (this.dirty) this.save();
  }
}
