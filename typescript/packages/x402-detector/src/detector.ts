import type { Address, PublicClient } from "viem";
import type { PaymentMethod, TokenPaymentCapabilities, TokenInfo, Logger } from "./types";
import {
  EIP3009_SIGNATURES,
  EIP2612_PERMIT,
  PERMIT2_ADDRESS,
  PRESET_TOKEN_CAPABILITIES,
} from "./constants";
import { getImplementationAddress } from "./proxy";

/**
 * 默认 logger
 */
const defaultLogger: Logger = {
  log: (message: string) => console.log(message),
  error: (message: string, error?: unknown) => console.error(message, error),
};

/**
 * 检查合约是否支持某个方法（通过字节码检查）
 * 支持代理合约检测
 *
 * @param client - viem PublicClient
 * @param tokenAddress - 合约地址
 * @param methodSelector - 方法选择器
 * @param logger - 可选的 logger
 * @returns true 如果合约支持该方法，否则 false
 */
async function hasMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelector: string,
  logger: Logger | null = defaultLogger,
): Promise<boolean> {
  try {
    // 尝试获取合约代码
    const code = await client.getCode({ address: tokenAddress });
    if (!code) return false;

    // 检查字节码中是否包含方法选择器
    const hasMethodInProxy = code.toLowerCase().includes(methodSelector.slice(2).toLowerCase());

    // 如果代理合约中找到了方法，直接返回 true
    if (hasMethodInProxy) {
      return true;
    }

    // 如果代理合约中没有找到，尝试检测是否是代理合约
    const implAddress = await getImplementationAddress(client, tokenAddress, logger);
    if (implAddress) {
      // 获取实现合约的字节码
      const implCode = await client.getCode({ address: implAddress });
      if (implCode) {
        const hasMethodInImpl = implCode
          .toLowerCase()
          .includes(methodSelector.slice(2).toLowerCase());
        if (hasMethodInImpl) {
          logger?.log(`  ✅ Method ${methodSelector} found in implementation contract`);
        }
        return hasMethodInImpl;
      }
    }

    return false;
  } catch (error) {
    logger?.error(`Error checking method ${methodSelector}:`, error);
    return false;
  }
}

/**
 * 检查合约是否支持多个方法签名中的任意一个
 * 支持代理合约检测
 *
 * @param client - viem PublicClient
 * @param tokenAddress - 合约地址
 * @param methodSelectors - 方法选择器列表
 * @param logger - 可选的 logger
 * @returns true 如果合约支持任意一个方法签名，否则 false
 */
async function hasAnyMethod(
  client: PublicClient,
  tokenAddress: Address,
  methodSelectors: readonly string[],
  logger: Logger | null = defaultLogger,
): Promise<boolean> {
  try {
    // 尝试获取合约代码
    const code = await client.getCode({ address: tokenAddress });
    if (!code) return false;

    const codeLower = code.toLowerCase();

    // 检查代理合约中是否包含任何一个方法选择器
    const hasMethodInProxy = methodSelectors.some(selector =>
      codeLower.includes(selector.slice(2).toLowerCase()),
    );

    // 如果代理合约中找到了方法，直接返回 true
    if (hasMethodInProxy) {
      return true;
    }

    // 如果代理合约中没有找到，尝试检测是否是代理合约
    const implAddress = await getImplementationAddress(client, tokenAddress, logger);
    if (implAddress) {
      // 获取实现合约的字节码
      const implCode = await client.getCode({ address: implAddress });
      if (implCode) {
        const implCodeLower = implCode.toLowerCase();
        const hasMethodInImpl = methodSelectors.some(selector =>
          implCodeLower.includes(selector.slice(2).toLowerCase()),
        );
        if (hasMethodInImpl) {
          logger?.log(`  ✅ Method(s) found in implementation contract`);
        }
        return hasMethodInImpl;
      }
    }

    return false;
  } catch (error) {
    logger?.error(`Error checking methods ${methodSelectors.join(", ")}:`, error);
    return false;
  }
}

/**
 * 检查 Permit2 合约是否在该链上部署
 *
 * @param client - viem PublicClient
 * @param logger - 可选的 logger
 * @returns true 如果 Permit2 合约已部署，否则 false
 */
async function checkPermit2Support(
  client: PublicClient,
  logger: Logger | null = defaultLogger,
): Promise<boolean> {
  try {
    // 检查 Permit2 合约是否在该链上部署
    const permit2Code = await client.getCode({ address: PERMIT2_ADDRESS });
    if (!permit2Code) return false;

    // 如果 Permit2 存在，理论上任何 ERC-20 都可以使用它
    return true;
  } catch (error) {
    logger?.error("Error checking Permit2 support:", error);
    return false;
  }
}

/**
 * 检测 Token 支持的支付方式
 *
 * @param tokenAddress - Token 地址
 * @param client - viem PublicClient
 * @param logger - 可选的 logger
 * @returns 检测结果
 */
export async function detectTokenPaymentMethods(
  tokenAddress: string,
  client: PublicClient,
  logger: Logger | null = defaultLogger,
): Promise<TokenPaymentCapabilities> {
  const address = tokenAddress.toLowerCase() as Address;
  const chainId = await client.getChainId();

  // 检查预设配置
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
      logger?.log("  ✅ EIP-3009 (transferWithAuthorization) - from preset");
    }
    if (hasPermit) {
      logger?.log("  ✅ EIP-2612 (permit) - from preset");
    }
    if (hasPermit2Approval) {
      logger?.log("  ✅ Permit2 support - from preset");
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

  logger?.log(`🔍 Detecting payment methods for token ${address}...`);

  // 并行检测所有方法
  const [hasEIP3009, hasPermit, hasPermit2Approval] = await Promise.all([
    hasAnyMethod(client, address, EIP3009_SIGNATURES, logger),
    hasMethod(client, address, EIP2612_PERMIT, logger),
    checkPermit2Support(client, logger),
  ]);

  // 构建支持的方法列表
  const supportedMethods: PaymentMethod[] = [];

  if (hasEIP3009) {
    supportedMethods.push("eip3009");
    logger?.log("  ✅ EIP-3009 (transferWithAuthorization) detected");
  }

  if (hasPermit) {
    supportedMethods.push("permit");
    logger?.log("  ✅ EIP-2612 (permit) detected");
  }

  if (hasPermit2Approval) {
    supportedMethods.push("permit2");
    supportedMethods.push("permit2-witness");
    logger?.log("  ✅ Permit2 support available (universal)");
  }

  if (supportedMethods.length === 0) {
    logger?.log("  ⚠️  No advanced payment methods detected (standard ERC-20 only)");
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
 *
 * @param tokenAddress - Token 地址
 * @param client - viem PublicClient
 * @param logger - 可选的 logger
 * @returns 推荐的支付方式
 */
export async function getRecommendedPaymentMethod(
  tokenAddress: string,
  client: PublicClient,
  logger: Logger | null = defaultLogger,
): Promise<"eip3009" | "permit2" | "permit" | null> {
  const capabilities = await detectTokenPaymentMethods(tokenAddress, client, logger);
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
 * 获取 Token 的 name 和 version 信息（用于 EIP-712 签名）
 * 支持代理合约（会自动从代理合约读取，因为代理合约会 delegatecall 到实现合约）
 *
 * @param tokenAddress - Token 地址
 * @param client - viem PublicClient
 * @param logger - 可选的 logger
 * @returns Token 的 name 和 version
 */
export async function getTokenInfo(
  tokenAddress: string,
  client: PublicClient,
  logger: Logger | null = defaultLogger,
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
    const implAddress = await getImplementationAddress(client, address, logger);
    if (implAddress) {
      logger?.log(
        `  📦 Reading token info from proxy, actual calls will be delegated to implementation`,
      );
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
        logger?.log(`  ℹ️  Using default version "1" for token ${address}`);
      }
    }

    return {
      name: name as string,
      version: version as string,
    };
  } catch (error) {
    logger?.error(`Error getting token info for ${address}:`, error);
    throw new Error(`Failed to get token info: ${error}`);
  }
}
