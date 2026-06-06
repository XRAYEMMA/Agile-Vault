import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  Award,
  BadgeCheck,
  Check,
  ChevronRight,
  Clipboard,
  Cloud,
  Database,
  Download,
  File,
  FileImage,
  FileText,
  FileVideo,
  Fingerprint,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useWallets,
  useCurrentAccount,
} from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import tatumLogo from './assets/tatum-logo.svg';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const SUI_NETWORK = 'testnet';
const TATUM_SUI_RPC_URL = import.meta.env.VITE_TATUM_SUI_RPC_URL || 'https://api.tatum.io/v3/blockchain/node/sui-testnet';
const queryClient = new QueryClient();

const { networkConfig } = createNetworkConfig({
  testnet: { url: TATUM_SUI_RPC_URL },
});

function shortAddress(address = '') {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected';
}

function fileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function uploadDate(value) {
  if (!value) return 'No uploads yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function getFileType(fileName = '', mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf')) return 'pdf';
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx', 'txt', 'md', 'csv'].includes(ext)) return 'doc';
  return 'file';
}

function formatSuiBalance(mist = '0') {
  const sui = Number(mist) / 1e9;
  return sui < 0.001 && sui > 0 ? sui.toExponential(2) : sui.toFixed(sui >= 1 ? 4 : 6);
}

function FileIcon({ type }) {
  const props = { size: 22, strokeWidth: 1.8 };
  if (type === 'image') return <FileImage {...props} />;
  if (type === 'video') return <FileVideo {...props} />;
  if (type === 'pdf' || type === 'doc') return <FileText {...props} />;
  return <File {...props} />;
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div className="toast">
      <span className="toast-icon"><Check size={16} /></span>
      <div><strong>{toast.title}</strong><p>{toast.message}</p></div>
      <button onClick={onClose} aria-label="Close notification"><X size={16} /></button>
    </div>
  );
}

function makeWalletMessage(address) {
  return `Agile Vault Sui testnet access request\nWallet: ${address.toLowerCase()}\nTimestamp: ${new Date().toISOString()}\nPurpose: verify wallet ownership for upload history and Walrus storage`;
}

function encodeHeaderValue(value = '') {
  return btoa(unescape(encodeURIComponent(value)));
}

async function apiRequest(path, session, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'x-wallet-address': session.address,
      'x-wallet-message': encodeHeaderValue(session.message),
      'x-wallet-signature': session.signature,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
}

const WALLET_CONNECT_TIMEOUT_MS = 120000;
const STORAGE_FEE_MIST = 10_000_000n; // 0.01 SUI per upload
const STORAGE_FEE_SUI = 0.01;
const VAULT_FEE_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000002';
const MIN_BALANCE_MIST = 5_000_000n; // 0.005 SUI minimum to allow upload

// Detect all wallet extensions installed on the device
function detectInstalledWallets() {
  const detected = [];
  const w = window;

  if (w.okxwallet || w.okexchain) {
    detected.push({ name: 'OKX Wallet', id: 'okx', icon: null, provider: w.okxwallet, hasSui: Boolean(w.okxwallet?.sui) });
  }
  if (w.phantom?.sui) {
    detected.push({ name: 'Phantom', id: 'phantom', icon: null, provider: w.phantom.sui, hasSui: true });
  } else if (w.phantom?.solana) {
    detected.push({ name: 'Phantom', id: 'phantom', icon: null, provider: w.phantom.solana, hasSui: false });
  }
  if (w.ethereum?.isMetaMask) {
    detected.push({ name: 'MetaMask', id: 'metamask', icon: null, provider: w.ethereum, hasSui: false });
  }
  if (w.trustwallet) {
    detected.push({ name: 'Trust Wallet', id: 'trust', icon: null, provider: w.trustwallet, hasSui: false });
  }
  if (w.coinbaseWalletExtension) {
    detected.push({ name: 'Coinbase Wallet', id: 'coinbase', icon: null, provider: w.coinbaseWalletExtension, hasSui: false });
  }
  if (w.backpack) {
    detected.push({ name: 'Backpack', id: 'backpack', icon: null, provider: w.backpack, hasSui: Boolean(w.backpack?.sui) });
  }
  return detected;
}

function walletTimeout(walletName) {
  return new Promise((_, reject) => {
    window.setTimeout(
      () => reject(new Error(`${walletName} timed out after 2 minutes. Make sure the wallet extension is unlocked and try again.`)),
      WALLET_CONNECT_TIMEOUT_MS
    );
  });
}

function App() {
  const wallets = useWallets();
  const [walletAccount, setWalletAccount] = useState(null);
  const [activeWallet, setActiveWallet] = useState(null);
  const [activeSignMethod, setActiveSignMethod] = useState(null);
  const [session, setSession] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalStorage: 0, latestUploadDate: null });
  const [walletBalance, setWalletBalance] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [batchProgress, setBatchProgress] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [lastUpload, setLastUpload] = useState(null);
  const [toast, setToast] = useState(null);
  const [visibleCount, setVisibleCount] = useState(10);
  const inputRef = useRef(null);

  const connected = Boolean(session?.address);
  const walletLabel = useMemo(() => shortAddress(session?.address), [session?.address]);
  const isConnecting = isWalletConnecting;

  useEffect(() => {
    const syncRoute = () => {
      if (window.location.pathname === '/dashboard' && !connected) window.history.replaceState({}, '', '/');
    };
    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [connected]);

  useEffect(() => {
    setSession(null);
    setUploads([]);
    setStats({ totalFiles: 0, totalStorage: 0, latestUploadDate: null });
    setVisibleCount(10);
    setWalletBalance(null);
  }, [walletAccount?.address]);

  const goToRoute = (path) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
  };

  const notify = (title, message) => {
    setToast({ title, message });
    window.clearTimeout(window.__agileToast);
    window.__agileToast = window.setTimeout(() => setToast(null), 3600);
  };

  const refreshVault = async (activeSession = session) => {
    if (!activeSession) return;
    const [uploadData, walletData] = await Promise.all([
      apiRequest('/api/uploads', activeSession),
      apiRequest('/api/wallet', activeSession).catch(() => null),
    ]);
    setUploads(uploadData.uploads || []);
    setStats(uploadData.stats || { totalFiles: 0, totalStorage: 0, latestUploadDate: null });
    if (walletData?.balance) {
      setWalletBalance({ totalBalance: walletData.balance, coinObjectCount: walletData.coinCount });
    }
  };

  const selectWallet = async (wallet) => {
    if (isWalletConnecting) return;

    setIsWalletConnecting(true);
    setWalletMenuOpen(false);
    console.log('[Agile] Connecting wallet:', wallet.name);
    console.log('[Agile] Available features:', Object.keys(wallet.features || {}));

    if (!wallet.features?.['standard:connect']) {
      console.error('[Agile] Wallet missing standard:connect feature:', wallet.name);
      notify('Wallet incompatible', `${wallet.name} does not support the standard connect protocol.`);
      setIsWalletConnecting(false);
      return;
    }

    try {
      let result;
      try {
        result = await Promise.race([
          wallet.features['standard:connect'].connect({ silent: false }),
          walletTimeout(wallet.name),
        ]);
      } catch (retryErr) {
        // Retry without options for wallets that don't accept params
        console.log('[Agile] Retrying connect without options for', wallet.name);
        result = await Promise.race([
          wallet.features['standard:connect'].connect(),
          walletTimeout(wallet.name),
        ]);
      }
      const suiAccount = result.accounts?.find((nextAccount) =>
        nextAccount.chains?.some((chain) => chain.startsWith('sui:'))
      );

      if (!suiAccount) {
        throw new Error(`${wallet.name} connected, but no Sui account was returned.`);
      }

      setActiveWallet(wallet);
      setWalletAccount(suiAccount);

      console.log('[Agile] Wallet connected successfully:', wallet.name, suiAccount.address);
      notify('Wallet connected', 'Now sign the Agile Vault ownership message to enter.');
    } catch (error) {
      console.error('[Agile] Wallet connection failed:', error, error?.cause);
      notify('Wallet connection failed', error?.message || 'The wallet did not approve the connection request.');
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const installedWallets = useMemo(() => detectInstalledWallets(), []);

  const selectInstalledWallet = async (iw) => {
    if (isWalletConnecting) return;
    setIsWalletConnecting(true);
    setWalletMenuOpen(false);

    if (!iw.hasSui) {
      notify('Wallet incompatible', `${iw.name} does not support Sui on this device. Use OKX, Phantom, Sui Wallet, or Slush.`);
      setIsWalletConnecting(false);
      return;
    }

    try {
      let address;
      let signFn;

      if (iw.id === 'okx' && iw.provider?.sui) {
        const accounts = await Promise.race([
          iw.provider.sui.connect({ silent: false }),
          walletTimeout(iw.name),
        ]);
        address = accounts?.[0] || accounts?.address;
        signFn = (msg) => iw.provider.sui.signPersonalMessage({ message: msg });
      } else if (iw.id === 'phantom' && iw.provider) {
        const result = await Promise.race([
          iw.provider.connect({ silent: false }),
          walletTimeout(iw.name),
        ]);
        address = result?.address;
        signFn = (msg) => iw.provider.signPersonalMessage({ message: msg });
      } else {
        throw new Error(`${iw.name} Sui provider not available.`);
      }

      if (!address) throw new Error(`${iw.name} did not return an address.`);

      const account = { address, chains: ['sui:testnet'] };
      const suiProvider = iw.id === 'okx' ? iw.provider.sui : iw.provider;

      // Create a pseudo wallet object with full feature support
      const pseudoWallet = {
        name: iw.name,
        features: {
          'sui:signPersonalMessage': {
            signPersonalMessage: async ({ message }) => {
              return signFn(message);
            },
          },
          'sui:signAndExecuteTransaction': {
            signAndExecuteTransaction: async ({ transaction, chain, account: acc }) => {
              const txBytes = await transaction.build({ client: suiProvider });
              return suiProvider.signAndExecuteTransactionBlock
                ? suiProvider.signAndExecuteTransactionBlock({ transactionBlock: txBytes, chain })
                : suiProvider.signAndExecuteTransaction({ transaction, chain });
            },
          },
          'sui:signTransaction': {
            signTransaction: async ({ transaction, chain, account: acc }) => {
              return suiProvider.signTransactionBlock
                ? suiProvider.signTransactionBlock({ transactionBlock: transaction, chain })
                : suiProvider.signTransaction({ transaction, chain });
            },
          },
        },
      };

      setActiveWallet(pseudoWallet);
      setActiveSignMethod(iw.id);
      setWalletAccount(account);
      notify('Wallet connected', `Connected via ${iw.name}. Sign the ownership message to enter.`);
    } catch (error) {
      console.error('[Agile] Direct wallet connect failed:', error);
      notify('Wallet connection failed', error?.message || `${iw.name} could not connect.`);
    } finally {
      setIsWalletConnecting(false);
    }
  };

  const signAndEnter = async () => {
    if (!walletAccount?.address || !activeWallet) {
      notify('Choose a wallet', 'Use the wallet selector to connect an installed Sui testnet wallet.');
      return;
    }

    const signFeature = activeWallet.features?.['sui:signPersonalMessage'];
    if (!signFeature?.signPersonalMessage) {
      notify('Wallet incompatible', `${activeWallet.name} does not support Sui personal message signing.`);
      return;
    }

    setIsSigning(true);
    try {
      const message = makeWalletMessage(walletAccount.address);
      const signed = await signFeature.signPersonalMessage({
        message: new TextEncoder().encode(message),
        account: walletAccount,
        chain: 'sui:testnet',
      });
      const nextSession = { address: walletAccount.address.toLowerCase(), message, signature: signed.signature };
      setSession(nextSession);
      setVisibleCount(10);
      await refreshVault(nextSession);
      goToRoute('/dashboard');
      notify('Wallet verified', 'Signature accepted. Your testnet vault is unlocked.');
    } catch (error) {
      notify('Signature required', error.message || 'Sign the ownership message to enter Agile Vault.');
    } finally {
      setIsSigning(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await activeWallet?.features?.['standard:disconnect']?.disconnect?.();
    } catch (error) {
      console.warn('[Agile] Wallet disconnect warning:', error);
    }
    setActiveWallet(null);
    setWalletAccount(null);
    setUploads([]);
    setStats({ totalFiles: 0, totalStorage: 0, latestUploadDate: null });
    setSelectedFiles([]);
    setBatchProgress([]);
    setLastUpload(null);
    goToRoute('/');
    notify('Wallet disconnected', 'Session cleared. Reconnect and sign again to unlock the vault.');
  };

  const chooseFiles = (files) => {
    if (!connected || !files?.length) return;
    setSelectedFiles(Array.from(files));
    setBatchProgress([]);
    setLastUpload(null);
  };

  const uploadFiles = async () => {
    if (!connected) return notify('Connect wallet first', 'Wallet signature is required before upload.');
    if (!selectedFiles.length) return notify('No files selected', 'Drop files or click the upload area first.');
    if (!activeWallet?.features?.['sui:signPersonalMessage']?.signPersonalMessage) {
      return notify('Wallet incompatible', 'Your wallet does not support message signing.');
    }

    // Step 0: Check SUI balance
    const totalFee = STORAGE_FEE_MIST * BigInt(selectedFiles.length);
    const currentBalance = walletBalance ? BigInt(walletBalance.totalBalance || '0') : 0n;
    if (currentBalance < MIN_BALANCE_MIST) {
      return notify('Insufficient SUI balance', `You need at least 0.005 SUI to upload. Your balance: ${formatSuiBalance(String(currentBalance))} SUI.`);
    }
    if (currentBalance < totalFee) {
      return notify('Insufficient SUI', `Uploading ${selectedFiles.length} file(s) costs ${formatSuiBalance(String(totalFee))} SUI. Your balance: ${formatSuiBalance(String(currentBalance))} SUI.`);
    }

    // Initialize progress tracking
    const progress = selectedFiles.map((f) => ({ name: f.name, status: 'pending', blobId: null }));
    setBatchProgress(progress);

    // Upload each file sequentially
    let successCount = 0;
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'signing' } : item));

      // Step 1: Sign upload authorization
      try {
        const uploadMessage = `Agile Vault Upload Authorization\nFile: ${file.name}\nSize: ${file.size} bytes\nFee: ${STORAGE_FEE_SUI} SUI\nOwner: ${session.address}\nTimestamp: ${new Date().toISOString()}\nNetwork: Sui testnet`;
        await activeWallet.features['sui:signPersonalMessage'].signPersonalMessage({
          message: new TextEncoder().encode(uploadMessage),
          account: walletAccount,
          chain: 'sui:testnet',
        });
      } catch (error) {
        setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'cancelled' } : item));
        notify('Upload cancelled', `File "${file.name}" — ${error.message || 'signature rejected.'}`);
        continue;
      }

      // Step 2: Pay storage fee
      setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'paying' } : item));
      try {
        const tx = new Transaction();
        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(STORAGE_FEE_MIST)]);
        tx.transferObjects([coin], tx.pure.address(VAULT_FEE_ADDRESS));
        tx.setSender(session.address);
        const signAndExecFeature = activeWallet.features?.['sui:signAndExecuteTransaction'];
        const signTxFn = activeWallet.features?.['sui:signTransaction'];
        if (signAndExecFeature?.signAndExecuteTransaction) {
          await Promise.race([signAndExecFeature.signAndExecuteTransaction({ transaction: tx, chain: 'sui:testnet', account: walletAccount }), walletTimeout(`${activeWallet.name} tx`)]);
        } else if (signTxFn?.signTransaction) {
          const signed = await Promise.race([signTxFn.signTransaction({ transaction: tx, chain: 'sui:testnet', account: walletAccount }), walletTimeout(`${activeWallet.name} tx`)]);
          await apiRequest('/api/execute-tx', session, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signature: signed.signature, bytes: signed.bytes }) });
        } else {
          throw new Error('Wallet does not support transaction signing.');
        }
      } catch (error) {
        setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'failed' } : item));
        notify('Payment failed', `File "${file.name}" — ${error.message}`);
        continue;
      }

      // Step 3: Upload to Walrus
      setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'uploading' } : item));
      try {
        const formData = new FormData();
        formData.append('file', file);
        const data = await apiRequest('/api/uploads', session, { method: 'POST', body: formData });
        setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'done', blobId: data.upload.blobId } : item));
        if (i === 0) setLastUpload(data.upload);
        successCount++;
      } catch (error) {
        setBatchProgress((p) => p.map((item, idx) => idx === i ? { ...item, status: 'failed' } : item));
        notify('Upload failed', `File "${file.name}" — ${error.message}`);
      }
    }

    setSelectedFiles([]);
    if (successCount > 0) {
      await refreshVault();
      notify('Batch complete', `${successCount}/${selectedFiles.length} file(s) stored on Walrus. ${formatSuiBalance(String(totalFee))} SUI deducted.`);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFiles(event.dataTransfer.files);
  };

  const copyId = async (id) => {
    await navigator.clipboard?.writeText(id);
    notify('Walrus blob ID copied', id);
  };

  const downloadBlob = async (blobId, fileName) => {
    try {
      const url = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
      notify('Downloading from Walrus aggregator...', fileName);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Aggregator returned HTTP ${response.status}`);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileName || `blob-${blobId.slice(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      notify('Download complete', fileName);
    } catch (err) {
      notify('Download failed', err.message);
    }
  };

  const generateCertificate = (file) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 560;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 800, 560);
    grad.addColorStop(0, '#FAF9F5');
    grad.addColorStop(1, '#F0E8DA');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 560);
    ctx.strokeStyle = '#8B6F47';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, 760, 520);
    ctx.strokeStyle = '#D7CBB8';
    ctx.lineWidth = 1;
    ctx.strokeRect(30, 30, 740, 500);
    [[40, 40], [740, 40], [40, 510], [740, 510]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = '#8B6F47'; ctx.fill(); });
    ctx.fillStyle = '#8B6F47';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AGILE VAULT', 400, 75);
    ctx.font = 'bold 32px Georgia, serif';
    ctx.fillStyle = '#2B2B2B';
    ctx.fillText('Certificate of Storage', 400, 115);
    ctx.fillStyle = '#77716A';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('On-Chain Verified \u2022 Walrus Testnet \u2022 Sui Blockchain', 400, 145);
    ctx.beginPath(); ctx.moveTo(120, 170); ctx.lineTo(680, 170); ctx.strokeStyle = '#D7CBB8'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#2B2B2B';
    ctx.font = '15px Inter, sans-serif';
    ctx.fillText('This certifies that the following file has been permanently stored', 400, 205);
    ctx.fillText('on Walrus decentralized storage via the Sui testnet blockchain.', 400, 225);
    const details = [['File Name', file.fileName], ['File Size', fileSize(file.fileSize)], ['Blob ID', file.blobId.length > 50 ? file.blobId.slice(0, 24) + '...' + file.blobId.slice(-10) : file.blobId], ['Owner', shortAddress(file.walletAddress)], ['Timestamp', uploadDate(file.uploadTimestamp)], ['Network', 'Sui Testnet']];
    let yPos = 270;
    details.forEach(([label, value]) => {
      ctx.textAlign = 'left'; ctx.fillStyle = '#77716A'; ctx.font = 'bold 12px Inter, sans-serif'; ctx.fillText(label.toUpperCase(), 100, yPos);
      ctx.fillStyle = '#2B2B2B'; ctx.font = '14px Inter, sans-serif'; ctx.fillText(value, 280, yPos); yPos += 30;
    });
    ctx.beginPath(); ctx.moveTo(120, 470); ctx.lineTo(680, 470); ctx.strokeStyle = '#D7CBB8'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#8B6F47'; ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('Powered by Tatum RPC \u2022 Stored on Walrus \u2022 Verified on Sui', 400, 500);
    ctx.fillStyle = '#77716A'; ctx.font = '11px Inter, sans-serif';
    ctx.fillText(`Certificate generated ${new Date().toLocaleDateString()}`, 400, 520);
    const link = document.createElement('a');
    link.download = `certificate-${file.blobId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    notify('Certificate downloaded', `${file.fileName} storage certificate saved as PNG.`);
  };

  const storageGB = stats.totalStorage / (1024 * 1024 * 1024);
  const pricePerGB = { walrus: 0.00015 * 30, aws: 0.023, gcp: 0.020, azure: 0.021 };
  const yearlyGB = { walrus: pricePerGB.walrus * 12, aws: pricePerGB.aws * 12, gcp: pricePerGB.gcp * 12, azure: pricePerGB.azure * 12 };
  const yearlyActual = { walrus: storageGB * yearlyGB.walrus, aws: storageGB * yearlyGB.aws, gcp: storageGB * yearlyGB.gcp, azure: storageGB * yearlyGB.azure };
  const maxYearly = Math.max(yearlyActual.aws, yearlyActual.gcp, yearlyActual.azure, 0.001);
  const formatCost = (v) => v < 0.001 ? `$${v.toFixed(6)}` : v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
  const PAGE_SIZE = 10;
  const visibleUploads = uploads.slice(0, visibleCount);
  const hasMore = uploads.length > visibleCount;
  const remaining = uploads.length - visibleCount;
  const isBatchUploading = batchProgress.some((p) => ['signing', 'paying', 'uploading'].includes(p.status));

  return (
    <main>
      <nav className="navbar">
        <div className="brand"><div className="logo"><Archive size={22} /></div><div><strong>Agile Vault</strong><span>Tatum identity + Walrus storage</span></div></div>
        <div className="nav-links"><a href="#identity">Why Tatum</a><a href="#features">Features</a><a href="#how-it-works">How it works</a>{connected && <a href="#vault">My Vault</a>}</div>
        <div className="nav-actions">
          {!walletAccount ? (
            <div className="wallet-menu-wrap">
              <button className="wallet-pill" onClick={() => setWalletMenuOpen((open) => !open)} disabled={isConnecting}>
                {isConnecting ? <Loader2 className="spin" size={17} /> : <Wallet size={17} />} {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
              {walletMenuOpen && <WalletMenu wallets={wallets} installedWallets={installedWallets} onSelect={selectWallet} onSelectInstalled={selectInstalledWallet} />}
            </div>
          ) : (
            <button className={`wallet-pill ${connected ? 'connected' : ''}`} onClick={connected ? undefined : signAndEnter} disabled={isSigning}>
              {isSigning ? <Loader2 className="spin" size={17} /> : <Wallet size={17} />} {connected ? walletLabel : 'Sign to Enter'}
            </button>
          )}
          {(walletAccount || connected) && <button className="ghost" onClick={disconnectWallet}>Disconnect Wallet</button>}
        </div>
      </nav>

      {!connected ? (
        <div className="public-shell fade-in">
          <section className="gate">
            <div className="gate-copy">
              <p className="eyebrow"><Sparkles size={14} /> Tatum RPC × Walrus Decentralized Storage</p>
              <h1>Store on Walrus. Verify with Tatum. Own with Sui.</h1>
              <p>A decentralized file vault where your wallet is your identity and every upload is permanent, verifiable, and yours. Powered by Tatum's Sui RPC gateway for on-chain fee transactions and Walrus testnet for certified blob storage.</p>
              <div className="hero-actions">
                {!walletAccount ? <div className="wallet-menu-wrap"><button className="primary" onClick={() => setWalletMenuOpen((open) => !open)} disabled={isConnecting}>{isConnecting ? <Loader2 className="spin" size={18} /> : <Wallet size={18} />} {isConnecting ? 'Connecting…' : 'Enter Vault'}</button>{walletMenuOpen && <WalletMenu wallets={wallets} installedWallets={installedWallets} onSelect={selectWallet} onSelectInstalled={selectInstalledWallet} />}</div> : <button className="primary" onClick={signAndEnter} disabled={isSigning}>{isSigning ? <Loader2 className="spin" size={18} /> : <Wallet size={18} />} Sign to Enter Vault</button>}
                <a href="#features">Explore features</a>
              </div>
              <div className="trust-row"><span>Tatum-verified identity</span><span>On-chain storage fees</span><span>Certified Walrus blobs</span></div>
            </div>
            <div className="gate-card">
              <div className="gate-card-top"><div className="gate-icon"><Lock size={24} /></div><span>Locked dashboard</span></div>
              <h2>Connect your wallet. Sign ownership. Open the vault.</h2>
              <p>Sessions are not auto-restored. Refreshing the page requires a fresh wallet signature.</p>
              <div className="locked-upload"><div className="upload-orb"><Upload size={24} /></div><strong>Vault is sealed</strong><span>No uploads or history are available until the wallet signs.</span></div>
            </div>
          </section>

          <TatumIdentitySection />
          <FeaturesSection />
          <HowItWorks />
          <TrustSection />
          <Footer />
        </div>
      ) : (
        <section className="dashboard fade-in">
          <div className="dashboard-top">
            <div className="hero-copy"><p className="eyebrow"><Sparkles size={14} /> Dashboard unlocked</p><h2>Upload files. Wallet ownership is verified.</h2><p>Every upload is linked to {walletLabel}, stored on Walrus testnet, and persisted in the backend database.</p></div>
            <div className="stat-strip"><div><strong>{stats.totalFiles}</strong><span>Files uploaded</span></div><div><strong>{fileSize(stats.totalStorage)}</strong><span>Total storage</span></div><div><strong>{uploadDate(stats.latestUploadDate)}</strong><span>Latest upload</span></div></div>
          </div>

          <div className="grid">
            <section className="card upload-card focus-card">
              <div className="card-heading"><div><p className="eyebrow">Walrus testnet upload</p><h2>Upload to Agile Vault</h2></div><Cloud className="muted-icon" size={26} /></div>
              <div className={`dropzone ${isDragging ? 'dragging' : ''}`} onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
                <input ref={inputRef} type="file" multiple onChange={(e) => chooseFiles(e.target.files)} />
                <div className="upload-orb"><Upload size={28} /></div>
                <h3>{selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'Drop files here or click to upload'}</h3>
                <p>{selectedFiles.length ? selectedFiles.map(f => f.name).join(', ') : 'Supports batch uploads — select multiple files at once.'}</p>
              </div>
              {batchProgress.length > 0 && <div className="batch-progress">{batchProgress.map((p, i) => <div key={i} className={`batch-item batch-${p.status}`}><span className="batch-name">{p.name}</span><span className="batch-status">{p.status === 'done' ? 'Stored' : p.status === 'pending' ? 'Waiting' : p.status === 'signing' ? 'Signing...' : p.status === 'paying' ? 'Paying fee...' : p.status === 'uploading' ? 'Uploading...' : p.status === 'cancelled' ? 'Cancelled' : 'Failed'}</span>{p.blobId && <code>{p.blobId.slice(0, 12)}...</code>}</div>)}</div>}
              <button className="primary wide" disabled={isBatchUploading || !selectedFiles.length} onClick={uploadFiles}>{isBatchUploading ? <Loader2 className="spin" size={18} /> : <Upload size={18} />}{isBatchUploading ? 'Processing batch...' : selectedFiles.length > 1 ? `Upload ${selectedFiles.length} Files` : 'Sign & Upload'}</button>
              {selectedFiles.length > 0 && connected && <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 8 }}>Storage fee: {(STORAGE_FEE_SUI * selectedFiles.length).toFixed(2)} SUI total ({STORAGE_FEE_SUI} SUI/file)</p>}
              {!walletBalance && connected && <p style={{ textAlign: 'center', fontSize: 13, color: '#c44', marginTop: 4 }}>No SUI balance detected — get testnet faucet tokens to upload</p>}
              {lastUpload && <div className="result"><ShieldCheck size={18} /><div><strong>{lastUpload.fileName}</strong><span>{fileSize(lastUpload.fileSize)} • blob_id: {lastUpload.blobId}</span></div></div>}
            </section>

            <aside className="side-stack">
              <section className="card tatum-dashboard-card"><div className="verified-heading"><span className="verified-dot" /><p className="eyebrow">Tatum Identity</p></div><h3>Vault verified</h3><div className="info-row"><span>Wallet Address</span><strong>{walletLabel}</strong></div><div className="info-row"><span>Vault Status</span><strong className="ok">Signed</strong></div><div className="info-row"><span>SUI Balance</span><strong>{walletBalance ? `${formatSuiBalance(walletBalance.totalBalance)} SUI` : '—'}</strong></div><div className="info-row"><span>Files Owned</span><strong>{stats.totalFiles}</strong></div><div className="info-row"><span>RPC Provider</span><strong>Tatum</strong></div><div className="info-row"><span>Network</span><strong>Sui testnet</strong></div></section>
              <section className="card wallet-card"><p className="eyebrow">Ownership</p><h3>Identity → Storage</h3><div className="info-row"><span>Owner</span><strong>{walletLabel}</strong></div><div className="info-row"><span>Identity</span><strong>Tatum / Sui wallet</strong></div><div className="info-row"><span>Storage</span><strong>Walrus testnet</strong></div><div className="info-row"><span>Total Storage</span><strong>{fileSize(stats.totalStorage)}</strong></div></section>
              {stats.totalFiles > 0 && <section className="card cost-card"><p className="eyebrow"><Database size={14} /> Storage Cost Comparison</p><h3>Walrus vs Cloud</h3><p className="cost-subtitle">Your {fileSize(stats.totalStorage)} — cost per GB/month</p><div className="cost-bars"><div className="cost-bar-row"><span className="cost-label">Walrus</span><div className="cost-bar"><div className="cost-bar-fill walrus" style={{ width: `${Math.max(2, (pricePerGB.walrus / pricePerGB.aws) * 100)}%` }} /></div><strong className="ok">${pricePerGB.walrus.toFixed(4)}</strong></div><div className="cost-bar-row"><span className="cost-label">AWS S3</span><div className="cost-bar"><div className="cost-bar-fill aws" style={{ width: '100%' }} /></div><strong>${pricePerGB.aws.toFixed(3)}</strong></div><div className="cost-bar-row"><span className="cost-label">Google</span><div className="cost-bar"><div className="cost-bar-fill gcp" style={{ width: `${(pricePerGB.gcp / pricePerGB.aws) * 100}%` }} /></div><strong>${pricePerGB.gcp.toFixed(3)}</strong></div><div className="cost-bar-row"><span className="cost-label">Azure</span><div className="cost-bar"><div className="cost-bar-fill azure" style={{ width: `${(pricePerGB.azure / pricePerGB.aws) * 100}%` }} /></div><strong>${pricePerGB.azure.toFixed(3)}</strong></div></div><div className="cost-yearly"><p className="cost-yearly-title">Your yearly projection</p><div className="cost-yearly-grid"><div className="cost-yearly-item"><span>Walrus</span><strong className="ok">{formatCost(yearlyActual.walrus)}</strong></div><div className="cost-yearly-item"><span>AWS</span><strong>{formatCost(yearlyActual.aws)}</strong></div><div className="cost-yearly-item"><span>Google</span><strong>{formatCost(yearlyActual.gcp)}</strong></div><div className="cost-yearly-item"><span>Azure</span><strong>{formatCost(yearlyActual.azure)}</strong></div></div></div><p className="cost-savings">Walrus is ~{((1 - pricePerGB.walrus / pricePerGB.aws) * 100).toFixed(1)}% cheaper than AWS S3 per GB</p></section>}
            </aside>
          </div>

          <section className="vault-section" id="vault">
            <div className="section-title"><div><p className="eyebrow">Upload History</p><h2>My Vault</h2></div><span>{stats.totalFiles} files • {fileSize(stats.totalStorage)}</span></div>
            {uploads.length === 0 ? <div className="empty card"><Archive size={34} /><h3>Your vault is empty</h3><p>Upload your first file to store it on Walrus and persist ownership metadata.</p></div> : <><div className="file-list">{visibleUploads.map((file) => <article className="file-card" key={file.id}><div className="file-icon"><FileIcon type={getFileType(file.fileName, file.fileType)} /></div><div className="file-meta"><strong>{file.fileName}</strong><span>{fileSize(file.fileSize)} • {uploadDate(file.uploadTimestamp)}</span><span className="ownership-meta">Owner: {shortAddress(file.walletAddress)} • Verified by wallet signature</span><code>{file.blobId}</code></div><div className="file-actions"><a href={`https://walruscan.com/testnet/blob/${file.blobId}`} target="_blank" rel="noreferrer">View blob <ChevronRight size={15} /></a><button onClick={() => downloadBlob(file.blobId, file.fileName)}><Download size={15} /> Download</button><button onClick={() => generateCertificate(file)}><Award size={15} /> Certificate</button><button onClick={() => copyId(file.blobId)}><Clipboard size={15} /> Copy ID</button></div></article>)}</div>{hasMore && <div className="load-more-wrap"><button className="ghost load-more" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>Load More ({remaining} remaining)</button></div>}</>}
            <Footer />
          </section>
        </section>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </main>
  );
}

function WalletMenu({ wallets, installedWallets, onSelect, onSelectInstalled }) {
  return (
    <div className="wallet-menu">
      <strong>Choose wallet</strong>
      {wallets.length === 0 && installedWallets.length === 0 ? (
        <p>No wallet extensions detected. Install a Sui-compatible wallet (Sui Wallet, OKX, Phantom, Slush) and refresh.</p>
      ) : (
        <>
          {wallets.map((wallet) => (
            <button key={wallet.name} onClick={() => onSelect(wallet)}>
              {wallet.icon && <img src={wallet.icon} alt="" />}
              <span>{wallet.name}</span>
            </button>
          ))}
          {installedWallets.filter(iw => !wallets.some(sw => sw.name.toLowerCase().includes(iw.name.toLowerCase()))).map((iw) => (
            <button key={iw.id} onClick={() => onSelectInstalled(iw)}>
              <span>{iw.name} {iw.hasSui ? '' : '(no Sui)'}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function TatumIdentitySection() {
  const identityCards = [
    { icon: <Fingerprint size={22} />, title: 'Real Wallet Identity', copy: 'Users connect an installed Sui testnet wallet and sign a message to prove ownership.' },
    { icon: <BadgeCheck size={22} />, title: 'Ownership Verification', copy: 'The backend verifies the signature before returning private wallet-scoped history.' },
    { icon: <KeyRound size={22} />, title: 'No Auto Reconnect', copy: 'Refreshing clears the active UI session; users must reconnect and sign again.' },
  ];
  return <section className="identity-section" id="identity"><div className="identity-panel"><div className="section-title stacked"><p className="eyebrow"><ShieldCheck size={14} /> Why Tatum</p><h2>Powered by Tatum Identity</h2><p>Tatum provides testnet blockchain infrastructure while wallet signatures establish the user identity.</p></div><div className="tatum-badge" aria-label="Tatum logo"><div className="tatum-logo-shell"><img src={tatumLogo} alt="Tatum" /></div><strong>Tatum</strong><small>identity layer</small></div></div><div className="identity-grid">{identityCards.map((card) => <article className="identity-card" key={card.title}><div className="identity-icon">{card.icon}</div><h3>{card.title}</h3><p>{card.copy}</p></article>)}</div></section>;
}

function FeaturesSection() {
  return <section className="marketing-section" id="features"><div className="section-title stacked"><p className="eyebrow"><Layers size={14} /> Features</p><h2>A vault built for people who want their files to follow their wallet, not a platform login.</h2></div><div className="feature-grid"><article className="mini-card"><Upload size={22} /><h3>Real uploads</h3><p>Files are sent to the backend and stored through the configured Walrus testnet publisher endpoint.</p></article><article className="mini-card"><Cloud size={22} /><h3>Persistent history</h3><p>Upload metadata, blob IDs, wallet owners, and stats are written to a database.</p></article><article className="mini-card"><Wallet size={22} /><h3>Wallet-scoped access</h3><p>History is returned only after signature verification for the requesting wallet.</p></article></div></section>;
}

function HowItWorks() {
  const steps = [
    { title: 'Choose installed wallet', copy: 'Pick the wallet that becomes your vault key and ownership identity.' },
    { title: 'Sign ownership proof', copy: 'Approve one message so Agile Vault knows the connected address is really yours.' },
    { title: 'Upload file', copy: 'Drop in any document, image, video, or archive you want to lock into your vault.' },
    { title: 'Store on Walrus', copy: 'Your file is sent to decentralized blob storage and returned with a real blob ID.' },
    { title: 'Persist wallet history', copy: 'Every upload is saved to your private timeline, scoped only to your wallet.' },
  ];
  return <section className="marketing-section how-section" id="how-it-works"><div className="section-title stacked"><p className="eyebrow"><ShieldCheck size={14} /> How it works</p><h2>Identity by wallet. Storage by Walrus.</h2></div><div className="steps">{steps.map((step, index) => <div className="step" key={step.title}><span>{index + 1}</span><strong>{step.title}</strong><p>{step.copy}</p></div>)}</div></section>;
}

function TrustSection() {
  return <section className="trust-section"><div className="section-title stacked"><p className="eyebrow"><Layers size={14} /> Infrastructure</p><h2>Built on Trusted Testnet Infrastructure</h2></div><div className="trust-grid"><article className="trust-card"><div className="trust-card-topline"><Fingerprint size={20} /><span>Tatum Role</span></div><h3>Testnet blockchain access</h3><p>Tatum API keys and optional Sui RPC configuration are loaded from environment variables, never hardcoded.</p></article><article className="trust-card"><div className="trust-card-topline"><Database size={20} /><span>Walrus Role</span></div><h3>Decentralized blob storage</h3><p>The backend uses the official Walrus HTTP publisher pattern and stores the returned real blob IDs.</p></article></div></section>;
}

function Footer() {
  return <footer className="footer"><strong>Agile Vault</strong><span>Testnet wallet-powered storage using Tatum infrastructure and Walrus storage</span></footer>;
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
        <WalletProvider autoConnect={false} storage={null}>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
