# 💰 PayFi Agent — AI Stablecoin Payment Assistant

> Monad Buidler Camp · Week 2 Prototype · Tech Track

An AI Agent on Monad Testnet that understands natural language and executes on-chain USDC payments — buy papers, purchase data, pay for services, all with a single command.

[📖 简体中文文档 →](README_CN.md)

---

## Tech Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Blockchain | **viem** ^2.54 | WalletClient + PublicClient |
| Network | **Monad Testnet** | Chain ID 10143 |
| Token | **MockUSDC** (ERC-20) | Self-deployed, 6 decimals |
| Smart Contract | **Solidity** 0.8.20 | EVM Paris |
| Security Engine | **TypeScript** | Stateless rules (blacklist + caps + chain daily limit + malicious detection) |
| LLM Router | **OpenAI-compatible API** | DeepSeek / GPT-4o-mini, temperature=0 |
| Fallback Router | **Regex** | Auto-degrades when LLM unavailable, 12 intents |
| Persistence | **JSON files** | .payfi-data/ directory, zero dependencies |
| Runtime | **Node.js** ≥ 18 + **tsx** | Direct TypeScript execution |
| Testing | **Vitest** | 27 unit tests |
| Contract Deploy | **Remix IDE** | Solidity compilation (JS VM mode works) |
| Wallet | **MetaMask** | Browser extension, connect to Monad Testnet |

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- MetaMask browser extension
- Monad Testnet wallet

### Windows

```powershell
git clone https://github.com/zz-0816/payfi-agent.git
cd payfi-agent
npm install
copy .env.example .env
# Edit .env with your testnet private key
npx tsx src/repl.ts
```

### Linux / macOS / WSL

```bash
git clone https://github.com/zz-0816/payfi-agent.git
cd payfi-agent
npm install
cp .env.example .env
# Edit .env with your testnet private key
npx tsx src/repl.ts
```

---

## .env Configuration

```env
# Monad testnet wallet private key (⚠️ TESTNET ONLY!)
PAYFI_PRIVATE_KEY=0x_your_testnet_private_key

# LLM semantic router (optional, falls back to regex)
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
```

| Variable | Required | Description |
|----------|:--:|------|
| `PAYFI_PRIVATE_KEY` | Yes | Monad testnet private key (66 chars, `0x` prefix) |
| `OPENAI_API_KEY` | No | LLM API key (OpenAI/DeepSeek compatible) |
| `OPENAI_BASE_URL` | No | API base URL, default `https://api.openai.com/v1` |
| `LLM_MODEL` | No | Model name, default `gpt-4o-mini` |

> 💡 Without LLM config, the Agent still works — it uses the built-in regex router.

### Deploy Test Token

```powershell
# Windows PowerShell
$env:PAYFI_PRIVATE_KEY="0x_your_key"
npx tsx scripts/deploy-mock-usdc.ts
```

```bash
# Linux / macOS / WSL
export PAYFI_PRIVATE_KEY="0x_your_key"
npx tsx scripts/deploy-mock-usdc.ts
```

### Get Testnet Tokens

- **MON** (gas): [Monad Discord](https://discord.gg/monad) → `#testnet-faucet`
- **MockUSDC**: Auto-minted 1,000,000 to deployer

---

## Usage

### Natural Language (Recommended)

The Agent understands conversational input:

| You say | Agent does |
|---------|-----------|
| "buy me some papers" | Purchase all unowned papers |
| "buy paper #2" | Purchase specific paper |
| "buy papers 1 to 3" | Range purchase |
| "write me a paper" | Synthesize from purchased papers |
| "what papers are available" | List paper library |
| "any papers about privacy" | Search papers |
| "what did I buy" | Show purchased |
| "how much did I spend" | Show stats |
| "reset everything" | Clear all data |
| "quit" | Exit |

### Commands

| Command | Description |
|---------|-------------|
| `buy-all` | Purchase all unowned |
| `buy-idx 2` | Purchase paper #2 |
| `buy-range 1 3` | Purchase papers 1–3 |
| `paper` | Generate research paper |
| `papers` | List available papers |
| `purchased` | Show purchased papers |
| `search <keyword>` | Search papers |
| `history` | Transaction history |
| `stats` | Spending statistics |
| `reset` | Reset all data |
| `rebuy` | Force repurchase |
| `quit` | Exit |

### Direct Payment

```
pay 10 USDC to 0x_recipient_address
pay 5 USDC to 0x_recipient_address for report_name
```

---

## Project Structure

```
payfi-agent/
├── src/
│   ├── repl.ts              # Interactive REPL
│   ├── llm-router.ts        # LLM + regex dual router
│   ├── agent.ts             # Batch demo
│   ├── config.ts            # Config (RPC / addresses / security / .env)
│   ├── security.ts          # Stateless security engine
│   ├── wallet.ts            # viem signing + broadcasting
│   ├── store.ts             # Persistence + chain cross-validation
│   ├── data-payment.ts      # Paper library + purchase tracking + synthesis
│   └── notion.ts            # Transaction logging
├── scripts/
│   ├── deploy-mock-usdc.ts  # One-click MockUSDC deploy
│   └── demo-paper.ts        # Paper purchase demo
├── contracts/
│   └── MockUSDC.sol         # ERC-20 test token
├── tests/
│   └── security.test.ts     # 27 unit tests
├── downloads/               # Auto-generated
│   ├── paper/               # Purchased papers (.md)
│   └── receipts/            # Transaction receipts (.txt)
└── .payfi-data/             # Auto-generated
    ├── store.json
    ├── purchased-uids.json
    └── purchased-articles.json
```

---

## Architecture

```
User Input (natural language)
    │
    ▼
┌───────────────────────┐
│ Intent Router          │  LLM → regex fallback (12 intents)
│ llm-router.ts         │
├───────────────────────┤
│ Security Engine        │  Blacklist + $1000/tx + $5000/day + malicious detection
│ security.ts           │
├───────────────────────┤
│ Execution Layer        │  viem WalletClient sign + broadcast
│ wallet.ts             │
├───────────────────────┤
│ Persistence Layer      │  JSON files + chain cross-validation
│ store.ts              │
└───────────────────────┘
```

## Security

| Layer | Measure |
|-------|---------|
| Private Key | `.env` loaded, `.gitignore` excluded, never in code |
| Signing | Agent builds tx, human holds key |
| Caps | ≤ $1000/tx, ≤ $5000/day |
| Blacklist | Malicious address blocking |
| Malicious Contract | approve/transferFrom/burn selector detection |
| LLM Scope | Intent classification only — **no trading decisions** |

---

## Roadmap

| Feature | Status | Notes |
|---------|:--:|------|
| On-chain USDC payment | ✅ | Monad Testnet |
| Security engine | ✅ | 4-layer detection |
| NL intent routing | ✅ | LLM + regex |
| Paper purchase | ✅ | UID dedup |
| LLM content generation | 🔧 WIP | Paper synthesis → LLM |
| RAG knowledge | 🔧 WIP | Vector DB + external docs |
| Multi-scenario payment | 🔧 WIP | Flights / API / subscriptions |
| Web UI | 📋 Planned | React + Hono API |

---

## Testing

```bash
npx vitest run
```

## FAQ

**MetaMask doesn't show test USDC?**
Import token manually: contract address = `USDC_ADDRESS` from config.ts, symbol = `USDC`, decimals = `6`.

**"Cannot parse intent"?**
Payment format: `pay 10 USDC to 0x...`. For other actions use natural language: "buy me papers", "what papers".

**Windows vs Linux commands?**
With `.env` configured, all commands are identical across platforms. Temporary env var syntax differs:

| Action | Windows PowerShell | Linux/macOS |
|--------|-------------------|-------------|
| Set var | `$env:KEY="value"` | `export KEY="value"` |
