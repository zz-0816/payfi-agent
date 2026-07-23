# PayFi Agent — 开发计划（Dev）

> 最小原型 · 提交格式 · 个人项目

---

## 1. 我要做的最小功能是什么？

**一个绑定用户钱包的私有 AI Agent，能用稳定币（USDC）在 Monad Testnet 上自主完成链上支付**，
并自动执行安全检测（黑名单 + 金额限流 + 恶意合约识别 + 风险报告推送）。

核心能力：
- 听懂自然语言支付指令（"付 10 USDC 买这份报告"）
- 自动构建链上 USDC transfer 交易
- **真实签名 + 广播**（Monad Testnet，Agent 持有测试网私钥）
- 付款后获取付费内容（API / 数据）
- 遇恶意地址/合约时自动拦截 + 推送风险信息

---

## 2. 谁会使用它？

**我自己（zz-0816）**——私有 Agent，不对外开放。
- 需要付费获取链上数据、API 额度、研究报告时，Agent 代为支付
- 钱包私钥始终掌握在我手中（Agent 仅持测试网私钥用于 Demo）

---

## 3. 用户完成的一个动作是什么？

```
用户: "Agent，帮我付 10 USDC 获取这份链上分析报告"
                ↓
     Step 1 — 意图解析: 识别收款地址 + 金额 + 数据源 URL
                ↓
     Step 2 — 安全检测: 黑名单 + 金额上限 + 日累计 + 恶意合约检测
                ↓
     Step 3 — 风险报告: 结构化 RiskReport → 推送至用户
                ↓
     Step 4 — 签名广播: Agent 用测试网私钥签名 → 链上执行
                ↓
     Step 5 — 获取数据: 支付 TX 确认后 → 拉取付费内容 → 返回用户
```

---

## 4. 我需要读哪 1–3 个文档？

| 文档 | 链接 | 用途 |
|------|------|------|
| MOSS Protocol 接入 | https://github.com/nishuzumi/moss/blob/main/docs/protocol-onboarding.md | 交易构建 |
| viem WalletClient | https://viem.sh/docs/clients/wallet | 签名 + 广播 |
| Monad Agentic Payments | https://docs.monad.xyz/tooling-and-infra/agentic-payments | Agent 支付范式 |

---

## 5. 本周真实实现什么？哪些可以 mock？

| 模块 | 状态 | 说明 |
|------|:--:|------|
| Agent 意图解析 | ✅ 真实 | 正则匹配 + 结构化 PaymentIntent |
| 安全检测引擎 | ✅ 真实 | 黑名单 + 金额 + 日累计 + 恶意合约检测 |
| MOSS 交易构建 | ✅ 真实 | ERC-20 transfer USDC on Monad Testnet |
| **钱包签名 + 广播** | ✅ **真实** | viem WalletClient 签名 + sendTransaction |
| 风险报告推送 | ✅ 真实 | 结构化 RiskReport 输出 |
| 付费数据获取 | 🔸 Mock | 公开 API 模拟"付费后内容" |
| Notion 交易日志 | 🔸 Mock | 本地 JSON 文件（未来接 Notion API） |
| Remix 合约部署 | 🔸 Mock | 本周用已有 USDC 合约地址 |

---

## 6. 我如何证明它做出来了？

```bash
# 设置测试网私钥（⚠️ 仅限 Monad Testnet，勿用主力钱包）
export PAYFI_PRIVATE_KEY="0x你的Monad测试网私钥"

# 运行 Demo
cd D:\web3career\课程作业\payfi-agent
npx tsx src/agent.ts
```

**预期输出：**

```
══════════════════════════════════════════════════
  PayFi Agent — AI 稳定币支付助手
══════════════════════════════════════════════════

✅ MOSS 已连接 Monad Testnet
   用户钱包: 0x_YOUR_COURSE_WALLET_ADDRESS
   支付代币: USDC

📝 用户指令: "付 10 USDC 给 0x收款地址 获取 https://api.example.com/report"
🔍 Step 1 — 意图解析: 收款方=0x..., 金额=10 USDC
🛡️  Step 2 — 安全检测: ✅ 通过 (none)
   ├─ 黑名单: ✅ 安全
   ├─ 金额上限: ✅ 未超 $1000
   ├─ 日累计: ✅ 未超 $5000
   └─ 恶意合约检测: ✅ 安全
🔧 Step 3 — MOSS 构建交易: ✅ 已构建
✍️  Step 4 — 签名广播:
   🔑 使用测试网私钥签名...
   📡 广播交易: 0x_tx_hash...
   ✅ 交易已确认! https://testnet.monadexplorer.com/tx/0x_tx_hash
📥 Step 5 — 获取付费数据: ✅ 模拟返回报告内容
══════════════════════════════════════════════════
  Demo 完成。
  交易哈希: 0x_tx_hash
  Gas 消耗: 0.00021 MON
══════════════════════════════════════════════════
```

---

## 工具清单

| 工具 | 用途 | 本周状态 |
|------|------|:--:|
| **MOSS Protocol** | 交易构建（ERC-20 transfer） | ✅ |
| **viem** | 钱包签名 + 链上广播 | ✅ |
| **Remix IDE** | USDC 合约交互测试 | 🔸 Mock |
| **Notion API** | 交易日志记录 | 🔸 Mock（本地 JSON） |
| **Monad Testnet** | 链上执行环境（Chain ID 10143） | ✅ |
