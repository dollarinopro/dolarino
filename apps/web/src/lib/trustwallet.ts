export interface Eip1193Provider {
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isMetaMask?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

export interface SolanaInjectedProvider {
  isTrust?: boolean;
  isPhantom?: boolean;
  publicKey?: { toString: () => string; toBase58?: () => string };
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString: () => string } }>;
  signMessage?: (msg: Uint8Array, encoding?: string) => Promise<{ signature?: Uint8Array }>;
}

export interface TronInjectedProvider {
  defaultAddress?: { base58?: string; hex?: string };
  ready?: boolean;
  request?: (args: { method: string }) => Promise<{ code?: number }>;
}

export interface TonInjectedProvider {
  account?: { address?: string };
  connect?: () => Promise<{ account?: { address?: string }; address?: string } | void>;
  send?: (method: string, params?: unknown[]) => Promise<unknown>;
}

export interface EvmNetworkSpec {
  key: 'bsc' | 'ethereum' | 'base' | 'arbitrum' | 'polygon' | 'avalanche' | 'optimism';
  chainIdHex: string;
  chainIdDec: number;
  chainName: string;
  shortName: string;
  symbol: string;
  decimals: number;
  rpcUrl: string;
  explorerUrl: string;
  trustCoinId: number;
}

export const EVM_NETWORKS: EvmNetworkSpec[] = [
  {
    key: 'bsc',
    chainIdHex: '0x38',
    chainIdDec: 56,
    chainName: 'BNB Smart Chain',
    shortName: 'BSC',
    symbol: 'BNB',
    decimals: 18,
    rpcUrl: 'https://bsc-dataseed.binance.org/',
    explorerUrl: 'https://bscscan.com',
    trustCoinId: 20000714,
  },
  {
    key: 'ethereum',
    chainIdHex: '0x1',
    chainIdDec: 1,
    chainName: 'Ethereum Mainnet',
    shortName: 'ETH',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    trustCoinId: 60,
  },
  {
    key: 'base',
    chainIdHex: '0x2105',
    chainIdDec: 8453,
    chainName: 'Base Mainnet',
    shortName: 'BASE',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    trustCoinId: 8453,
  },
  {
    key: 'arbitrum',
    chainIdHex: '0xa4b1',
    chainIdDec: 42161,
    chainName: 'Arbitrum One',
    shortName: 'ARB',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    trustCoinId: 42161,
  },
  {
    key: 'polygon',
    chainIdHex: '0x89',
    chainIdDec: 137,
    chainName: 'Polygon POS',
    shortName: 'POL',
    symbol: 'POL',
    decimals: 18,
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    trustCoinId: 966,
  },
  {
    key: 'avalanche',
    chainIdHex: '0xa86a',
    chainIdDec: 43114,
    chainName: 'Avalanche C-Chain',
    shortName: 'AVAX',
    symbol: 'AVAX',
    decimals: 18,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    explorerUrl: 'https://snowtrace.io',
    trustCoinId: 9005,
  },
  {
    key: 'optimism',
    chainIdHex: '0xa',
    chainIdDec: 10,
    chainName: 'OP Mainnet',
    shortName: 'OP',
    symbol: 'ETH',
    decimals: 18,
    rpcUrl: 'https://mainnet.optimism.io',
    explorerUrl: 'https://optimistic.etherscan.io',
    trustCoinId: 10000010,
  },
];

const BSC_CHAIN_ID_HEX = '0x38'; // 56
const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';

type InjectedWindow = {
  trustwallet?: {
    ethereum?: Eip1193Provider;
    solana?: SolanaInjectedProvider;
    tron?: TronInjectedProvider;
    ton?: TonInjectedProvider;
  } | Eip1193Provider;
  ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  solana?: SolanaInjectedProvider;
  phantom?: { solana?: SolanaInjectedProvider };
  solflare?: SolanaInjectedProvider;
  tronWeb?: TronInjectedProvider;
  tronLink?: { request?: (args: { method: string }) => Promise<{ code?: number }>; tronWeb?: TronInjectedProvider };
  ton?: TonInjectedProvider;
  tonkeeper?: { ton?: TonInjectedProvider } & TonInjectedProvider;
};

export function getInjectedTrustProvider(): Eip1193Provider | null {
  const win = window as unknown as InjectedWindow;
  if (win.trustwallet) {
    if ('ethereum' in win.trustwallet && win.trustwallet.ethereum) return win.trustwallet.ethereum;
    if ('request' in win.trustwallet) return win.trustwallet as Eip1193Provider;
  }
  if (win.ethereum?.providers?.length) {
    const found = win.ethereum.providers.find((p) => p.isTrust || p.isTrustWallet);
    if (found) return found;
  }
  if (win.ethereum) return win.ethereum;
  return null;
}

export function getInjectedSolanaProvider(): SolanaInjectedProvider | null {
  const win = window as unknown as InjectedWindow;
  if (win.trustwallet && 'solana' in win.trustwallet && win.trustwallet.solana) return win.trustwallet.solana;
  if (win.phantom?.solana) return win.phantom.solana;
  if (win.solana) return win.solana;
  if (win.solflare) return win.solflare;
  return null;
}

export function getInjectedTronProvider(): { tronWeb?: TronInjectedProvider; link?: InjectedWindow['tronLink'] } {
  const win = window as unknown as InjectedWindow;
  const twTron = win.trustwallet && 'tron' in win.trustwallet ? win.trustwallet.tron : undefined;
  return {
    tronWeb: twTron || win.tronLink?.tronWeb || win.tronWeb,
    link: win.tronLink,
  };
}

export function getInjectedTonProvider(): TonInjectedProvider | null {
  const win = window as unknown as InjectedWindow;
  if (win.trustwallet && 'ton' in win.trustwallet && win.trustwallet.ton) return win.trustwallet.ton;
  if (win.tonkeeper?.ton) return win.tonkeeper.ton;
  if (win.tonkeeper?.connect) return win.tonkeeper;
  if (win.ton) return win.ton;
  return null;
}

export function isTrustWalletEnvironment(): boolean {
  const p = getInjectedTrustProvider();
  return Boolean(
    p?.isTrust ||
      p?.isTrustWallet ||
      (typeof navigator !== 'undefined' && /Trust/i.test(navigator.userAgent))
  );
}

export function buildTrustWalletDappOpenUrl(targetUrl: string, coinId = 20000714): string {
  return `https://link.trustwallet.com/open_url?coin_id=${coinId}&url=${encodeURIComponent(targetUrl)}`;
}

export async function switchEvmNetwork(networkKey: EvmNetworkSpec['key']): Promise<EvmNetworkSpec> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const spec = EVM_NETWORKS.find((n) => n.key === networkKey) || EVM_NETWORKS[0]!;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: spec.chainIdHex }],
    });
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: spec.chainIdHex,
          chainName: spec.chainName,
          nativeCurrency: { name: spec.symbol, symbol: spec.symbol, decimals: spec.decimals },
          rpcUrls: [spec.rpcUrl],
          blockExplorerUrls: [spec.explorerUrl],
        },
      ],
    });
  }
  return spec;
}

export async function connectTrustWalletEvm(): Promise<{ address: string; isTrust: boolean; chainId: string | null }> {
  const provider = getInjectedTrustProvider();
  if (!provider) {
    throw new Error('NO_INJECTED_WALLET');
  }
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error('NO_ACCOUNT_SELECTED');
  let chainId: string | null = null;
  try {
    chainId = (await provider.request({ method: 'eth_chainId' })) as string;
  } catch {
    chainId = null;
  }
  return {
    address,
    isTrust: Boolean(provider.isTrust || provider.isTrustWallet),
    chainId,
  };
}

export interface MultiChainConnectResult {
  evmAddress: string | null;
  solanaAddress: string | null;
  tronAddress: string | null;
  tonAddress: string | null;
  isTrust: boolean;
  activeEvmChainId: string | null;
  connectedFamilies: string[];
}

export async function connectAllWalletChains(): Promise<MultiChainConnectResult> {
  let evmAddress: string | null = null;
  let solanaAddress: string | null = null;
  let tronAddress: string | null = null;
  let tonAddress: string | null = null;
  let isTrust = isTrustWalletEnvironment();
  let activeEvmChainId: string | null = null;
  const connectedFamilies: string[] = [];

  // 1. Connect EVM (covers Ethereum, BSC, Base, Arbitrum, Polygon, Avalanche, Optimism)
  try {
    const evm = await connectTrustWalletEvm();
    evmAddress = evm.address;
    isTrust = isTrust || evm.isTrust;
    activeEvmChainId = evm.chainId;
    connectedFamilies.push('EVM (ETH · BSC · Base · Arb · Pol · Avax · OP)');
  } catch {
    // EVM wallet optional if user connects Solana/TRON/TON
  }

  // 2. Connect Solana (Trust Wallet Solana / Phantom / Solflare)
  const solProv = getInjectedSolanaProvider();
  if (solProv) {
    try {
      const resp = await solProv.connect().catch(() => null);
      const pk = resp?.publicKey?.toString() || solProv.publicKey?.toString() || null;
      if (pk && !pk.startsWith('0x')) {
        solanaAddress = pk;
        connectedFamilies.push('Solana (SPL)');
      }
    } catch {
      // user rejected or provider locked
    }
  }

  // 3. Connect TRON (Trust Wallet TRON / TronLink)
  const { tronWeb, link } = getInjectedTronProvider();
  try {
    if (link?.request) {
      await link.request({ method: 'tron_requestAccounts' }).catch(() => null);
    }
    const addr = tronWeb?.defaultAddress?.base58 || link?.tronWeb?.defaultAddress?.base58 || null;
    if (addr && addr.startsWith('T')) {
      tronAddress = addr;
      connectedFamilies.push('TRON (TRC20)');
    }
  } catch {
    // optional
  }

  // 4. Connect TON (Trust Wallet TON / Tonkeeper)
  const tonProv = getInjectedTonProvider();
  if (tonProv) {
    try {
      const res = (await tonProv.connect?.().catch(() => null)) as { account?: { address?: string }; address?: string } | undefined;
      const addr = res?.account?.address || res?.address || tonProv.account?.address || null;
      if (addr) {
        tonAddress = addr;
        connectedFamilies.push('TON (Jetton)');
      }
    } catch {
      // optional
    }
  }

  if (!evmAddress && !solanaAddress && !tronAddress && !tonAddress) {
    throw new Error('NO_INJECTED_WALLET');
  }

  return {
    evmAddress,
    solanaAddress,
    tronAddress,
    tonAddress,
    isTrust,
    activeEvmChainId,
    connectedFamilies,
  };
}

export async function signTrustWalletNonce(address: string, message: string): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');
  const signature = (await provider.request({
    method: 'personal_sign',
    params: [message, address],
  })) as string;
  return signature;
}

/**
 * Send BEP20 USDT payment via Trust Wallet / EIP-1193 provider directly on BNB Smart Chain (chain 56).
 */
export async function sendBep20UsdtViaTrustWallet(params: {
  toAddress: string;
  amountUsdt: number;
}): Promise<string> {
  const provider = getInjectedTrustProvider();
  if (!provider) throw new Error('NO_INJECTED_WALLET');

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const from = accounts?.[0];
  if (!from) throw new Error('NO_ACCOUNT_SELECTED');

  // Switch to BNB Smart Chain if needed
  await switchEvmNetwork('bsc');

  // BEP20 USDT has 18 decimals on BSC
  const weiAmount = BigInt(Math.round(params.amountUsdt * 1_000_000)) * 10n ** 12n;
  const toClean = params.toAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amtHex = weiAmount.toString(16).padStart(64, '0');
  // ERC20 transfer(address,uint256) selector = 0xa9059cbb
  const data = `0xa9059cbb${toClean}${amtHex}`;

  const txHash = (await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from,
        to: BSC_USDT_CONTRACT,
        data,
        value: '0x0',
      },
    ],
  })) as string;

  return txHash;
}
