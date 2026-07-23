---
name: payfi-agent
description: PayFi Agent 项目专属技能 — AI 稳定币支付助手。白话输入驱动，无状态安全引擎，持久化存储。
category: web3
tags: [payfi, stablecoin, agent, monad, usdc, llm, rag]
---

# PayFi Agent — 项目技能

## 项目概述

PayFi Agent 是一个基于 Monad Testnet 的 AI 稳定币支付助手。
用户通过**自然语言（白话）**下达指令，Agent 自动完成：
意图解析 → 安全检测 → 链上签名广播 → 付费内容获取 → 持久化日志。

核心场景：Agent 使用 USDC 购买付费数据（论文/API/报告），
自动执行支付并获取内容，保存到本地工作目录。

## 技术栈

| 层 | 技术 |
|----|------|
| 区块链交互 | viem (WalletClient + PublicClient) |
| 网络 | Monad Testnet (Chain ID 10143) |
| 代币 | MockUSDC (ERC-20, 6 decimals) |
| 安全引擎 | 无状态规则引擎 (黑名单 + 单笔限额 + 链上日累计 + 恶意合约检测) |
| 持久化 | JSON 文件存储 (.payfi-data/) |
| 内容获取 | Mock 数据源 (未来接真实 API + LLM 生成) |
| 运行时 | Node.js + TypeScript (tsx) |

## 项目结构

```
payfi-agent/
├── src/
│   ├── agent.ts          # 主入口（6-step 流程）
│   ├── repl.ts           # 交互式 REPL（支持白话输入）
│   ├── config.ts         # 配置 (RPC/地址/安全规则/.env 加载)
│   ├── security.ts       # 无状态安全引擎（链上日累计查询）
│   ├── wallet.ts         # 钱包模块（viem 签名+广播）
│   ├── store.ts          # 持久化存储（交易历史 + 链上交叉校验）
│   ├── data-payment.ts   # 数据付费（论文库 + 合成引擎 + 文件下载）
│   └── notion.ts         # 日志记录
├── scripts/
│   ├── deploy-mock-usdc.ts  # 一键部署 MockUSDC
│   └── demo-paper.ts        # 论文自动购买 Demo
├── contracts/
│   └── MockUSDC.sol         # ERC-20 测试代币合约
├── tests/
│   └── security.test.ts     # 27 个单元测试
├── downloads/               # 自动创建
│   ├── paper/               # 已购/生成的论文
│   └── receipts/            # 交易凭证
├── .payfi-data/             # 自动创建
│   ├── store.json           # 交易历史
│   └── purchased-articles.json  # 已购论文缓存
└── .env                     # 私钥配置（不提交）
```

## Agent 架构（5 层）

```
┌─────────────────────────────────────────┐
│ 用户接口层 (repl.ts → 未来 Web UI)       │
│ 支持白话输入: "帮我买几篇论文"            │
│ 支持指令: buy-all, paper, history        │
├─────────────────────────────────────────┤
│ 意图理解层 (routeNaturalLanguage)        │
│ 白话 → 正则映射 → 内部命令               │
│ 未来: LLM Prompt 驱动分类                │
├─────────────────────────────────────────┤
│ 安全决策层 (security.ts)                 │
│ 黑名单 + 单笔$1000 + 链上日累计$5000      │
│ 恶意合约检测 (selector 匹配)             │
│ LLM 无权绕过此层                         │
├─────────────────────────────────────────┤
│ 执行层 (wallet.ts)                       │
│ viem WalletClient 签名 + 广播            │
│ 私钥来自 .env，永不落代码                 │
├─────────────────────────────────────────┤
│ 持久化层 (store.ts + data-payment.ts)    │
│ 交易日志 + 论文缓存 + 链上交叉校验        │
│ downloads/paper/ + downloads/receipts/    │
└─────────────────────────────────────────┘
```

## 安全原则

1. **私钥不落代码** — 通过 `.env` 加载，`.gitignore` 排除
2. **策略层可错，协议层兜底** — 链上日累计查询失败时本地 store 兜底
3. **LLM 只分类不决策** — 花一分钱的决策权永远是代码规则 + 人类确认
4. **无状态安全引擎** — 日累计从链上推导，不依赖 off-chain 可变状态
5. **紧急刹车** — 单笔上限 $1000 + 日上限 $5000 硬限制

## 测试

```bash
# 单元测试（27 项）
npx vitest run

# Mock 模式 Demo
npx tsx src/agent.ts

# 交互模式
npx tsx src/repl.ts
```

## 白话输入示例

| 你说 | Agent 做 |
|------|---------|
| "帮我买几篇论文" | → buy-all（自动购买 4 篇） |
| "帮我写一篇关于稳定币的论文" | → paper（生成综述） |
| "有什么论文可以买" | → papers（列出可购论文） |
| "我花了多少钱" | → stats（查看统计） |
| "付 5 USDC 给 0x... 获取 XX" | → 单篇购买（正则解析） |

## 记忆规则

- 每次操作前重新读取本 SKILL.md
- 出现幻觉或框架偏离时重新读取
- 所有修改记录到 PROJECT_LOG.md
