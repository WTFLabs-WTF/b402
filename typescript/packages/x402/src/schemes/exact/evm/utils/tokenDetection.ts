import type { Address, PublicClient } from "viem";

/**
 * Token 信息
 */
export interface TokenInfo {
  name: string;
  version: string;
}

/**
 * 缓存存储
 */
const paymentMethodsCache = new Map<string, TokenPaymentCapabilities>();
const recommendedMethodCache = new Map<string, "eip3009" | "permit2" | "permit" | null>();

const PRESET_TOKEN_CAPABILITIES: Record<
  string,
  {
    supportedMethods: PaymentMethod[];
    supportedNetworks: number[];
    description?: string; // 代币描述（可选）
  }
> = {
  // World Liberty Financial USD - 只支持 permit
  "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d": {
    supportedMethods: ["permit"],
    supportedNetworks: [56],
    description: "World Liberty Financial USD (WLFI)",
  },
  // 可以继续添加更多预设代币
  // 示例：
  // "0x其他代币地址": {
  //   supportedMethods: ["eip3009", "permit"],
  //   description: "代币名称",
  // },
};

/**
 * 支持的支付方式
 */
export type PaymentMethod = "eip3009" | "permit" | "permit2" | "permit2-witness";

/**
 * 检测结果
 */
export interface TokenPaymentCapabilities {
  address: string;
  supportedMethods: PaymentMethod[];
  details: {
    hasEIP3009: boolean;
    hasPermit: boolean;
    hasPermit2Approval: boolean;
  };
}

/**
 * EIP-3009 method signatures
 * - transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
 *
 * Supports multiple method signature variants to accommodate different implementations:
 * - 0xe3ee160e: Standard EIP-3009 implementation
 * - 0xcf092995: Alternative implementation for some tokens
 */
const EIP3009_SIGNATURES = ["0xe3ee160e", "0xcf092995"] as const;

/**
 * EIP-2612 Permit method signatures
 * - permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
 */
const EIP2612_PERMIT = "0xd505accf" as const;

/**
 * Uniswap Permit2 contract address (same for all chains)
 */
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * EIP-1967 standard implementation slot
 * keccak256("eip1967.proxy.implementation") - 1
 */
const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/**
 * EIP-1822 UUPS implementation slot
 * keccak256("PROXIABLE")
 */
const EIP1822_IMPLEMENTATION_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as const;

/**
 * OpenZeppelin implementation() function signature
 */
// const IMPLEMENTATION_FUNCTION = "0x5c60da1b" as const;

/**
 * Detect if the contract is a proxy contract and get the implementation contract address
 *
 * @param client - viem PublicClient
 * @param proxyAddress - contract address
 * @returns implementation contract address or null
 */
async function getImplementationAddress(
  client: PublicClient,
  proxyAddress: Address,
): Promise<Address | null> {
  try {
    // Method 1: Try reading the EIP-1967 storage slot
    try {
      const implSlotData = await client.getStorageAt({
        address: proxyAddress,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
      if (
        implSlotData &&
        implSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        // Extract the address from the storage slot (last 20 bytes)
        const implAddress = `0x${implSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          console.log(`  📦 Detected EIP-1967 proxy, implementation: ${implAddress}`);
          return implAddress;
        }
      }
    } catch {
      // Continue trying other methods
    }

    // Method 2: Try reading the EIP-1822 storage slot
    try {
      const uupsSlotData = await client.getStorageAt({
        address: proxyAddress,
        slot: EIP1822_IMPLEMENTATION_SLOT,
      });
      if (
        uupsSlotData &&
        uupsSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        const implAddress = `0x${uupsSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          console.log(`  📦 Detected EIP-1822 UUPS proxy, implementation: ${implAddress}`);
          return implAddress;
        }
      }
    } catch {
      // Continue trying other methods
    }

    // Method 3: Try calling the implementation() function
    try {
      const implABI = [
        {
          inputs: [],
          name: "implementation",
          outputs: [{ name: "", type: "address" }],
          stateMutability: "view",
          type: "function",
        },
      ] as const;

      const implAddress = (await client.readContract({
        address: proxyAddress,
        abi: implABI,
        functionName: "implementation",
      })) as Address;

      if (implAddress && implAddress !== "0x0000000000000000000000000000000000000000") {
        console.log(`  📦 Detected proxy via implementation(), implementation: ${implAddress}`);
        return implAddress;
      }
    } catch {
      // Not a proxy contract or does not support implementation() function
    }

    return null;
  } catch (error) {
    console.error("Error detecting proxy implementation:", error);
    return null;
  }
}

/**
 * Check if the contract supports a particular method (by checking the bytecode)
 * Supports proxy contract detection
 *
 * @param client - viem PublicClient
 * @param tokenAddress - contract address
 * @param methodSelector - method selector
 * @returns true if the contract supports the method, false otherwise
 */
async function hasMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelector: string,
): Promise<boolean> {
  try {
    // Try getting the contract code
    const code = await client.getCode({ address: tokenAddress });
    if (!code) return false;

    // Check if the bytecode contains the method selector
    const hasMethodInProxy = code.toLowerCase().includes(methodSelector.slice(2).toLowerCase());

    // If the proxy contract contains the method, return true
    if (hasMethodInProxy) {
      return true;
    }

    // If the proxy contract does not contain the method, try detecting if it is a proxy contract
    const implAddress = await getImplementationAddress(client, tokenAddress);
    if (implAddress) {
      // Get the implementation contract bytecode
      const implCode = await client.getCode({ address: implAddress });
      if (implCode) {
        const hasMethodInImpl = implCode
          .toLowerCase()
          .includes(methodSelector.slice(2).toLowerCase());
        if (hasMethodInImpl) {
          console.log(`  ✅ Method ${methodSelector} found in implementation contract`);
        }
        return hasMethodInImpl;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking method ${methodSelector}:`, error);
    return false;
  }
}

/**
 * Check if the contract supports any of the method signatures
 * Supports proxy contract detection
 *
 * @param client - viem PublicClient
 * @param tokenAddress - contract address
 * @param methodSelectors - method selectors
 * @returns true if the contract supports any of the method signatures, false otherwise
 * Supports proxy contract detection
 */
async function hasAnyMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelectors: readonly string[],
): Promise<boolean> {
  try {
    // Try getting the contract code
    const code = await client.getCode({ address: tokenAddress });
    if (!code) return false;

    const codeLower = code.toLowerCase();

    // Check if the proxy contract contains any of the method selectors
    const hasMethodInProxy = methodSelectors.some(selector =>
      codeLower.includes(selector.slice(2).toLowerCase()),
    );

    // If the proxy contract contains the method, return true
    if (hasMethodInProxy) {
      return true;
    }

    // If the proxy contract does not contain the method, try detecting if it is a proxy contract
    const implAddress = await getImplementationAddress(client, tokenAddress);
    if (implAddress) {
      // Get the implementation contract bytecode
      const implCode = await client.getCode({ address: implAddress });
      if (implCode) {
        const implCodeLower = implCode.toLowerCase();
        const hasMethodInImpl = methodSelectors.some(selector =>
          implCodeLower.includes(selector.slice(2).toLowerCase()),
        );
        if (hasMethodInImpl) {
          console.log(`  ✅ Method(s) found in implementation contract`);
        }
        return hasMethodInImpl;
      }
    }

    return false;
  } catch (error) {
    console.error(`Error checking methods ${methodSelectors.join(", ")}:`, error);
    return false;
  }
}

/**
 * Check if the Permit2 contract is deployed on the chain
 *
 * @param client - viem PublicClient
 * @returns true if the Permit2 contract is deployed on the chain, false otherwise
 */
async function checkPermit2Support(client: PublicClient): Promise<boolean> {
  try {
    // Check if the Permit2 contract is deployed on the chain
    const permit2Code = await client.getCode({ address: PERMIT2_ADDRESS });
    if (!permit2Code) return false;

    // If the Permit2 contract exists,理论上任何 ERC-20 都可以使用它
    return true;
  } catch (error) {
    console.error("Error checking Permit2 support:", error);
    return false;
  }
}

/**
 * Detect the payment methods supported by the token
 *
 * @param tokenAddress - token address
 * @param client - viem PublicClient
 * @returns detection result
 */
export async function detectTokenPaymentMethods(
  tokenAddress: string,
  client: PublicClient,
): Promise<TokenPaymentCapabilities> {
  const address = tokenAddress.toLowerCase() as Address;
  const chainId = await client.getChainId();
  const cacheKey = `${chainId}:${address}`;

  // 检查缓存
  const cached = paymentMethodsCache.get(cacheKey);
  if (cached) {
    console.log(`💾 Using cached payment methods for token ${address}`);
    return cached;
  }

  const presetCapabilities = PRESET_TOKEN_CAPABILITIES[address];
  if (presetCapabilities) {
    if (!chainId || !presetCapabilities.supportedNetworks.includes(chainId)) {
      return {
        address,
        supportedMethods: [],
        details: {
          hasEIP3009: false,
          hasPermit: false,
          hasPermit2Approval: false,
        },
      };
    }

    // 从预设的方法列表构建 details
    const hasEIP3009 = presetCapabilities.supportedMethods.includes("eip3009");
    const hasPermit = presetCapabilities.supportedMethods.includes("permit");
    const hasPermit2Approval =
      presetCapabilities.supportedMethods.includes("permit2") ||
      presetCapabilities.supportedMethods.includes("permit2-witness");

    if (hasEIP3009) {
      console.log("  ✅ EIP-3009 (transferWithAuthorization) - from preset");
    }
    if (hasPermit) {
      console.log("  ✅ EIP-2612 (permit) - from preset");
    }
    if (hasPermit2Approval) {
      console.log("  ✅ Permit2 support - from preset");
    }

    return {
      address,
      supportedMethods: presetCapabilities.supportedMethods,
      details: {
        hasEIP3009,
        hasPermit,
        hasPermit2Approval,
      },
    };
  }

  console.log(`🔍 Detecting payment methods for token ${address}...`);

  // Detect all methods in parallel
  const [hasEIP3009, hasPermit, hasPermit2Approval] = await Promise.all([
    hasAnyMethod(client, address, EIP3009_SIGNATURES),
    hasMethod(client, address, EIP2612_PERMIT),
    checkPermit2Support(client),
  ]);

  // Build the list of supported methods
  const supportedMethods: PaymentMethod[] = [];

  if (hasEIP3009) {
    supportedMethods.push("eip3009");
    console.log("  ✅ EIP-3009 (transferWithAuthorization) detected");
  }

  if (hasPermit) {
    supportedMethods.push("permit");
    console.log("  ✅ EIP-2612 (permit) detected");
  }

  if (hasPermit2Approval) {
    supportedMethods.push("permit2");
    supportedMethods.push("permit2-witness");
    console.log("  ✅ Permit2 support available (universal)");
  }

  if (supportedMethods.length === 0) {
    console.log("  ⚠️  No advanced payment methods detected (standard ERC-20 only)");
  }

  const result = {
    address,
    supportedMethods,
    details: {
      hasEIP3009,
      hasPermit,
      hasPermit2Approval,
    },
  };

  // 存入缓存
  paymentMethodsCache.set(cacheKey, result);

  return result;
}

/**
 * Get the recommended payment method (only return types supported by the schema)
 * Sort by priority: eip3009 > permit > permit2
 * Note: permit2-witness is mapped to permit2 because they are the same payment type in the schema
 *
 * @param tokenAddress - token address
 * @param client - viem PublicClient
 * @returns recommended payment method
 */
export async function getRecommendedPaymentMethod(
  tokenAddress: string,
  client: PublicClient,
): Promise<"eip3009" | "permit2" | "permit" | null> {
  const address = tokenAddress.toLowerCase() as Address;
  const chainId = await client.getChainId();
  const cacheKey = `${chainId}:${address}`;

  // 检查缓存
  const cached = recommendedMethodCache.get(cacheKey);
  if (cached !== undefined) {
    console.log(`💾 Using cached recommended method for token ${address}`);
    return cached;
  }

  const capabilities = await detectTokenPaymentMethods(tokenAddress, client);
  const { supportedMethods } = capabilities;

  let result: "eip3009" | "permit2" | "permit" | null = null;

  if (supportedMethods.includes("eip3009")) {
    result = "eip3009";
  } else if (supportedMethods.includes("permit")) {
    result = "permit";
  } else if (supportedMethods.includes("permit2") || supportedMethods.includes("permit2-witness")) {
    // permit2 and permit2-witness are mapped to permit2 (schema only supports permit2)
    result = "permit2";
  }

  // 存入缓存
  recommendedMethodCache.set(cacheKey, result);

  return result;
}

/**
 * Get the name and version information of the token (for EIP-712 signing)
 * Supports proxy contracts (will automatically read from the proxy contract, because the proxy contract will delegatecall to the implementation contract)
 *
 * @param tokenAddress - token address
 * @param client - viem PublicClient
 * @returns name and version information of the token
 */
export async function getTokenInfo(tokenAddress: string, client: PublicClient): Promise<TokenInfo> {
  const address = tokenAddress.toLowerCase() as Address;

  // ERC-20 standard ABI
  const erc20ABI = [
    {
      inputs: [],
      name: "name",
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  // EIP-5267 eip712Domain ABI (OpenZeppelin v5+)
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

  // version() ABI (OpenZeppelin v4)
  const versionABI = [
    {
      inputs: [],
      name: "version",
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  try {
    // Detect if the contract is a proxy contract
    const implAddress = await getImplementationAddress(client, address);
    if (implAddress) {
      console.log(
        `  📦 Reading token info from proxy, actual calls will be delegated to implementation`,
      );
    }

    // Get the token name (for proxy contracts, delegatecall will automatically forward to the implementation contract)
    const name = await client.readContract({
      address,
      abi: erc20ABI,
      functionName: "name",
    });

    // Try getting the version, prioritize using EIP-5267
    let version = "1"; // 默认版本
    try {
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
        version = await client.readContract({
          address,
          abi: versionABI,
          functionName: "version",
        });
      } catch {
        // If both methods are not available, use default value "1"
        console.log(`  ℹ️  Using default version "1" for token ${address}`);
      }
    }

    return {
      name: name as string,
      version: version as string,
    };
  } catch (error) {
    console.error(`Error getting token info for ${address}:`, error);
    throw new Error(`Failed to get token info: ${error}`);
  }
}
