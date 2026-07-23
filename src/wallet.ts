/**
 * PayFi Agent — 钱包模块
 *
 * 用 viem 实现真实签名 + 广播交易。
 * ⚠️ 仅限 Monad Testnet（Chain ID 10143）——测试币无真实价值。
 * 生产环境私钥绝不落地代码。
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import { RPC_URL, CHAIN_ID } from "./config.js";

// ─── Monad Testnet 链定义 ──────────────────────────────────

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

// ─── 私钥加载 ───────────────────────────────────────────────

/** 从环境变量加载测试网私钥 */
function loadPrivateKey(): `0x${string}` {
  const key = process.env.PAYFI_PRIVATE_KEY || "";
  if (!key) {
    throw new Error(
      "❌ 缺少 PAYFI_PRIVATE_KEY 环境变量。\n" +
        "   请设置: export PAYFI_PRIVATE_KEY=\"0x你的Monad测试网私钥\"",
    );
  }
  if (!key.startsWith("0x") || key.length !== 66) {
    throw new Error("❌ PAYFI_PRIVATE_KEY 格式无效，应为 0x + 64 位十六进制字符");
  }
  return key as `0x${string}`;
}

// ─── Signer 客户端 ──────────────────────────────────────────

/** 创建 viem WalletClient（签名 + 广播用） */
export function createSigner() {
  const key = loadPrivateKey();
  const account = privateKeyToAccount(key);

  const client = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(RPC_URL),
  });

  return { account, client };
}

// ─── 交易签名 + 广播 ────────────────────────────────────────

export interface BroadcastResult {
  /** 交易哈希 */
  txHash: Hash;
  /** 链上收据 */
  receipt: TransactionReceipt;
  /** 浏览器链接 */
  explorerUrl: string;
}

/**
 * 签名并广播一笔交易
 *
 * @param to - 目标合约地址
 * @param data - 编码后的交易 data
 * @param value - 原生币金额（USDC transfer 时为 0n）
 * @returns 广播结果（txHash + receipt + explorer 链接）
 */
export async function signAndBroadcast(
  to: Address,
  data: `0x${string}`,
  value: bigint = 0n,
): Promise<BroadcastResult> {
  const { account, client } = createSigner();
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(RPC_URL),
  });

  console.log("   🔑 使用测试网私钥签名...");
  console.log(`   📡 发送方: ${account.address}`);

  const txHash = await client.sendTransaction({
    account,
    to,
    data,
    value,
    chain: monadTestnet,
  });

  console.log(`   📡 交易已广播: ${txHash}`);

  // 等待交易确认
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000, // 60 秒超时
  });

  const explorerUrl = `${monadTestnet.blockExplorers!.default.url}/tx/${txHash}`;

  if (receipt.status === "success") {
    console.log(`   ✅ 交易已确认! ${explorerUrl}`);
  } else {
    console.log(`   ⚠️ 交易已上链但执行失败: ${explorerUrl}`);
  }

  return { txHash, receipt, explorerUrl };
}

// ─── USDC 余额查询 ──────────────────────────────────────────

/**
 * 查询地址的 USDC 余额（Mock：本周用公开 RPC call）
 */
export async function getUSDCBalance(
  usdcAddress: Address,
  ownerAddress: Address,
): Promise<bigint> {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(RPC_URL),
  });

  const balance = await publicClient.readContract({
    address: usdcAddress,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ name: "balance", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [ownerAddress],
  });

  return balance as bigint;
}
