# 💰 PayFi Agent — AI 稳定币支付助手

> Monad Buidler Camp · Week 2 原型 · Tech（研发）方向

一个基于 Monad Testnet 的 AI Agent，能听懂你的白话指令，自动完成 USDC 支付——买论文、买数据、买服务，一条指令搞定。

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

### 1. 环境要求

- **Node.js** ≥ 18
- **MetaMask** 浏览器插件（用于领测试币）
- **Monad Testnet** 钱包（用于部署和测试）

### 2. 安装

```bash
# 克隆项目
git clone https://github.com/zz-0816/payfi-agent.git
cd payfi-agent

# 安装依赖
npm install
```

### 3. 配置 .env

复制模板并填入配置：

```bash
# Windows PowerShell
copy .env.example .env

# Linux / macOS / WSL
cp .env.example .env
```

编辑 `.env` 文件：

```env
# ⚠️ 仅用 Monad 测试网钱包，不要用主网钱包！
PAYFI_PRIVATE_KEY=0x你的测试网私钥

# LLM 语义路由（可选，不设则用正则兜底）
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

| 变量 | 必填 | 说明 |
|------|:--:|------|
| `PAYFI_PRIVATE_KEY` | 是 | Monad 测试网钱包私钥（`0x` 开头 66 位） |
| `OPENAI_API_KEY` | 否 | LLM API Key，支持 OpenAI / DeepSeek 等兼容 API |
| `OPENAI_BASE_URL` | 否 | API 地址，默认 `https://api.openai.com/v1` |
| `LLM_MODEL` | 否 | 模型名，默认 `gpt-4o-mini` |

> 💡 不设 LLM 也能正常使用——Agent 会用内置正则路由理解你的意图。

### 4. 部署测试代币

```powershell
# Windows PowerShell
$env:PAYFI_PRIVATE_KEY="0x你的私钥"
npx tsx scripts/deploy-mock-usdc.ts
```

```bash
# Linux / macOS / WSL
export PAYFI_PRIVATE_KEY="0x你的私钥"
npx tsx scripts/deploy-mock-usdc.ts
```

部署成功后会输出合约地址，填入 `src/config.ts` 的 `USDC_ADDRESS`（默认已配好）。

### 5. 领测试币

- **MON**（Gas 费）：去 [Monad 官方 Discord](https://discord.gg/monad) `#testnet-faucet` 频道
- **MockUSDC**（测试 USDC）：部署合约时自动铸造 100 万枚给部署者

### 6. 启动

```powershell
# Windows PowerShell
npx tsx src/repl.ts
```

```bash
# Linux / macOS / WSL
npx tsx src/repl.ts
```

---

## 使用方式

### 白话输入（推荐）

Agent 能听懂自然语言——不需要记任何命令：

| 你说 | Agent 做 |
|------|---------|
| "帮我买几篇论文" | 自动购买全部未购论文 |
| "买2号和3号" | 精确购买指定编号 |
| "帮我写一篇论文" | 基于已购论文生成综述 |
| "有什么论文可以买" | 列出论文库 + 购买状态 |
| "有没有关于隐私的论文" | 搜索论文 |
| "我买了什么" | 查看已购论文 |
| "花了多少钱" | 查看交易统计 |
| "全部删除重新开始" | 重置所有数据 |
| "关闭" / "拜拜" | 退出 |

### 命令输入

也支持直接命令：

| 命令 | 说明 |
|------|------|
| `buy-all` | 购买全部未购论文 |
| `buy-idx 2` | 购买第 2 号论文 |
| `buy-range 1 3` | 购买 1~3 号论文 |
| `rebuy` | 强制重新购买（覆盖已购记录） |
| `paper` | 生成研究论文 |
| `papers` | 查看论文列表 |
| `purchased` | 查看已购论文 |
| `search <关键词>` | 搜索论文 |
| `history` | 交易历史 |
| `stats` | 交易统计 |
| `reset` | 重置所有数据 |
| `quit` | 退出 |

### 支付指令

直接链上支付 USDC：

```
付 10 USDC 给 0x收款地址
付 5 USDC 给 0x收款地址 获取 报告名称
```

### Demo 模式

```bash
npx tsx src/agent.ts          # 跑 3 个预设 Demo
npx tsx scripts/demo-paper.ts # 自动买 4 篇论文 + 生成论文
```

---

## 项目结构

```
payfi-agent/
├── src/
│   ├── repl.ts              # 交互式 REPL（白话输入）
│   ├── llm-router.ts        # LLM + 正则双层意图路由
│   ├── agent.ts             # 批处理 Demo
│   ├── config.ts            # 配置（RPC/地址/安全规则）
│   ├── security.ts          # 无状态安全引擎
│   ├── wallet.ts            # viem 签名 + 广播
│   ├── store.ts             # 持久化存储 + 链上交叉校验
│   ├── data-payment.ts      # 数据付费 + 论文库 + 合成引擎
│   └── notion.ts            # 交易日志
├── scripts/
│   ├── deploy-mock-usdc.ts  # 一键部署 MockUSDC
│   └── demo-paper.ts        # 论文自动购买
├── contracts/
│   └── MockUSDC.sol         # ERC-20 测试代币
├── tests/
│   └── security.test.ts     # 27 个单元测试
├── downloads/               # 自动生成
│   ├── paper/               # 已购/生成的论文 (.md)
│   └── receipts/            # 交易凭证 (.txt)
└── .payfi-data/             # 自动生成
    ├── store.json           # 交易历史
    ├── purchased-uids.json  # 已购论文 UID
    └── purchased-articles.json  # 论文内容缓存
```

---

## 架构

```
用户白话输入
    │
    ▼
┌─────────────────────────┐
│ 意图路由层 llm-router.ts │  LLM 优先 → 正则兜底 (12 种意图)
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 安全决策层 security.ts   │  黑名单 + 单笔 $1000 + 链上日累计 $5000
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 执行层 wallet.ts         │  viem WalletClient 签名 + 广播
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ 持久化层 store.ts        │  JSON 文件 + 链上交叉校验
└─────────────────────────┘
```

---

## 安全设计

| 层级 | 措施 |
|------|------|
| 私钥 | `.env` 加载，`.gitignore` 排除，永不落代码 |
| 签名 | Agent 构建交易，人类持有私钥 |
| 限额 | 单笔 ≤ $1000 / 日累计 ≤ $5000 |
| 黑名单 | 恶意地址自动拦截 |
| 恶意合约 | 可疑 selector 检测（approve/transferFrom/burn） |
| LLM | 只做意图分类，不做交易决策 |


## 开发路线图

| 功能 | 状态 | 说明 |
|------|:--:|------|
| 链上 USDC 支付 | ✅ 已完成 | Monad Testnet 签名广播 |
| 安全引擎 | ✅ 已完成 | 黑名单 + 限额 + 链上日累计 |
| 白话意图路由 | ✅ 已完成 | LLM 优先 + 正则兜底 |
| 论文购买 & 合成 | ✅ 已完成 | UID 去重 + 文件下载 |
| LLM 内容生成 | 🔧 开发中 | 论文合成预计接入 LLM 生成 |
| RAG 外部知识 | 🔧 开发中 | 向量数据库 + 外部文档检索 |
| 多场景支付 | 🔧 开发中 | 机票 / API 额度 / 订阅服务 |
| 前端 Web UI | 📋 计划中 | React + Hono API |

---

## 测试

```bash
npx vitest run    # 27 个单元测试
```

---

## 常见问题

### MetaMask 看不到测试 USDC？

手动导入代币：Token contract address 填 `src/config.ts` 里的 `USDC_ADDRESS`，symbol 填 `USDC`，decimal 填 `6`。

### "无法解析意图"？

- 支付格式：`付 10 USDC 给 0x...`
- 其他操作直接用白话："帮我买论文" / "有什么论文" / "帮我写论文"

### Windows 和 Linux 命令差异

| 操作 | Windows PowerShell | Linux / macOS |
|------|-------------------|---------------|
| 设环境变量 | `$env:KEY="value"` | `export KEY="value"` |
| 同一行设+运行 | `$env:KEY="v"; npx tsx ...` | `KEY="v" npx tsx ...` |
| 路径分隔符 | `\` | `/` |

> 💡 配好 `.env` 后就不需要每次设环境变量了。
