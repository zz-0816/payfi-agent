# PayFi Agent — 项目日志

> 每次操作修改时记录日期 + 修改内容，作为工程量证明。

---

## 2026-07-18 — 初始构建（Week 2 最小原型）

| 时间 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 初始 | `DEV_PLAN.md` | 新建 | 开发计划文档，按提交格式回答 6 问 |
| 初始 | `src/SKILL.md` | 新建 | 项目专属技能文件，含技术栈/流程/约束 |
| 初始 | `PROJECT_LOG.md` | 新建 | 项目日志文件（本文件） |
| 初始 | `src/wallet.ts` | 新建 | 钱包模块：viem 签名 + 广播 + 余额查询 |
| 初始 | `src/data-payment.ts` | 新建 | 数据付费模块：意图识别 + Mock 内容获取 |
| 初始 | `src/notion.ts` | 新建 | 交易日志模块：本地记录 + 未来 Notion 同步 |
| 初始 | `src/config.ts` | 修改 | 新增私钥配置（PAYFI_PRIVATE_KEY ENV）+ 恶意合约检测配置 |
| 初始 | `src/security.ts` | 修改 | 新增恶意合约检测（可疑 selector 匹配）+ 风险通知生成 |
| 初始 | `src/agent.ts` | 重写 | 接入真实签名 + 数据付费 + 6-step 流程编排 |

---

## 2026-07-21 — 架构升级：无状态安全引擎 + 持久化存储

| 时间 | 文件 | 操作 | 说明 |
|------|------|------|------|
| 架构 | `src/security.ts` | **重写** | **无状态化**：移除 `dailySpent` 内存变量 → 改为 `getDailySpentOnChain()` 查链上 USDC Transfer 事件。`runSecurityCheckAsync()` 异步查链，`runSecurityCheckSync()` 同步备选（不查链）。链上查询失败时用本地 store 兜底。 |
| 架构 | `src/store.ts` | **新建** | **持久化存储层**：JSON 文件 `.payfi-data/store.json`。`TxStore` 类：交易增删查 + 日累计缓存 + `crossValidate()` 启动时链上交叉校验（本地 vs 链上不一致时以链上为准修正）。 |
| 架构 | `src/agent.ts` | **修改** | 接入 `runSecurityCheckAsync` + `TxStore`。启动时 `crossValidate()` 链上校验。每笔交易（含被拒）持久化到 store.json。真实地址时查链上日累计，Mock 模式用同步检测。 |
| 架构 | `package.json` | **修改** | **移除 MOSS 依赖**（`@themoss/core`/`@themoss/erc`/`@themoss/system`），仅保留 `viem`。纯 viem 直连 ERC-20 transfer。 |
| 架构 | `vitest.config.ts` | 新建 | Vitest 配置文件 |
| 测试 | `tests/security.test.ts` | 新建 | **27 个单元测试**：意图解析 (5) + 安全检测同步模式 (7) + formatUSDC (4) + Store 持久化 (11)。全部通过 ✅ |
| 修复 | `src/agent.ts` | 修复 | 被拒交易 `store.addTransaction()` 后缺 `store.flush()` 导致不落盘 → 已补 |

### 架构决策

| 决策 | 理由 |
|------|------|
| **日累计从链上查，不存 off-chain** | 杜绝「off-chain 状态和链上不同步」问题。链不说谎。 |
| **链上查询失败 → 本地 store 兜底** | RPC 不可用时仍能工作，不丢数据。启动时 crossValidate 自动修正。 |
| **移除 MOSS** | 杀鸡不用牛刀。USDC transfer 用 viem `encodeFunctionData` 三行搞定。 |
| **JSON 文件存储** | 零依赖，路径透明，方便审计和备份。未来可升级 SQLite。 |

### 测试结果

```
✓ tests/security.test.ts (27 tests)
  ✓ 意图解析 (5)       — 标准格式/带描述/拒绝不对齐/拒绝缺0x/0.5 USDC
  ✓ 安全检测 (7)       — 通过/超限拦截/恶意selector/正常transfer/无txData/同步跳过日累计
  ✓ formatUSDC (4)     — 10.00/0.50/0.00/99999.00
  ✓ TxStore (11)       — 空Store/增删/多笔累计/rejected不计/持久化/倒序/总量/Agent地址
```

### 当前项目结构

```
payfi-agent/
├── README.md
├── DEV_PLAN.md
├── PROJECT_LOG.md          ← 本文件
├── SKILL.md
├── package.json            ← 纯 viem 依赖
├── vitest.config.ts
├── .payfi-data/
│   └── store.json          ← 持久化交易日志
├── tests/
│   └── security.test.ts    ← 27 个单元测试
└── src/
    ├── SKILL.md
    ├── config.ts
    ├── security.ts         ← 无状态安全引擎（查链上日累计）
    ├── store.ts            ← 持久化 + 链上交叉校验
    ├── wallet.ts
    ├── data-payment.ts
    ├── notion.ts
    └── agent.ts            ← 6-step 流程 + store 集成
```

---
