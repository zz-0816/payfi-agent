/**
 * PayFi Agent — 配置文件（独立版本，无 MOSS 依赖）
 */

// ── 用户身份 ──────────────────────────────────────────────

/** 课程专用钱包地址 */
export const USER_ADDRESS = "0xdDF3fE9FCC5514e7B791c8c2DDC21a1E01da492B";

// ── .env 自动加载 ────────────────────────────────────────

try {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const envPath = path.join(import.meta.dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [k, ...v] = trimmed.split("=");
        const key = k.trim();
        const value = v.join("=").trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) process.env[key] = value;
      }
    }
  }
} catch { /* fs 不可用时跳过 */ }

// ── 网络 ──────────────────────────────────────────────────

export const RPC_URL = "https://testnet-rpc.monad.xyz";
export const CHAIN_ID = 10143;

// ── USDC 代币（Monad Testnet）─────────────────────────────

/** USDC 合约地址（待从 Monad Testnet 确认官方地址） */
export const USDC_ADDRESS = "0x21ae066215a44c09dd9aedd4bada4892a8ea16cd";
export const USDC_DECIMALS = 6;

// ── 安全规则 ──────────────────────────────────────────────

/** 单笔交易上限（1000 USDC） */
export const MAX_SINGLE_TX_USDC = 1_000_000_000n;

/** 日累计交易上限（5000 USDC） */
export const MAX_DAILY_USDC = 5_000_000_000n;

export const BLACKLISTED_ADDRESSES: string[] = [];

// ── 钱包（⚠️ 仅限 Monad Testnet）────────────────────────

export function getPrivateKey(): `0x${string}` | null {
  const key = process.env.PAYFI_PRIVATE_KEY || "";
  if (!key || !key.startsWith("0x") || key.length !== 66) return null;
  return key as `0x${string}`;
}

export function isAutoSignEnabled(): boolean {
  return getPrivateKey() !== null;
}

// ── 恶意合约检测 ──────────────────────────────────────────

export const SUSPICIOUS_SELECTORS: string[] = [
  "0x095ea7b3", // approve
  "0x23b872dd", // transferFrom
  "0x42966c68", // burn
  "0x06fdde03", // name
];

export const ENABLE_MALICIOUS_CONTRACT_CHECK = true;
