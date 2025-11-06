import type { Address, PublicClient } from "viem";
import type { Logger } from "./types";
import { EIP1967_IMPLEMENTATION_SLOT, EIP1822_IMPLEMENTATION_SLOT } from "./constants";

/**
 * 默认 logger
 */
const defaultLogger: Logger = {
  log: (message: string) => console.log(message),
  error: (message: string, error?: unknown) => console.error(message, error),
};

/**
 * 检测合约是否是代理合约，并获取实现合约地址
 *
 * @param client - viem PublicClient
 * @param proxyAddress - 代理合约地址
 * @param logger - 可选的 logger
 * @returns 实现合约地址或 null
 */
export async function getImplementationAddress(
  client: PublicClient,
  proxyAddress: Address,
  logger: Logger | null = defaultLogger,
): Promise<Address | null> {
  try {
    // 方法1: 尝试读取 EIP-1967 存储槽位
    try {
      const implSlotData = await client.getStorageAt({
        address: proxyAddress,
        slot: EIP1967_IMPLEMENTATION_SLOT,
      });
      if (
        implSlotData &&
        implSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        // 从存储槽中提取地址（最后20字节）
        const implAddress = `0x${implSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          logger?.log(`  📦 Detected EIP-1967 proxy, implementation: ${implAddress}`);
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
      if (
        uupsSlotData &&
        uupsSlotData !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        const implAddress = `0x${uupsSlotData.slice(-40)}` as Address;
        if (implAddress !== "0x0000000000000000000000000000000000000000") {
          logger?.log(`  📦 Detected EIP-1822 UUPS proxy, implementation: ${implAddress}`);
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

      const implAddress = (await client.readContract({
        address: proxyAddress,
        abi: implABI,
        functionName: "implementation",
      })) as Address;

      if (implAddress && implAddress !== "0x0000000000000000000000000000000000000000") {
        logger?.log(`  📦 Detected proxy via implementation(), implementation: ${implAddress}`);
        return implAddress;
      }
    } catch {
      // 不是代理合约或不支持 implementation() 函数
    }

    return null;
  } catch (error) {
    logger?.error("Error detecting proxy implementation:", error);
    return null;
  }
}
