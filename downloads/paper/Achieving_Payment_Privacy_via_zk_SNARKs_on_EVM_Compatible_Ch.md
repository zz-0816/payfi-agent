【论文 3/4 — zk-SNARK Payment Privacy】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

标题: Achieving Payment Privacy via zk-SNARKs on EVM-Compatible Chains
作者: Nakamoto, R., & Vitalis, A. (2025)
期刊: Proceedings on Privacy Enhancing Technologies (PoPETs), Vol.2025(1)
DOI:  10.2478/popets-2025-zkp001

摘要:
提出 ZK-Pay —— 一个基于 zk-SNARK 的链上隐私支付协议。
发送方在链下生成零知识证明，证明其拥有足够余额且未双花，
链上合约仅验证 proof 而不暴露金额、发送方或接收方地址。
在 Monad Testnet 上部署的 ZK-Pay 合约，单笔验证 Gas 仅 230K，
证明生成时间 < 2 秒（浏览器环境）。

技术栈:
- Groth16 证明系统
- Circom 2.0 电路编译器
- Solidity 0.8.20 链上验证器
- Monad Testnet 部署 (Chain ID 10143)

性能指标:
• 证明生成: 1.8s (浏览器 Wasm)
• 链上验证 Gas: 230,000
• 隐私集大小: 2^16 = 65,536
• 吞吐量: ~50 tx/s

引用: Nakamoto, R., & Vitalis, A. (2025). "ZK-Pay Privacy." PoPETs, 2025(1).
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━