import type { Address, PublicClient } from "viem";

/**
 * Token 信息
 */
export interface TokenInfo {
  name: string;
  version: string;
}

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
 * EIP-3009 方法签名
 * - transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
 * 
 * 支持多个方法签名变体，以兼容不同的实现：
 * - 0xe3ee160e: 标准 EIP-3009 实现
 * - 0xcf092995: 某些代币的替代实现
 */
const EIP3009_SIGNATURES = ["0xe3ee160e", "0xcf092995"] as const;

/**
 * EIP-2612 Permit 方法签名
 * - permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
 */
const EIP2612_PERMIT = "0xd505accf" as const;

/**
 * Uniswap Permit2 合约地址（所有链相同）
 */
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

/**
 * EIP-1967 标准实现槽位
 * keccak256("eip1967.proxy.implementation") - 1
 */
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;

/**
 * EIP-1822 UUPS 实现槽位
 * keccak256("PROXIABLE")
 */
const EIP1822_IMPLEMENTATION_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as const;

/**
 * OpenZeppelin implementation() 函数签名
 */
const IMPLEMENTATION_FUNCTION = "0x5c60da1b" as const;

/**
 * 检测合约是否是代理合约，并获取实现合约地址
 */
async function getImplementationAddress(
  client: PublicClient,
  proxyAddress: Address
): Promise<Address | null> {
  try {
    // 方法1: 尝试读取 EIP-1967 存储槽位
    try {
      const implSlotData = await client.getStorageAt({
        address: proxyAddress,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
      if (implSlotData && implSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        // 从存储槽中提取地址（最后20字节）
        const implAddress = `0x${implSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          console.log(`  📦 Detected EIP-1967 proxy, implementation: ${implAddress}`);
          return implAddress;
        }
      }
    } catch {
      // 继续尝试其他方法
    }

    // 方法2: 尝试读取 EIP-1822 存储槽位
    try {
      const uupsSlotData = await client.getStorageAt({
        address: proxyAddress,
        slot: EIP1822_IMPLEMENTATION_SLOT,
      });
      if (uupsSlotData && uupsSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        const implAddress = `0x${uupsSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          console.log(`  📦 Detected EIP-1822 UUPS proxy, implementation: ${implAddress}`);
          return implAddress;
        }
      }
    } catch {
      // 继续尝试其他方法
    }

    // 方法3: 尝试调用 implementation() 函数
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

      const implAddress = await client.readContract({
        address: proxyAddress,
        abi: implABI,
        functionName: "implementation",
      }) as Address;

      if (implAddress && implAddress !== "0x0000000000000000000000000000000000000000") {
        console.log(`  📦 Detected proxy via implementation(), implementation: ${implAddress}`);
        return implAddress;
      }
    } catch {
      // 不是代理合约或不支持 implementation() 函数
    }

    return null;
  } catch (error) {
    console.error("Error detecting proxy implementation:", error);
    return null;
  }
}

/**
 * 检查合约是否支持某个方法（通过字节码检查）
 * 支持代理合约检测
 */
async function hasMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelector: string
): Promise<boolean> {
  try {
    // 尝试获取合约代码
    const code = await client.getBytecode({ address: tokenAddress });
    if (!code) return false;

    // 检查字节码中是否包含方法选择器
    const hasMethodInProxy = code.toLowerCase().includes(methodSelector.slice(2).toLowerCase());

    // 如果代理合约中找到了方法，直接返回 true
    if (hasMethodInProxy) {
      return true;
    }

    // 如果代理合约中没有找到，尝试检测是否是代理合约
    const implAddress = await getImplementationAddress(client, tokenAddress);
    if (implAddress) {
      // 获取实现合约的字节码
      const implCode = await client.getBytecode({ address: implAddress });
      if (implCode) {
        const hasMethodInImpl = implCode.toLowerCase().includes(methodSelector.slice(2).toLowerCase());
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
 * 检查合约是否支持多个方法签名中的任意一个
 * 支持代理合约检测
 */
async function hasAnyMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelectors: readonly string[]
): Promise<boolean> {
  try {
    // 尝试获取合约代码
    const code = await client.getBytecode({ address: tokenAddress });
    if (!code) return false;

    const codeLower = code.toLowerCase();

    // 检查代理合约中是否包含任何一个方法选择器
    const hasMethodInProxy = methodSelectors.some(selector =>
      codeLower.includes(selector.slice(2).toLowerCase())
    );

    // 如果代理合约中找到了方法，直接返回 true
    if (hasMethodInProxy) {
      return true;
    }

    // 如果代理合约中没有找到，尝试检测是否是代理合约
    const implAddress = await getImplementationAddress(client, tokenAddress);
    if (implAddress) {
      // 获取实现合约的字节码
      const implCode = await client.getBytecode({ address: implAddress });
      if (implCode) {
        const implCodeLower = implCode.toLowerCase();
        const hasMethodInImpl = methodSelectors.some(selector =>
          implCodeLower.includes(selector.slice(2).toLowerCase())
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
 * 检查 Permit2 合约是否在该链上部署
 */
async function checkPermit2Support(client: PublicClient): Promise<boolean> {
  try {
    // 检查 Permit2 合约是否在该链上部署
    const permit2Code = await client.getBytecode({ address: PERMIT2_ADDRESS });
    if (!permit2Code) return false;

    // 如果 Permit2 存在，理论上任何 ERC-20 都可以使用它
    return true;
  } catch (error) {
    console.error("Error checking Permit2 support:", error);
    return false;
  }
}

/**
 * 检测代币支持的支付方式
 * @param tokenAddress 代币地址
 * @param client viem PublicClient
 * @returns 检测结果
 */
export async function detectTokenPaymentMethods(
  tokenAddress: string,
  client: PublicClient
): Promise<TokenPaymentCapabilities> {
  const address = tokenAddress.toLowerCase() as Address;

  console.log(`🔍 Detecting payment methods for token ${address}...`);

  // 并行检测所有方法
  const [hasEIP3009, hasPermit, hasPermit2Approval] = await Promise.all([
    hasAnyMethod(client, address, EIP3009_SIGNATURES),
    hasMethod(client, address, EIP2612_PERMIT),
    checkPermit2Support(client),
  ]);

  // 构建支持的方法列表
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

  return {
    address,
    supportedMethods,
    details: {
      hasEIP3009,
      hasPermit,
      hasPermit2Approval,
    },
  };
}

/**
 * 获取推荐的支付方式（仅返回 schema 支持的类型）
 * 按优先级排序：eip3009 > permit > permit2
 * 注意：permit2-witness 会被映射为 permit2，因为它们在 schema 中是同一种支付类型
 */
export function getRecommendedPaymentMethod(
  capabilities: TokenPaymentCapabilities
): "eip3009" | "permit2" | "permit" | null {
  const { supportedMethods } = capabilities;

  if (supportedMethods.includes("eip3009")) return "eip3009";
  if (supportedMethods.includes("permit")) return "permit";
  // permit2 和 permit2-witness 都映射为 permit2（schema 只支持 permit2）
  if (supportedMethods.includes("permit2") || supportedMethods.includes("permit2-witness")) {
    return "permit2";
  }

  return null;
}

/**
 * 获取 token 的 name 和 version 信息（用于 EIP-712 签名）
 * 支持代理合约（会自动从代理合约读取，因为代理合约会 delegatecall 到实现合约）
 * @param tokenAddress 代币地址
 * @param client viem PublicClient
 * @returns Token 的 name 和 version
 */
export async function getTokenInfo(
  tokenAddress: string,
  client: PublicClient
): Promise<TokenInfo> {
  const address = tokenAddress.toLowerCase() as Address;

  // ERC-20 标准 ABI
  const erc20ABI = [
    {
      inputs: [],
      name: "name",
      outputs: [{ name: "", type: "string" }],
      stateMutability: "view",
      type: "function",
    },
  ] as const;

  // EIP-5267 eip712Domain ABI（OpenZeppelin v5+）
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

  // version() ABI（OpenZeppelin v4）
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
    // 检测是否为代理合约
    const implAddress = await getImplementationAddress(client, address);
    if (implAddress) {
      console.log(`  📦 Reading token info from proxy, actual calls will be delegated to implementation`);
    }

    // 获取 token name (对于代理合约，delegatecall 会自动转发到实现合约)
    const name = await client.readContract({
      address,
      abi: erc20ABI,
      functionName: "name",
    });

    // 尝试获取 version，优先使用 EIP-5267
    let version = "1"; // 默认版本
    try {
      const result = await client.readContract({
        address,
        abi: eip712DomainABI,
        functionName: "eip712Domain",
      });
      // eip712Domain 返回 [fields, name, version, chainId, verifyingContract, salt, extensions]
      version = result[2] as string; // version 是第 3 个元素（索引 2）
    } catch {
      // 回退到 version() 函数（OpenZeppelin v4）
      try {
        version = await client.readContract({
          address,
          abi: versionABI,
          functionName: "version",
        });
      } catch {
        // 如果两种方法都不可用，使用默认值 "1"
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

