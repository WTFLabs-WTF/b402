import type { PublicClient } from "viem";
import type { TokenDetectionResult, TokenDetectorOptions, Logger } from "./types";
import { detectTokenPaymentMethods, getTokenInfo } from "./detector";

/**
 * 默认 logger
 */
const defaultLogger: Logger = {
  log: (message: string) => console.log(message),
  error: (message: string, error?: unknown) => console.error(message, error),
};

/**
 * Token 检测器 - 带缓存功能的 SDK
 *
 * 主要用于 x402-server，也可以独立使用
 */
export class TokenDetector {
  /** 缓存存储 (chainId:address -> TokenDetectionResult) */
  private cache: Map<string, TokenDetectionResult> = new Map();

  /** viem PublicClient */
  private client: PublicClient;

  /** Logger 实例 */
  private logger: Logger | null;

  /**
   * 构造函数
   *
   * @param client - viem PublicClient
   * @param options - 可选配置
   */
  constructor(client: PublicClient, options?: TokenDetectorOptions) {
    this.client = client;
    this.logger = options?.logger === null ? null : options?.logger || defaultLogger;
  }

  /**
   * 完整检测（同时获取支付能力和 Token 信息）
   * 优先从缓存读取，缓存未命中时执行检测并缓存结果
   *
   * @param tokenAddress - Token 地址
   * @returns 完整的检测结果
   */
  async detect(tokenAddress: string): Promise<TokenDetectionResult> {
    const cacheKey = await this.getCacheKey(tokenAddress);

    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.logger?.log(`💾 Using cached result for token ${tokenAddress}`);
      return cached;
    }

    // 并行执行检测
    this.logger?.log(`🔍 Detecting token ${tokenAddress}...`);
    const [capabilities, info] = await Promise.all([
      detectTokenPaymentMethods(tokenAddress, this.client, this.logger),
      getTokenInfo(tokenAddress, this.client, this.logger),
    ]);

    const result: TokenDetectionResult = {
      ...capabilities,
      ...info,
    };

    // 存入缓存
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * 获取推荐的支付方式
   * 优先级：eip3009 > permit > permit2
   *
   * @param tokenAddress - Token 地址
   * @returns 推荐的支付方式
   */
  async getRecommendedMethod(
    tokenAddress: string,
  ): Promise<"eip3009" | "permit" | "permit2" | null> {
    const result = await this.detect(tokenAddress);
    const { supportedMethods } = result;

    if (supportedMethods.includes("eip3009")) return "eip3009";
    if (supportedMethods.includes("permit")) return "permit";
    if (supportedMethods.includes("permit2") || supportedMethods.includes("permit2-witness")) {
      return "permit2";
    }

    return null;
  }

  /**
   * 批量初始化（预热缓存）
   * 并行检测多个 Token 并缓存结果
   *
   * @param tokenAddresses - Token 地址列表
   * @returns 检测结果数组
   */
  async initialize(tokenAddresses: string[]): Promise<TokenDetectionResult[]> {
    this.logger?.log(`🔥 Warming up cache for ${tokenAddresses.length} tokens...`);

    // 并行检测所有 token
    const results = await Promise.all(
      tokenAddresses.map(address =>
        this.detect(address).catch(error => {
          this.logger?.error(`Failed to detect token ${address}:`, error);
          return null;
        }),
      ),
    );

    const successCount = results.filter(r => r !== null).length;
    this.logger?.log(`✅ Successfully detected ${successCount}/${tokenAddresses.length} tokens`);

    return results.filter((r): r is TokenDetectionResult => r !== null);
  }

  /**
   * 清除缓存
   *
   * @param tokenAddress - 可选，指定要清除的 Token 地址
   */
  async clearCache(tokenAddress?: string): Promise<void> {
    if (tokenAddress) {
      const cacheKey = await this.getCacheKey(tokenAddress);
      this.cache.delete(cacheKey);
      this.logger?.log(`🗑️  Cleared cache for token ${tokenAddress}`);
    } else {
      this.cache.clear();
      this.logger?.log(`🗑️  Cleared all cache`);
    }
  }

  /**
   * 获取缓存统计
   *
   * @returns 缓存统计信息
   */
  getCacheStats(): {
    size: number;
    keys: string[];
  } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * 生成缓存键
   *
   * @param tokenAddress - Token 地址
   * @returns 缓存键
   */
  private async getCacheKey(tokenAddress: string): Promise<string> {
    const chainId = await this.client.getChainId();
    return `${chainId}:${tokenAddress.toLowerCase()}`;
  }
}
