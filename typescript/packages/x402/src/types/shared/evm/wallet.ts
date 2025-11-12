import { createPublicClient, createWalletClient, http, publicActions, defineChain } from "viem";
import type {
  Chain,
  Transport,
  Client,
  Account,
  RpcSchema,
  PublicActions,
  WalletActions,
  PublicClient,
  LocalAccount,
} from "viem";
import {
  baseSepolia,
  avalancheFuji,
  base,
  sei,
  seiTestnet,
  polygon,
  polygonAmoy,
  peaq,
  avalanche,
  iotexTestnet,
  iotex,
  bsc,
  bscTestnet,
} from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Hex } from "viem";

/**
 * Chain configuration options for creating a signer
 */
export type EvmChainConfig =
  | string // Network name like 'bsc', 'polygon'
  | Chain // Viem chain object
  | {
    // Custom chain configuration
    chainId: number;
    name: string;
    rpcUrl: string;
    nativeCurrency?: {
      name: string;
      symbol: string;
      decimals: number;
    };
    blockExplorer?: {
      name: string;
      url: string;
    };
  };

// Create a public client for reading data
export type SignerWallet<
  chain extends Chain = Chain,
  transport extends Transport = Transport,
  account extends Account = Account,
> = Client<
  transport,
  chain,
  account,
  RpcSchema,
  PublicActions<transport, chain, account> & WalletActions<chain, account>
>;

export type ConnectedClient<
  transport extends Transport = Transport,
  chain extends Chain | undefined = Chain,
  account extends Account | undefined = undefined,
> = PublicClient<transport, chain, account>;

export type EvmSigner = SignerWallet<Chain, Transport, Account> | LocalAccount;

/**
 * Creates a public client configured for the specified network or chain config
 *
 * @param networkOrConfig - The network name, Chain object, or custom chain configuration
 * @param customRpcUrl - Optional custom RPC URL (only used when networkOrConfig is a string)
 * @returns A public client instance connected to the specified chain
 *
 * @example
 * ```typescript
 * // Legacy usage with network name
 * const client = createConnectedClient('bsc');
 *
 * // With custom RPC
 * const client = createConnectedClient('bsc', 'https://my-rpc.com');
 *
 * // Using withChain
 * const client = createConnectedClient(withChain('bsc'));
 *
 * // Using viem Chain
 * import { bsc } from 'viem/chains';
 * const client = createConnectedClient(bsc);
 *
 * // Using custom config
 * const client = createConnectedClient({
 *   chainId: 56,
 *   name: 'BSC Mainnet',
 *   rpcUrl: 'https://my-rpc.com',
 * });
 * ```
 */
export function createConnectedClient(
  networkOrConfig: string | EvmChainConfig,
  customRpcUrl?: string,
): ConnectedClient<Transport, Chain, undefined> {
  const chain =
    typeof networkOrConfig === "string"
      ? withChain(networkOrConfig, customRpcUrl)
      : withChain(networkOrConfig);

  return createPublicClient({
    chain,
    transport: http(customRpcUrl || chain.rpcUrls.default.http[0]),
  }).extend(publicActions);
}

/**
 * Creates a public client configured for the Base Sepolia testnet
 *
 * @deprecated Use `createConnectedClient("base-sepolia")` instead
 * @returns A public client instance connected to Base Sepolia
 */
export function createClientSepolia(): ConnectedClient<Transport, typeof baseSepolia, undefined> {
  return createConnectedClient("base-sepolia") as ConnectedClient<
    Transport,
    typeof baseSepolia,
    undefined
  >;
}

/**
 * Creates a public client configured for the Avalanche Fuji testnet
 *
 * @deprecated Use `createConnectedClient("avalanche-fuji")` instead
 * @returns A public client instance connected to Avalanche Fuji
 */
export function createClientAvalancheFuji(): ConnectedClient<
  Transport,
  typeof avalancheFuji,
  undefined
> {
  return createConnectedClient("avalanche-fuji") as ConnectedClient<
    Transport,
    typeof avalancheFuji,
    undefined
  >;
}

/**
 * Creates a wallet client configured for the specified chain with a private key
 *
 * @param networkOrConfig - The network name, Chain object, or custom chain configuration
 * @param privateKey - The private key to use for signing transactions
 * @param customRpcUrl - Optional custom RPC URL (only used when networkOrConfig is a string)
 * @returns A wallet client instance connected to the specified chain with the provided private key
 *
 * @example
 * ```typescript
 * // Legacy usage with network name
 * const signer = createSigner('bsc', '0x...');
 *
 * // With custom RPC
 * const signer = createSigner('bsc', '0x...', 'https://my-rpc.com');
 *
 * // Using withChain
 * const signer = createSigner(withChain('bsc'), '0x...');
 *
 * // Using viem Chain
 * import { bsc } from 'viem/chains';
 * const signer = createSigner(bsc, '0x...');
 *
 * // Using custom config
 * const signer = createSigner({
 *   chainId: 56,
 *   name: 'BSC Mainnet',
 *   rpcUrl: 'https://my-rpc.com',
 * }, '0x...');
 * ```
 */
export function createSigner(
  networkOrConfig: string | EvmChainConfig,
  privateKey: Hex,
  customRpcUrl?: string,
): SignerWallet<Chain> {
  const chain =
    typeof networkOrConfig === "string"
      ? withChain(networkOrConfig, customRpcUrl)
      : withChain(networkOrConfig);

  return createWalletClient({
    chain,
    transport: http(customRpcUrl || chain.rpcUrls.default.http[0]),
    account: privateKeyToAccount(privateKey),
  }).extend(publicActions);
}

/**
 * Creates a wallet client configured for the Base Sepolia testnet with a private key
 *
 * @deprecated Use `createSigner("base-sepolia", privateKey)` instead
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Base Sepolia with the provided private key
 */
export function createSignerSepolia(privateKey: Hex): SignerWallet<typeof baseSepolia> {
  return createSigner("base-sepolia", privateKey) as SignerWallet<typeof baseSepolia>;
}

/**
 * Creates a wallet client configured for the Avalanche Fuji testnet with a private key
 *
 * @deprecated Use `createSigner("avalanche-fuji", privateKey)` instead
 * @param privateKey - The private key to use for signing transactions
 * @returns A wallet client instance connected to Avalanche Fuji with the provided private key
 */
export function createSignerAvalancheFuji(privateKey: Hex): SignerWallet<typeof avalancheFuji> {
  return createSigner("avalanche-fuji", privateKey) as SignerWallet<typeof avalancheFuji>;
}

/**
 * Checks if a wallet is a signer wallet
 *
 * @param wallet - The wallet to check
 * @returns True if the wallet is a signer wallet, false otherwise
 */
export function isSignerWallet<
  TChain extends Chain = Chain,
  TTransport extends Transport = Transport,
  TAccount extends Account = Account,
>(
  wallet: SignerWallet<TChain, TTransport, TAccount> | LocalAccount,
): wallet is SignerWallet<TChain, TTransport, TAccount> {
  return (
    typeof wallet === "object" && wallet !== null && "chain" in wallet && "transport" in wallet
  );
}

/**
 * Checks if a wallet is an account
 *
 * @param wallet - The wallet to check
 * @returns True if the wallet is an account, false otherwise
 */
export function isAccount<
  TChain extends Chain = Chain,
  TTransport extends Transport = Transport,
  TAccount extends Account = Account,
>(wallet: SignerWallet<TChain, TTransport, TAccount> | LocalAccount): wallet is LocalAccount {
  const w = wallet as LocalAccount;
  return (
    typeof wallet === "object" &&
    wallet !== null &&
    typeof w.address === "string" &&
    typeof w.type === "string" &&
    // Check for essential signing capabilities
    typeof w.sign === "function" &&
    typeof w.signMessage === "function" &&
    typeof w.signTypedData === "function" &&
    // Check for transaction signing (required by LocalAccount)
    typeof w.signTransaction === "function"
  );
}

/**
 * Maps network strings to Chain objects
 *
 * @param network - The network string to convert to a Chain object
 * @returns The corresponding Chain object
 */
export function getChainFromNetwork(network: string | undefined): Chain {
  if (!network) {
    throw new Error("NETWORK environment variable is not set");
  }

  switch (network) {
    case "base":
      return base;
    case "base-sepolia":
      return baseSepolia;
    case "avalanche":
      return avalanche;
    case "avalanche-fuji":
      return avalancheFuji;
    case "sei":
      return sei;
    case "sei-testnet":
      return seiTestnet;
    case "polygon":
      return polygon;
    case "polygon-amoy":
      return polygonAmoy;
    case "peaq":
      return peaq;
    case "iotex":
      return iotex;
    case "iotex-testnet":
      return iotexTestnet;
    case "bsc":
      return bsc;
    case "bsc-testnet":
      return bscTestnet;
    default:
      throw new Error(`Unsupported network: ${network}`);
  }
}

/**
 * Creates a Chain configuration from various input formats
 *
 * @param config - The chain configuration (string, Chain object, or custom config)
 * @param customRpcUrl - Optional custom RPC URL to override the default
 * @returns A viem Chain object
 *
 * @example
 * ```typescript
 * // Using string
 * const chain = withChain('bsc');
 *
 * // Using viem chain object
 * import { bsc } from 'viem/chains';
 * const chain = withChain(bsc);
 *
 * // Using custom config
 * const chain = withChain({
 *   chainId: 56,
 *   name: 'BSC Mainnet',
 *   rpcUrl: 'https://my-custom-rpc.com',
 * });
 *
 * // Override RPC for existing chain
 * const chain = withChain('bsc', 'https://my-custom-rpc.com');
 * ```
 */
export function withChain(config: EvmChainConfig, customRpcUrl?: string): Chain {
  // If config is a viem Chain object
  if (typeof config === "object" && "id" in config && "name" in config) {
    if (!customRpcUrl) {
      return config as Chain;
    }
    // Override RPC URL
    return {
      ...config,
      rpcUrls: {
        default: { http: [customRpcUrl] },
        public: { http: [customRpcUrl] },
      },
    } as Chain;
  }

  // If config is a string (network name)
  if (typeof config === "string") {
    const chain = getChainFromNetwork(config);
    if (!customRpcUrl) {
      return chain;
    }
    // Override RPC URL
    return {
      ...chain,
      rpcUrls: {
        default: { http: [customRpcUrl] },
        public: { http: [customRpcUrl] },
      },
    };
  }

  // If config is a custom config object
  return defineChain({
    id: config.chainId,
    name: config.name,
    nativeCurrency: config.nativeCurrency || {
      name: "Ether",
      symbol: "ETH",
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
      public: { http: [config.rpcUrl] },
    },
    blockExplorers: config.blockExplorer
      ? {
        default: {
          name: config.blockExplorer.name,
          url: config.blockExplorer.url,
        },
      }
      : undefined,
  });
}
