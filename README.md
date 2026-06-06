# Agile Vault

**Decentralized file storage vault powered by [Tatum](https://tatum.io) Sui RPC and [Walrus](https://www.walrus.xyz) storage on Sui Testnet.**

Built for the Tatum × Walrus Hackathon — Agile Vault is a full-featured decentralized storage platform where users authenticate with their Sui wallet, pay on-chain storage fees, and store files permanently on Walrus blob storage. Every interaction is verified through Tatum's Sui RPC gateway.

🔗 **Live Demo:** [https://agile-vault.onrender.com](https://agile-vault.onrender.com)

---

## How It Works

1. **Connect Wallet** — User connects a Sui-compatible wallet (OKX, Phantom, Sui Wallet, Slush, etc.)
2. **Sign Auth** — Wallet signs a personal message to prove identity (verified server-side via `@mysten/sui`)
3. **Check Balance** — Tatum RPC queries the user's SUI balance via `suix_getBalance` (must have testnet faucet tokens)
4. **Pay Storage Fee** — 0.01 SUI is deducted per file via an on-chain transaction (signed in wallet, executed via Tatum `sui_executeTransactionBlock`)
5. **Upload to Walrus** — Files are published to Walrus testnet publisher, receiving certified blob IDs on-chain
6. **Download** — Files can be retrieved anytime from the Walrus aggregator using the blob ID

---

## Key Features

### 1. Batch Upload with Real-Time Progress Tracking

Upload multiple files simultaneously — drag and drop a batch or Ctrl+click to select several files. Each file displays **real-time progress** through the complete upload pipeline:

- **Signing** — Wallet authorization signature per file
- **Paying** — On-chain storage fee transaction via Tatum RPC
- **Uploading** — File sent to Walrus testnet publisher
- **Stored** — Certified blob ID returned on-chain

The total SUI fee is calculated upfront (0.01 SUI × number of files) and the balance is checked before any transactions begin.

### 2. Storage Cost Comparison Dashboard

A live cost analysis card appears in the dashboard once files are uploaded, providing a **visual comparison** of decentralized vs traditional cloud storage:

- **Price per GB/month** bar chart comparing Walrus, AWS S3, Google Cloud Storage, and Azure Blob Storage
- **Yearly cost projection** grid showing what your actual stored data would cost for 12 months on each platform
- **Savings percentage** — Walrus is ~98% cheaper than AWS S3 per GB

This feature makes the value proposition of Walrus decentralized storage immediately visible and quantifiable.

### 3. On-Chain Storage Certificates

Every uploaded file can generate a downloadable **Certificate of Storage** — a professionally designed PNG certificate containing:

- File name and size
- Walrus blob ID (on-chain identifier)
- Owner wallet address
- Upload timestamp
- Network confirmation (Sui Testnet)
- Verification footer: "Powered by Tatum RPC • Stored on Walrus • Verified on Sui"

Certificates are generated client-side using HTML Canvas and serve as shareable proof of decentralized storage — ideal for hackathon demos, compliance documentation, and real-world verification.

### 4. Additional Features

- **Universal wallet detection** — Automatically detects OKX, Phantom, Sui Wallet, Slush, MetaMask, Trust Wallet, Coinbase Wallet, and Backpack extensions
- **SUI fee enforcement** — Uploads are blocked if the wallet has insufficient testnet SUI balance (minimum 0.005 SUI required)
- **Walrus aggregator download** — Retrieve files directly from decentralized storage via the testnet aggregator endpoint
- **Mobile-responsive UI** — Full functionality on phones and tablets with truncated filenames and adaptive layouts
- **Persistent history** — All upload metadata stored in PostgreSQL (Neon), survives server restarts and redeploys
- **Wallet signature auth** — Every session requires a fresh wallet signature; no cookies, no accounts, no auto-reconnect

---

## Tatum Integration

All Sui blockchain interactions use **Tatum's Sui Testnet RPC Gateway** with `x-api-key` header authentication:

| Feature | Tatum RPC Method | Purpose |
|---|---|---|
| Wallet balance check | `suix_getBalance` | Verify user has SUI for storage fees |
| Owned objects query | `suix_getOwnedObjects` | Display wallet's on-chain assets |
| Execute payment tx | `sui_executeTransactionBlock` | Process 0.01 SUI storage fee per file |
| Health check | Connection verification | Confirm RPC availability on startup |

**Endpoint:** `https://sui-testnet.gateway.tatum.io`

---

## Walrus Integration

| Feature | Endpoint | Purpose |
|---|---|---|
| **Publisher** | `PUT /v1/blobs` | Upload files to Walrus testnet blob storage |
| **Aggregator** | `GET /v1/blobs/{blobId}` | Download files from decentralized storage |
| **Explorer** | `walruscan.com/testnet` | On-chain blob verification links |
| **Retry logic** | 3 retries with exponential backoff | Upload reliability over unreliable networks |

Each upload receives a **real blob ID** certified on the Sui testnet blockchain, linked to [walruscan.com/testnet](https://walruscan.com/testnet) for public verification.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 8, @mysten/dapp-kit, @mysten/sui v2, Lucide icons |
| Backend | Express v5, Node.js 24 |
| Database | PostgreSQL (Neon free tier) |
| Storage | Walrus testnet (publisher + aggregator) |
| RPC | Tatum Sui Testnet Gateway |
| Auth | Wallet Standard protocol + Sui personal message signature verification |
| Hosting | Render (free web service + free PostgreSQL) |
| Wallets | OKX, Phantom, Sui Wallet, Slush, Backpack, MetaMask, Trust, Coinbase |

---

## Run Locally

### Prerequisites

- Node.js 18+
- PostgreSQL database (or [Neon](https://neon.tech) free tier)
- Tatum API key from [dashboard.tatum.io](https://dashboard.tatum.io)
- Sui testnet wallet with faucet tokens from [faucet.sui.io](https://faucet.sui.io)

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
# Terminal 1: Backend API server
node server.js

# Terminal 2: Frontend dev server
npm run dev
```

Frontend runs on `http://localhost:5173`, API on `http://localhost:8787`.

---

## Project Structure

```
├── src/
│   ├── main.jsx          # React frontend (wallet UI, batch upload, vault, certificates)
│   ├── styles.css         # Responsive styles with mobile breakpoints
│   └── assets/            # Tatum logo and Walrus branding
├── server.js              # Express backend (Tatum RPC, Walrus publisher, PostgreSQL)
├── render.yaml            # Render deployment blueprint
├── vite.config.js         # Vite config with /api proxy
├── .env.example           # Environment variable template
└── package.json
```

---

## License

MIT
