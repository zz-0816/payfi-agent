【论文 1/4 — Anti-MEV Payment Channels】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: Anti-MEV Payment Channels: Protecting User Transactions from Front-running
作者: Zhang et al. (2024)
期刊: IEEE Transactions on Blockchain, Vol.5(3), pp.112-128
DOI:  10.1109/TBC.2024.mEv001

摘要:
本文提出一种抗 MEV（矿工可提取价值）的支付通道架构。
通过在 Layer 2 状态通道中引入时间锁定 + 批量结算机制，
有效防止抢跑（front-running）和三明治攻击（sandwich attack）。
实验结果表明，Anti-MEV 通道在 Uniswap V3 测试环境中将
MEV 损失降低了 87.3%，同时保持与传统支付通道相当的吞吐量。

关键发现:
1. 时间锁定窗口 ≥ 2 blocks 可防止 99% 的抢跑攻击
2. 批量结算将 Gas 成本分摊，单笔成本从 $12 → $0.34
3. 与现有 ERC-4337 账户抽象标准兼容

引用: Zhang, L., Chen, W., & Park, S. (2024).
"Anti-MEV Payment Channels." IEEE TBC, 5(3), 112-128.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━