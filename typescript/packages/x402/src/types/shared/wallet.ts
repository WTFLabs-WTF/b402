import * as evm from "./evm/wallet";
import * as svm from "../../shared/svm/wallet";
import { SupportedEVMNetworks, SupportedSVMNetworks } from "./network";
import { Hex } from "viem";

export type ConnectedClient = evm.ConnectedClient | svm.SvmConnectedClient;
export type Signer = evm.EvmSigner | svm.SvmSigner;
export type MultiNetworkSigner = { evm: evm.EvmSigner; svm: svm.SvmSigner };

/**
 * Creates a public client configured for the specified network or chain config.
 *
 * @param networkOrConfig - The network name (for EVM/SVM), or EvmChainConfig for flexible EVM configuration
 * @param customRpcUrl - Optional custom RPC URL (only for EVM when networkOrConfig is a string)
 * @returns A public client instance connected to the specified chain.
 *
 * @example
 * ```typescript
 * // Legacy EVM usage
 * const client = createConnectedClient('bsc-mainnet');
 *
 * // EVM with custom RPC
 * const client = createConnectedClient('bsc-mainnet', 'https://my-rpc.com');
 *
 * // EVM with withChain
 * const client = createConnectedClient(withChain('bsc-mainnet'));
 *
 * // EVM with viem Chain
 * import { bsc } from 'viem/chains';
 * const client = createConnectedClient(bsc);
 *
 * // SVM (Solana)
 * const client = createConnectedClient('solana');
 * ```
 */
export function createConnectedClient(
  networkOrConfig: string | evm.EvmChainConfig,
  customRpcUrl?: string,
): ConnectedClient {
  // Handle string network names
  if (typeof networkOrConfig === "string") {
    if (SupportedEVMNetworks.find(n => n === networkOrConfig)) {
      return evm.createConnectedClient(networkOrConfig, customRpcUrl);
    }

    if (SupportedSVMNetworks.find(n => n === networkOrConfig)) {
      return svm.createSvmConnectedClient(networkOrConfig);
    }

    throw new Error(`Unsupported network: ${networkOrConfig}`);
  }

  // Handle EvmChainConfig (Chain object or custom config)
  return evm.createConnectedClient(networkOrConfig, customRpcUrl);
}

/**
 * Creates a wallet client configured for the specified chain with a private key.
 *
 * @param networkOrConfig - The network name (for EVM/SVM), or EvmChainConfig for flexible EVM configuration
 * @param privateKey - The private key to use for signing transactions. This should be a hex string for EVM or a base58 encoded string for SVM.
 * @param customRpcUrl - Optional custom RPC URL (only for EVM when networkOrConfig is a string)
 * @returns A wallet client instance connected to the specified chain with the provided private key.
 *
 * @example
 * ```typescript
 * // Legacy EVM usage
 * const signer = await createSigner('bsc-mainnet', '0x...');
 *
 * // EVM with custom RPC
 * const signer = await createSigner('bsc-mainnet', '0x...', 'https://my-rpc.com');
 *
 * // EVM with withChain
 * const signer = await createSigner(withChain('bsc-mainnet'), '0x...');
 *
 * // EVM with viem Chain
 * import { bsc } from 'viem/chains';
 * const signer = await createSigner(bsc, '0x...');
 *
 * // SVM (Solana)
 * const signer = await createSigner('solana', 'base58PrivateKey');
 * ```
 */
export function createSigner(
  networkOrConfig: string | evm.EvmChainConfig,
  privateKey: Hex | string,
  customRpcUrl?: string,
): Promise<Signer> {
  // Handle string network names
  if (typeof networkOrConfig === "string") {
    // evm
    if (SupportedEVMNetworks.find(n => n === networkOrConfig)) {
      return Promise.resolve(evm.createSigner(networkOrConfig, privateKey as Hex, customRpcUrl));
    }

    // svm
    if (SupportedSVMNetworks.find(n => n === networkOrConfig)) {
      return svm.createSignerFromBase58(privateKey as string);
    }

    throw new Error(`Unsupported network: ${networkOrConfig}`);
  }

  // Handle EvmChainConfig (Chain object or custom config)
  return Promise.resolve(evm.createSigner(networkOrConfig, privateKey as Hex, customRpcUrl));
}

/**
 * Checks if the given wallet is an EVM signer wallet.
 *
 * @param wallet - The object wallet to check.
 * @returns True if the wallet is an EVM signer wallet, false otherwise.
 */
export function isEvmSignerWallet(wallet: Signer): wallet is evm.EvmSigner {
  return evm.isSignerWallet(wallet as evm.EvmSigner) || evm.isAccount(wallet as evm.EvmSigner);
}

/**
 * Checks if the given wallet is an SVM signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is an SVM signer wallet, false otherwise
 */
export function isSvmSignerWallet(wallet: Signer): wallet is svm.SvmSigner {
  return svm.isSignerWallet(wallet as svm.SvmSigner);
}

/**
 * Checks if the given wallet is a multi network signer wallet
 *
 * @param wallet - The object wallet to check
 * @returns True if the wallet is a multi network signer wallet, false otherwise
 */
export function isMultiNetworkSigner(wallet: object): wallet is MultiNetworkSigner {
  return "evm" in wallet && "svm" in wallet;
}
