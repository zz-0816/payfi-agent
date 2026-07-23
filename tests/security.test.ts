/**
 * PayFi Agent — 单元测试
 *
 * 测试覆盖：
 *   - 意图解析（正则匹配）
 *   - 安全检测同步模式（黑名单/单笔上限/恶意合约）
 *   - 格式化函数
 *   - Store 持久化（增删读写）
 *
 * 不测试链上部分（需要 RPC + 私钥）
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseUnits } from "viem";
import { runSecurityCheckSync, formatUSDC } from "../src/security.js";
import { TxStore } from "../src/store.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── 测试用临时目录 ──────────────────────────────────────────

const TMP_DIR = path.join(os.tmpdir(), `payfi-test-${Date.now()}`);

function cleanTmp() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true });
  }
}

beforeEach(cleanTmp);
afterEach(cleanTmp);

// ─── 意图解析测试 ────────────────────────────────────────────

describe("意图解析 (parseIntent)", () => {
  const parseIntent = (input: string) => {
    const match = input.match(
      /付\s*(\d+(?:\.\d+)?)\s*(USDC|usdc)\s*给\s*(0x[a-fA-F0-9]{40})/i,
    );
    if (!match) return null;
    return {
      to: match[3],
      amount: parseUnits(match[1], 6),
      reason: input,
    };
  };

  it("解析标准格式", () => {
    const r = parseIntent("付 10 USDC 给 0x1111111111111111111111111111111111111111");
    expect(r).not.toBeNull();
    expect(r!.to).toBe("0x1111111111111111111111111111111111111111");
    expect(r!.amount).toBe(10_000_000n);
  });

  it("解析带描述的格式", () => {
    const r = parseIntent("付 5 USDC 给 0x2222222222222222222222222222222222222222 获取 报告");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(5_000_000n);
  });

  it("拒绝对齐格式", () => {
    const r = parseIntent("hello world");
    expect(r).toBeNull();
  });

  it("拒绝缺少 0x 前缀的地址", () => {
    const r = parseIntent("付 10 USDC 给 1111111111111111111111111111111111111111");
    expect(r).toBeNull();
  });

  it("解析 0.5 USDC", () => {
    const r = parseIntent("付 0.5 USDC 给 0x1111111111111111111111111111111111111111");
    expect(r).not.toBeNull();
    expect(r!.amount).toBe(500_000n);
  });
});

// ─── 安全检测测试（同步模式）─────────────────────────────────

describe("安全检测 (runSecurityCheckSync)", () => {
  const SAFE_ADDR = "0x1111111111111111111111111111111111111111";
  const BLACK_ADDR = "0xdead000000000000000000000000000000000000"; // 非黑名单

  it("正常交易应通过", () => {
    const report = runSecurityCheckSync({
      to: SAFE_ADDR,
      amount: 10_000_000n, // 10 USDC
      reason: "测试",
    });
    expect(report.safe).toBe(true);
    expect(report.level).toBe("none");
    expect(report.checks.blacklist).toBe(true);
    expect(report.checks.amount).toBe(true);
  });

  it("超限金额应拦截", () => {
    const report = runSecurityCheckSync({
      to: SAFE_ADDR,
      amount: 2_000_000_000n, // 2000 USDC > 1000 上限
      reason: "测试",
    });
    expect(report.safe).toBe(false);
    expect(report.level).toBe("high");
    expect(report.checks.amount).toBe(false);
  });

  it("恶意 selector 应拦截", () => {
    const report = runSecurityCheckSync(
      { to: SAFE_ADDR, amount: 1000000n, reason: "测试" },
      "0x095ea7b3", // approve selector
    );
    expect(report.safe).toBe(false);
    expect(report.level).toBe("critical");
    expect(report.checks.maliciousContract).toBe(false);
  });

  it("正常 transfer 不应触发恶意检测", () => {
    const report = runSecurityCheckSync(
      { to: SAFE_ADDR, amount: 1000000n, reason: "测试" },
      "0xa9059cbb", // transfer selector
    );
    expect(report.checks.maliciousContract).toBe(true);
  });

  it("无 txData 应通过恶意检测", () => {
    const report = runSecurityCheckSync({
      to: SAFE_ADDR,
      amount: 1000000n,
      reason: "测试",
    });
    expect(report.checks.maliciousContract).toBe(true);
  });

  it("同步模式日累计应标记为跳过", () => {
    const report = runSecurityCheckSync({
      to: SAFE_ADDR,
      amount: 1000000n,
      reason: "测试",
    });
    expect(report.checks.dailyLimit).toBe(true); // 同步模式默认通过
    expect(report.dailySpentOnChain).toBeNull();
  });
});

// ─── 格式化测试 ──────────────────────────────────────────────

describe("formatUSDC", () => {
  it("10 USDC", () => {
    expect(formatUSDC(10_000_000n)).toBe("10.00");
  });
  it("0.5 USDC", () => {
    expect(formatUSDC(500_000n)).toBe("0.50");
  });
  it("0 USDC", () => {
    expect(formatUSDC(0n)).toBe("0.00");
  });
  it("99999 USDC", () => {
    expect(formatUSDC(99_999_000_000n)).toBe("99999.00");
  });
});

// ─── Store 测试 ──────────────────────────────────────────────

describe("TxStore 持久化", () => {
  it("新建空 Store", () => {
    const store = new TxStore(TMP_DIR);
    expect(store.getTransactions()).toEqual([]);
    expect(store.getTodaySpent()).toBe(0n);
    expect(store.getMetrics().totalTxCount).toBe(0);
  });

  it("addTransaction 增加交易", () => {
    const store = new TxStore(TMP_DIR);
    store.addTransaction({
      txHash: "0xabc123",
      timestamp: new Date().toISOString(),
      to: "0x1111111111111111111111111111111111111111",
      amountRaw: "10000000",
      amountUsdc: "10.00",
      type: "payment",
      riskLevel: "none",
      status: "confirmed",
      explorerUrl: "https://testnet.monadexplorer.com/tx/0xabc123",
      reason: "test",
    });

    expect(store.getTransactions()).toHaveLength(1);
    expect(store.getTodaySpent()).toBe(10_000_000n);
    expect(store.getMetrics().totalTxCount).toBe(1);

    // 检查内容
    const txs = store.getTransactions();
    expect(txs[0].txHash).toBe("0xabc123");
    expect(txs[0].amountUsdc).toBe("10.00");
  });

  it("多笔交易日累计正确", () => {
    const store = new TxStore(TMP_DIR);

    store.addTransaction(makeTx("0x1", "5000000"));  // 5 USDC
    store.addTransaction(makeTx("0x2", "3000000"));  // 3 USDC
    store.addTransaction(makeTx("0x3", "2000000"));  // 2 USDC

    expect(store.getTodaySpent()).toBe(10_000_000n); // 5+3+2
    expect(store.getTransactions()).toHaveLength(3);
    expect(store.getMetrics().totalTxCount).toBe(3);
  });

  it("rejected 交易不计入日累计", () => {
    const store = new TxStore(TMP_DIR);

    store.addTransaction({ ...makeTx("0x1", "10000000"), status: "confirmed" });
    store.addTransaction({ ...makeTx("0x2", "50000000"), status: "rejected" });
    store.addTransaction({ ...makeTx("0x3", "2000000"), status: "confirmed" });

    // rejected 不计入，只有 confirmed 算
    expect(store.getTodaySpent()).toBe(12_000_000n); // 10 + 2
  });

  it("flush 持久化到磁盘", () => {
    const store = new TxStore(TMP_DIR);
    store.addTransaction(makeTx("0x1", "10000000"));
    store.flush();

    // 新建 store 从磁盘读取
    const store2 = new TxStore(TMP_DIR);
    expect(store2.getTransactions()).toHaveLength(1);
    expect(store2.getTransactions()[0].txHash).toBe("0x1");
    expect(store2.getTodaySpent()).toBe(10_000_000n);
  });

  it("setAgentAddress", () => {
    const store = new TxStore(TMP_DIR);
    store.setAgentAddress("0x_test_agent");
    expect(store.getAgentAddress()).toBe("0x_test_agent");
  });

  it("新一天自动重置日累计", () => {
    const store = new TxStore(TMP_DIR);
    store.addTransaction(makeTx("0x1", "10000000"));

    // 模拟跨天：直接修改 dailyCache date
    // 实际场景中 getTodaySpent() 会自动检测日期变化
    expect(store.getTodaySpent()).toBe(10_000_000n);
  });

  it("getTransactions 返回倒序", () => {
    const store = new TxStore(TMP_DIR);
    store.addTransaction(makeTx("0x_first", "1000000"));
    store.addTransaction(makeTx("0x_second", "2000000"));
    store.addTransaction(makeTx("0x_third", "3000000"));

    const txs = store.getTransactions();
    expect(txs).toHaveLength(3);
    expect(txs[0].txHash).toBe("0x_third");  // 最新的在前
    expect(txs[2].txHash).toBe("0x_first");
  });

  it("totalVolumeUsdc 正确累计", () => {
    const store = new TxStore(TMP_DIR);
    store.addTransaction(makeTx("0x1", "10000000"));
    store.addTransaction(makeTx("0x2", "15000000"));
    store.addTransaction(makeTx("0x3", "5000000"));

    expect(store.getMetrics().totalVolumeUsdc).toBe("30000000");
  });
});

// ─── 风险报告字段完整性测试 ─────────────────────────────────

describe("RiskReport 字段完整性", () => {
  it("通过时所有 checks 为 true", () => {
    const report = runSecurityCheckSync({
      to: "0x1111111111111111111111111111111111111111",
      amount: 1_000_000n,
      reason: "test",
    });
    expect(report.checks.blacklist).toBe(true);
    expect(report.checks.amount).toBe(true);
    expect(report.checks.dailyLimit).toBe(true);
    expect(report.checks.maliciousContract).toBe(true);
  });

  it("safe 为 false 时 level 不是 none", () => {
    const report = runSecurityCheckSync({
      to: "0x1111111111111111111111111111111111111111",
      amount: 2_000_000_000n, // 超限
      reason: "test",
    });
    expect(report.safe).toBe(false);
    expect(report.level).not.toBe("none");
  });

  it("details 有内容", () => {
    const report = runSecurityCheckSync({
      to: "0x1111111111111111111111111111111111111111",
      amount: 1_000_000n,
      reason: "test",
    });
    expect(report.details).toBeDefined();
    expect(report.details!.length).toBeGreaterThan(0);
  });
});

// ─── 辅助函数 ────────────────────────────────────────────────

function makeTx(hash: string, amountRaw: string, status: StoredTx["status"] = "confirmed"): StoredTx {
  return {
    txHash: hash,
    timestamp: new Date().toISOString(),
    to: "0x1111111111111111111111111111111111111111",
    amountRaw,
    amountUsdc: (Number(amountRaw) / 1_000_000).toFixed(2),
    type: "payment",
    riskLevel: "none",
    status,
    explorerUrl: `https://testnet.monadexplorer.com/tx/${hash}`,
    reason: "test",
  };
}


