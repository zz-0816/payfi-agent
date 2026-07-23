# 💰 PayFi Agent — AI 稳定币支付助手

> Monad Buidler Camp · Week 2 原型 · Tech（研发）方向

基于 Monad Testnet 的 AI Agent，听懂白话指令，自动完成 USDC 链上支付。

[📖 English Docs →](README.md)

---

## 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| 区块链交互 | **viem** ^2.54 | WalletClient + PublicClient，签名广播 |
| 网络 | **Monad Testnet** | Chain ID 10143，RPC testnet-rpc.monad.xyz |
| 代币 | **MockUSDC** (ERC-20) | 自部署测试代币，6 位精度 |
| 智能合约 | **Solidity** 0.8.20 | MockUSDC.sol，EVM Paris |
| 安全引擎 | **TypeScript** | 无状态规则引擎（黑名单 + 单笔限额 + 链上日累计 + 恶意合约检测） |
| LLM 路由 | **OpenAI 兼容 API** | DeepSeek / GPT-4o-mini，temperature=0 分类 |
| 意图路由（离线） | **正则表达式** | LLM 不可用时自动降级，12 种意图 |
| 持久化 | **JSON 文件** | .payfi-data/ 目录，零依赖 |
| 运行环境 | **Node.js** ≥ 18 + **tsx** | TypeScript 直接执行 |
| 测试 | **Vitest** | 27 个单元测试 |
| 合约部署 | **Remix IDE** | 编译 Solidity（JavaScript VM 即可） |
| 钱包 | **MetaMask** | 浏览器插件，连接 Monad Testnet |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- MetaMask 浏览器插件
- Monad Testnet 钱包

### Windows

```powershell
# 克隆
git clone https://github.com/zz-0816/payfi-agent.git
cd payfi-agent

# 安装
npm install

# 配置 .env
copy .env.example .env
# 编辑 .env，填入你的测试网私钥

# 启动
npx tsx src/repl.ts
```

### Linux / macOS / WSL

```bash
git clone https://github.com/zz-0816/payfi-agent.git
cd payfi-agent
npm install
cp .env.example .env
# 编辑 .env，填入测试网私钥
npx tsx src/repl.ts
```

---

## .env 配置

```env
# Monad 测试网钱包私钥（⚠️ 仅测试网！）
PAYFI_PRIVATE_KEY=0x你的测试网私钥

# LLM 语义路由（可选，不设则用正则兜底）
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `PAYFI_PRIVATE_KEY` | 是 | Monad 测试网私钥（`0x` 开头 66 位） |
| `OPENAI_API_KEY` | 否 | LLM API Key，支持 OpenAI/DeepSeek |
| `OPENAI_BASE_URL` | 否 | API 地址，默认 `https://api.openai.com/v1` |
| `LLM_MODEL` | 否 | 模型名，默认 `gpt-4o-mini` |

---

## 使用方式

### 白话输入（推荐）

Agent 能直接理解自然语言：

| 你说 | Agent 做 |
|------|---------|
| "帮我买几篇论文" | 购买全部未购 |
| "帮我买 2 号论文" | 购买指定编号 |
| "购买 1、2 号论文" | 购买 1 号和 2 号 |
| "帮我写一篇论文" | 基于已购生成综述 |
| "有什么论文可以买" | 列出论文库 |
| "有没有关于隐私的论文" | 搜索论文 |
| "我买了什么" | 查看已购 |
| "花了多少钱" | 统计 |
| "全部删除重新开始" | 重置 |
| "关闭" / "拜拜" | 退出 |

### 命令输入

| 命令 | 说明 |
|------|------|
| `buy-all` | 购买全部未购论文 |
| `buy-idx 2` | 购买第 2 号 |
| `buy-range 1 3` | 购买 1~3 号 |
| `paper` | 生成研究论文 |
| `papers` | 查看论文列表 |
| `purchased` | 查看已购 |
| `search 关键词` | 搜索 |
| `history` | 交易历史 |
| `stats` | 统计 |
| `reset` | 重置 |
| `rebuy` | 强制重购 |

### 直接支付

```
付 10 USDC 给 0x收款地址
付 5 USDC 给 0x收款地址 获取 报告名称
```

---

## 项目结构

```
payfi-agent/
├── src/
│   ├── repl.ts              # 交互入口（白话 REPL）
│   ├── llm-router.ts        # LLM + 正则双层意图路由
│   ├── agent.ts             # Demo 批处理
│   ├── config.ts            # 配置（RPC/地址/安全/.env 加载）
│   ├── security.ts          # 安全引擎（无状态）
│   ├── wallet.ts            # viem 签名 + 广播
│   ├── store.ts             # 持久化 + 链上交叉校验
│   ├── data-payment.ts      # 论文库 + 购买去重 + 合成
│   └── notion.ts            # 交易日志
├── scripts/
│   ├── deploy-mock-usdc.ts  # 一键部署 MockUSDC
│   └── demo-paper.ts        # 论文购买 Demo
├── contracts/
│   └── MockUSDC.sol         # ERC-20 测试代币
├── tests/
│   └── security.test.ts     # 27 个单元测试
├── downloads/               # 自动生成
│   ├── paper/               # 论文 (.md)
│   └── receipts/            # 凭证 (.txt)
└── .payfi-data/             # 自动生成
    ├── store.json
    ├── purchased-uids.json
    └── purchased-articles.json
```

---

## 架构

```
用户白话
    │
    ▼
┌─────────────────────┐
│ 意图路由 llm-router  │  LLM → 正则兜底（12 种意图）
├─────────────────────┤
│ 安全引擎 security    │  黑名单 + $1000 + 链上日累计 $5000
├─────────────────────┤
│ 执行层 wallet        │  viem 签名 + 广播
├─────────────────────┤
│ 持久化 store         │  JSON + 链上交叉校验
└─────────────────────┘
```

## 安全设计

| 层级 | 措施 |
|------|------|
| 私钥 | `.env`，`.gitignore`，永不落代码 |
| 签名 | Agent 构建交易，人类持私钥 |
| 限额 | 单笔 ≤ $1000 / 日累计 ≤ $5000 |
| 黑名单 | 恶意地址拦截 |
| 恶意合约 | approve/transferFrom/burn 检测 |
| LLM 权限 | 只做意图分类，**不做交易决策** |

---

## 开发路线图

| 功能 | 状态 | 说明 |
|------|:--:|------|
| 链上 USDC 支付 | ✅ | Monad Testnet |
| 安全引擎 | ✅ | 四层检测 |
| 白话意图路由 | ✅ | LLM + 正则 |
| 论文购买 | ✅ | UID 去重 |
| LLM 内容生成 | 🔧 开发中 | 论文合成预计接 LLM |
| RAG 外部知识 | 🔧 开发中 | 向量数据库 |
| 多场景支付 | 🔧 开发中 | 机票/API/订阅 |
| 前端 UI | 📋 计划中 | React + Hono |

---

## 测试

```bash
npx vitest run
```

## 常见问题

**MetaMask 看不到测试 USDC？**
手动导入代币：Token 地址填 `USDC_ADDRESS`，symbol `USDC`，decimal `6`。

**无法解析意图？**
支付格式：`付 10 USDC 给 0x...`，其他用白话："帮我买论文"。

**Windows 和 Linux 命令差异？**
配好 `.env` 后无需每次设环境变量，两条命令完全一样。只在手动设临时变量时有差异：

| 操作 | Windows PowerShell | Linux/macOS |
|------|-------------------|-------------|
| 临时设变量 | `$env:KEY="value"` | `export KEY="value"` |
