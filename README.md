# Agile Vault

**Decentralized file storage vault powered by [Tatum](https://tatum.io) Sui RPC and [Walrus](https://www.walrus.xyz) storage on Sui Testnet.**

Built for the Tatum × Walrus Hackathon — Agile Vault lets users store files on Walrus decentralized storage, authenticate with their Sui wallet, and pay a small SUI storage fee per upload — all powered by Tatum's Sui RPC gateway.

---

## Live Demo

🔗 [https://agile-vault.onrender.com](https://agile-vault.onrender.com)

## How It Works

1. **Connect Wallet** — User connects a Sui-compatible wallet (OKX, Phantom, Sui Wallet, Slush, etc.)
2. **Sign Auth** — Wallet signs a message to prove identity (verified server-side via `@mysten/sui`)
3. **Check Balance** — Tatum RPC queries the user's SUI balance (must have testnet faucet tokens)
4. **Pay Storage Fee** — 0.01 SUI is deducted per upload via an on-chain transaction (signed in wallet, executed via Tatum RPC)
5. **Upload to Walrus** — File is published to Walrus testnet, receiving a certified blob ID on-chain
6. **Download** — Files can be retrieved anytime from the Walrus aggregator using the blob ID

## Tatum Integration

All Sui blockchain interactions use **Tatum's Sui Testnet RPC Gateway** (`https://sui-testnet.gateway.tatum.io`) with `x-api-key` authentication:

| Feature | Tatum RPC Method |
|---|---|
| Wallet balance check | `suix_getBalance` |
| Owned objects query | `suix_getOwnedObjects` |
| Execute payment transaction | `sui_executeTransactionBlock` |
| Health check | Connection verification |

## Walrus Integration

- **Publisher** — Files uploaded via `PUT /v1/blobs` to Walrus testnet publisher
- **Aggregator** — Files downloaded via `GET /v1/blobs/{blobId}` from Walrus testnet aggregator
- **Explorer** — Each blob linked to [walruscan.com/testnet](https://walruscan.com/testnet) for on-chain verification
- **Retry logic** — 3 retries with exponential backoff for upload reliability

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, @mysten/dapp-kit, @mysten/sui v2, Lucide icons |
| Backend | Express v5, Node.js |
| Database | PostgreSQL (Neon) |
| Storage | Walrus testnet (publisher + aggregator) |
| RPC | Tatum Sui Testnet Gateway |
| Auth | Wallet Standard + Sui signature verification |
| Hosting | Render (web service + PostgreSQL) |

## Run Locally

### Prerequisites
- Node.js 18+
- PostgreSQL (or use the Neon free tier)
- Tatum API key ([dashboard.tatum.io](https://dashboard.tatum.io))
- Sui testnet wallet with faucet tokens ([faucet.sui.io](https://faucet.sui.io))

### Setup

```bash
git clone https://github.com/XRAYEMMA/Agile-Vault.git
cd Agile-Vault
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
TATUM_API_KEY=your-tatum-api-key
WALRUS_ENDPOINT=https://publisher.walrus-testnet.walrus.space
WALRUS_EPOCHS=1
SUI_NETWORK=testnet
PORT=8787
DATABASE_URL=your-postgres-connection-string
VITE_TATUM_SUI_RPC_URL=https://sui-testnet.gateway.tatum.io
```

### Start

```bash
# Terminal 1: Backend API
node server.js

# Terminal 2: Frontend dev server
npm run dev
```

Frontend runs on `http://localhost:5173`, API on `http://localhost:8787`.

## Project Structure

```
├── src/
│   ├── main.jsx          # React frontend (wallet UI, upload, vault)
│   ├── styles.css         # Responsive styling
│   └── assets/            # Logos and images
├── server.js              # Express backend (Tatum RPC, Walrus, DB)
├── render.yaml            # Render deployment config
├── vite.config.js         # Vite config with API proxy
├── .env.example           # Environment variable template
└── package.json
```

## License

MIT
