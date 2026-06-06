import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import multer from 'multer';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import dns from 'node:dns';

// Use Google DNS for more reliable resolution
dns.setServers(['8.8.8.8', '1.1.1.1']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });
const port = Number(process.env.PORT || 8787);
const suiNetwork = process.env.SUI_NETWORK || 'testnet';

if (suiNetwork !== 'testnet') {
  throw new Error('Agile Vault is configured for TESTNET ONLY. Set SUI_NETWORK=testnet.');
}

// PostgreSQL database (Render free tier or local SQLite fallback)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/agile-vault',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Initialize tables
await pool.query(`
  CREATE TABLE IF NOT EXISTS uploads (
    id SERIAL PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    blob_id TEXT NOT NULL,
    blob_object_id TEXT,
    upload_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    walrus_response TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_wallet ON uploads(wallet_address);
`);
console.log('[DB] PostgreSQL connected and tables ready');

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve built frontend in production
const distPath = resolve(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Tatum Sui RPC helper
const TATUM_SUI_RPC = process.env.VITE_TATUM_SUI_RPC_URL || 'https://api.tatum.io/v3/blockchain/node/sui-testnet';

async function tatumSuiRpc(method, params = []) {
  const response = await fetch(TATUM_SUI_RPC, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.TATUM_API_KEY || '',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (data.error) throw new Error(`Tatum RPC error: ${data.error.message}`);
  return data.result;
}

function normalizeWallet(address = '') {
  return String(address).trim().toLowerCase();
}

function normalizeWalrusEndpoint(endpoint = '') {
  const trimmed = endpoint.trim();
  if (!trimmed) throw new Error('WALRUS_ENDPOINT is required.');
  return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/\/$/, '') : `https://${trimmed.replace(/\/$/, '')}`;
}

function decodeHeaderValue(value = '') {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return value;
  }
}

function getAuthHeaders(req) {
  return {
    address: normalizeWallet(req.header('x-wallet-address')),
    message: decodeHeaderValue(req.header('x-wallet-message') || ''),
    signature: req.header('x-wallet-signature') || '',
  };
}

async function requireWalletSignature(req, _res, next) {
  try {
    const { address, message, signature } = getAuthHeaders(req);
    if (!address || !message || !signature) {
      return next(Object.assign(new Error('Wallet address, signed message, and signature are required.'), { status: 401 }));
    }

    if (!message.includes('Agile Vault') || !message.includes('Sui testnet') || !message.includes(address)) {
      return next(Object.assign(new Error('Signed message is not valid for Agile Vault testnet access.'), { status: 401 }));
    }

    await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature, { address });
    req.walletAddress = address;
    req.walletMessage = message;
    next();
  } catch (error) {
    next(Object.assign(new Error('Wallet signature verification failed.'), { status: 401, cause: error }));
  }
}

function rowToUpload(row) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    blobId: row.blob_id,
    blobObjectId: row.blob_object_id,
    uploadTimestamp: row.upload_timestamp,
  };
}

function extractWalrusBlob(responseJson) {
  const newlyCreated = responseJson.newlyCreated?.blobObject;
  const alreadyCertified = responseJson.alreadyCertified?.blobId ? responseJson.alreadyCertified : null;
  const blobId = newlyCreated?.blobId || alreadyCertified?.blobId || responseJson.blobId;
  const blobObjectId = newlyCreated?.id || responseJson.blobObject?.id || responseJson.objectId || null;
  if (!blobId) throw new Error('Walrus did not return a blob ID.');
  return { blobId, blobObjectId };
}

async function storeOnWalrus(file, ownerAddress) {
  const endpoint = normalizeWalrusEndpoint(process.env.WALRUS_ENDPOINT || '');
  const url = new URL('/v1/blobs', endpoint);
  url.searchParams.set('epochs', process.env.WALRUS_EPOCHS || '1');
  url.searchParams.set('send_object_to', ownerAddress);

  const headers = { 'content-type': file.mimetype || 'application/octet-stream' };
  if (process.env.WALRUS_API_KEY) headers.authorization = `Bearer ${process.env.WALRUS_API_KEY}`;

  const MAX_RETRIES = 3;
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Walrus] Upload attempt ${attempt}/${MAX_RETRIES} to ${url.hostname}...`);
      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: file.buffer,
        signal: AbortSignal.timeout(60000),
      });
      const text = await response.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { raw: text };
      }

      if (!response.ok) {
        throw new Error(json?.message || json?.error || `Walrus upload failed with HTTP ${response.status}`);
      }

      return { ...extractWalrusBlob(json), walrusResponse: json };
    } catch (error) {
      lastError = error;
      console.error(`[Walrus] Attempt ${attempt} failed:`, error.message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastError;
}

app.get('/api/health', async (_req, res) => {
  let dbOk = false;
  try { await pool.query('SELECT 1'); dbOk = true; } catch {}
  res.json({ ok: true, network: 'testnet', database: dbOk, walrusEndpoint: Boolean(process.env.WALRUS_ENDPOINT), tatumRpc: Boolean(process.env.TATUM_API_KEY) });
});

// Wallet info endpoint powered by Tatum Sui RPC
app.get('/api/wallet', requireWalletSignature, async (req, res, next) => {
  try {
    const [balance, ownedObjects] = await Promise.all([
      tatumSuiRpc('suix_getBalance', [req.walletAddress, '0x2::sui::SUI']),
      tatumSuiRpc('suix_getOwnedObjects', [req.walletAddress, { options: { showType: true } }]),
    ]);
    res.json({
      walletAddress: req.walletAddress,
      balance: balance?.totalBalance || '0',
      coinCount: balance?.coinObjectCount || 0,
      ownedObjectsCount: ownedObjects?.data?.length || 0,
      rpcProvider: 'Tatum',
      rpcEndpoint: TATUM_SUI_RPC,
    });
  } catch (error) {
    console.error('[Tatum] Wallet info failed:', error.message);
    next(error);
  }
});

// Execute a pre-signed transaction via Tatum RPC
app.post('/api/execute-tx', requireWalletSignature, async (req, res, next) => {
  try {
    const { signature, bytes } = req.body;
    if (!signature || !bytes) {
      throw Object.assign(new Error('Transaction signature and bytes are required.'), { status: 400 });
    }

    const result = await tatumSuiRpc('sui_executeTransactionBlock', [
      bytes,    // txBytes
      [signature], // signatures
      { showEffects: true, showEvents: true }, // options
      'WaitForLocalExecution', // requestType
    ]);

    console.log('[Tatum] Transaction executed for', req.walletAddress, result?.effects?.status?.status);
    res.json({ ok: true, effects: result?.effects, digest: result?.digest });
  } catch (error) {
    console.error('[Tatum] Transaction execution failed:', error.message);
    next(error);
  }
});

app.get('/api/uploads', requireWalletSignature, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM uploads WHERE wallet_address = $1 ORDER BY upload_timestamp DESC, id DESC`,
      [req.walletAddress]
    );

    const { rows: [stats] } = await pool.query(
      `SELECT COUNT(*) AS total_files, COALESCE(SUM(file_size), 0) AS total_storage, MAX(upload_timestamp) AS latest_upload_date FROM uploads WHERE wallet_address = $1`,
      [req.walletAddress]
    );

    res.json({
      walletAddress: req.walletAddress,
      uploads: rows.map(rowToUpload),
      stats: {
        totalFiles: Number(stats.total_files || 0),
        totalStorage: Number(stats.total_storage || 0),
        latestUploadDate: stats.latest_upload_date || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/uploads', requireWalletSignature, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw Object.assign(new Error('A file is required.'), { status: 400 });
    }

    const walrus = await storeOnWalrus(req.file, req.walletAddress);
    const { rows: [row] } = await pool.query(
      `INSERT INTO uploads (wallet_address, file_name, file_size, file_type, blob_id, blob_object_id, walrus_response) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.walletAddress,
        req.file.originalname,
        req.file.size,
        req.file.mimetype || 'application/octet-stream',
        walrus.blobId,
        walrus.blobObjectId,
        JSON.stringify(walrus.walrusResponse),
      ]
    );

    res.status(201).json({ upload: rowToUpload(row) });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error.cause || error);
  res.status(error.status || 500).json({ error: error.message || 'Server error' });
});

// SPA fallback: serve index.html for non-API routes
if (existsSync(distPath)) {
  app.get('/{*path}', (_req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Agile Vault API running on port ${port} (${suiNetwork})`);
});
