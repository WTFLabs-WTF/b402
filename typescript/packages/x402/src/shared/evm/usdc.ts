import { Account, Address, Chain, Client, Transport } from "viem";
import { ChainConfig, config } from "../../types/shared/evm/config";
import { usdcABI as abi } from "../../types/shared/evm/erc20PermitABI";
import { ConnectedClient } from "../../types/shared/evm/wallet";

/**
 * Gets the USDC contract address for the current chain from the client
 *
 * @param client - The Viem client instance connected to the blockchain
 * @returns The USDC contract address for the current chain
 */
export function getUsdcAddress<
  transport extends Transport,
  chain extends Chain | undefined = undefined,
  account extends Account | undefined = undefined,
>(client: Client<transport, chain, account>): Address {
  return config[client.chain!.id.toString()].usdcAddress as Address;
}

/**
 * Gets the USDC contract address for a specific chain ID
 *
 * @deprecated Use `getUsdcChainConfigForChain` instead
 * @param chainId - The chain ID to get the USDC contract address for
 * @returns The USDC contract address for the specified chain
 */
export function getUsdcAddressForChain(chainId: number): Address {
  return config[chainId.toString()].usdcAddress as Address;
}

/**
 * Gets the USDC address and eip712 domain name for a specific chain ID
 *
 * @param chainId - The chain ID
 * @returns The USDC contract address and eip712 domain name  for the specified chain
 */
export function getUsdcChainConfigForChain(chainId: number): ChainConfig | undefined {
  return config[chainId.toString()];
}

// Cache for storing the version value per token address
const versionCache: Map<string, string> = new Map();

/**
 * Gets the version of an ERC20 Permit contract, using a cache to avoid repeated calls
 *
 * Priority order:
 * 1. Try eip712Domain() (EIP-5267, OpenZeppelin v5+)
 * 2. Fallback to version() function (OpenZeppelin v4)
 * 3. Default to "1" if neither is available
 *
 * @param client - The Viem client instance connected to the blockchain
 * @param tokenAddress - Optional token address. If not provided, uses USDC address
 * @returns A promise that resolves to the ERC20 contract version string
 */
export async function getVersion<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(client: ConnectedClient<transport, chain, account>, tokenAddress?: Address): Promise<string> {
  const address = tokenAddress ?? getUsdcAddress(client);
  const cacheKey = `${client.chain!.id}-${address.toLowerCase()}`;

  // Return cached version if available
  if (versionCache.has(cacheKey)) {
    return versionCache.get(cacheKey)!;
  }

  // Try to get version from EIP-5267 eip712Domain() first (OpenZeppelin v5+)
  let version = "1";
  try {
    const eip712DomainABI = [
      {
        inputs: [],
        name: "eip712Domain",
        outputs: [
          { name: "fields", type: "bytes1" },
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
          { name: "salt", type: "bytes32" },
          { name: "extensions", type: "uint256[]" },
        ],
        stateMutability: "view",
        type: "function",
      },
    ] as const;

    const result = await client.readContract({
      address,
      abi: eip712DomainABI,
      functionName: "eip712Domain",
    });
    // eip712Domain returns [fields, name, version, chainId, verifyingContract, salt, extensions]
    version = result[2] as string; // version is the 3rd element (index 2)
  } catch {
    // Fallback to version() function (OpenZeppelin v4)
    try {
      const result = await client.readContract({
        address,
        abi,
        functionName: "version",
      });
      version = result as string;
    } catch {
      // If neither method is available, use default "1" (standard for OpenZeppelin ERC20Permit)
      console.warn(
        `Neither eip712Domain() nor version() available for token ${address}, using default: ${version}`,
      );
    }
  }

  versionCache.set(cacheKey, version);
  return version;
}

/**
 * Gets the USDC balance for a specific address
 *
 * @param client - The Viem client instance connected to the blockchain
 * @param address - The address to check the USDC balance for
 * @returns A promise that resolves to the USDC balance as a bigint
 */
export async function getUSDCBalance<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined = undefined,
>(client: ConnectedClient<transport, chain, account>, address: Address): Promise<bigint> {
  const chainId = client.chain!.id;
  const usdc = getUsdcChainConfigForChain(chainId);
  if (!usdc) {
    return 0n;
  }
  const balance = await client.readContract({
    address: usdc.usdcAddress as `0x${string}`,
    abi,
    functionName: "balanceOf",
    args: [address],
  });
  return balance as bigint;
}
