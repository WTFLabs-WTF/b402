import type { PublicClient } from "viem";
import { TokenDetector } from "@wtflabs/x402-detector";
import { Facilitator } from "@wtflabs/x402-facilitator";
import type {
  X402ServerConfig,
  PaymentRequirements,
  PaymentPayload,
  Response402,
  InitResult,
  ProcessResult,
  ParseResult,
  VerifyResult,
  SettleResult,
  ParsedPayment,
} from "./types";
import { CreateRequirementsConfigSchema } from "./schemas";
import type { CreateRequirementsConfig } from "./schemas";
import { decodeBase64 } from "./utils";
import { PaymentPayloadSchema, PaymentRequirementsSchema } from "@wtflabs/x402/types";

/**
 * X402 Server
 *
 * 服务端 SDK，用于处理支付验证和结算
 *
 * @example
 * ```typescript
 * // 1. 创建 facilitator
 * const facilitator = new Facilitator({
 *   recipientAddress: "0x1234...",
 *   waitUntil: "confirmed",
 * });
 *
 * // 2. 创建 server
 * const server = new X402Server({
 *   client: viemClient,
 *   facilitator,
 * });
 *
 * // 3. 可选：预热缓存
 * await server.initialize([tokenAddress]);
 *
 * // 4. 创建支付要求
 * const requirements = await server.createRequirements({
 *   asset: tokenAddress,
 *   maxAmountRequired: "1000",
 * });
 *
 * // 5. 处理支付
 * const result = await server.process(paymentHeader, requirements);
 * ```
 */
export class X402Server {
  private client: PublicClient;
  private detector: TokenDetector;
  private facilitator: Facilitator;
  private network: string | null = null;

  /**
   * 构造函数
   *
   * @param config - Server 配置
   */
  constructor(config: X402ServerConfig) {
    if (!config.client) {
      throw new Error("client is required");
    }
    if (!config.facilitator) {
      throw new Error("facilitator is required");
    }

    this.client = config.client;
    this.facilitator = config.facilitator;

    // 初始化 detector (禁用日志)
    this.detector = new TokenDetector(config.client, { logger: null });

    // 保存网络配置
    this.network = config.network || null;
  }

  /**
   * 可选的初始化 - 预热缓存
   *
   * @param tokens - 要预热的 token 地址列表
   * @returns 初始化结果
   */
  async initialize(tokens: string[]): Promise<InitResult> {
    try {
      await this.detector.initialize(tokens);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Initialization failed",
      };
    }
  }

  /**
   * 创建支付要求
   *
   * @param config - 配置选项
   * @returns 支付要求
   */
  async createRequirements(config: CreateRequirementsConfig): Promise<PaymentRequirements> {
    // 使用 Zod 验证输入参数
    const validatedConfig = CreateRequirementsConfigSchema.parse(config);

    // 获取网络名称
    const network = validatedConfig.network || this.network || (await this.getNetworkName());

    // 确定支付类型和 token 信息
    let paymentType: "permit" | "eip3009" | "permit2" | undefined;
    let tokenName: string | undefined;
    let tokenVersion: string | undefined;

    if (validatedConfig.autoDetect !== false) {
      // 自动检测模式（默认）
      const result = await this.detector.detect(validatedConfig.asset);

      // 确定支付类型
      if (validatedConfig.paymentType && validatedConfig.paymentType !== "auto") {
        paymentType = validatedConfig.paymentType;
      } else {
        const recommendedMethod = await this.detector.getRecommendedMethod(validatedConfig.asset);
        if (!recommendedMethod) {
          throw new Error(
            `Token ${validatedConfig.asset} does not support advanced payment methods`,
          );
        }
        paymentType = recommendedMethod;
      }

      tokenName = result.name;
      tokenVersion = result.version;
    } else {
      // 快速模式，跳过检测
      if (!validatedConfig.paymentType || validatedConfig.paymentType === "auto") {
        throw new Error("Must specify paymentType when autoDetect is false");
      }
      paymentType = validatedConfig.paymentType;
    }

    // 构建支付要求（未验证的对象）
    const requirements: PaymentRequirements = {
      scheme: validatedConfig.scheme || "exact",
      network,
      maxAmountRequired: validatedConfig.maxAmountRequired,
      payTo: this.facilitator.recipientAddress,
      asset: validatedConfig.asset,
      maxTimeoutSeconds: validatedConfig.maxTimeoutSeconds || 300,
      resource: validatedConfig.resource || "",
      description: validatedConfig.description || "",
      mimeType: validatedConfig.mimeType || "application/json",
      paymentType,
      outputSchema: validatedConfig.outputSchema,
      extra: {
        ...(validatedConfig.extra || {}),
        ...(tokenName && { name: tokenName }),
        ...(tokenVersion && { version: tokenVersion }),
      },
    };

    // 使用 Zod 验证输出
    return PaymentRequirementsSchema.parse(requirements);
  }

  /**
   * 完整的支付处理流程
   * parse → verify → settle 一步到位
   *
   * @param paymentHeader - X-PAYMENT header 的值 (Base64)
   * @param expectedRequirements - 期望的支付要求
   * @returns 处理结果
   */
  async process(
    paymentHeader: string | undefined,
    expectedRequirements: PaymentRequirements,
  ): Promise<ProcessResult> {
    // 1. 解析
    const parsed = this.parse(paymentHeader, expectedRequirements);
    if (!parsed.success) {
      return {
        success: false,
        status: 402,
        response: parsed.response402,
      };
    }

    // 2. 验证
    const verified = await this.verify(parsed.data);
    if (!verified.success) {
      return {
        success: false,
        status: 402,
        response: this.get402Response(expectedRequirements, verified.error),
      };
    }

    // 3. 结算
    const settled = await this.settle(parsed.data);
    if (!settled.success) {
      return {
        success: false,
        status: 402,
        response: this.get402Response(expectedRequirements, settled.error),
      };
    }

    return {
      success: true,
      status: 200,
      data: {
        payer: verified.payer,
        txHash: settled.txHash,
      },
    };
  }

  /**
   * 解析支付头
   *
   * @param paymentHeader - X-PAYMENT header 的值
   * @param expectedRequirements - 期望的支付要求
   * @returns 解析结果
   */
  parse(paymentHeader: string | undefined, expectedRequirements: PaymentRequirements): ParseResult {
    // 检查是否提供了支付头
    if (!paymentHeader) {
      return {
        success: false,
        response402: this.get402Response(expectedRequirements, "missing_payment_header"),
      };
    }

    // 解析 Base64
    let payload: PaymentPayload;
    try {
      const decoded = decodeBase64(paymentHeader);
      const parsed = JSON.parse(decoded);

      // 使用 Zod 验证 payload
      payload = PaymentPayloadSchema.parse(parsed);
    } catch (error) {
      return {
        success: false,
        response402: this.get402Response(
          expectedRequirements,
          error instanceof Error
            ? `invalid_payment_header: ${error.message}`
            : "invalid_payment_header",
        ),
      };
    }

    return {
      success: true,
      data: {
        payload,
        requirements: expectedRequirements,
      },
    };
  }

  /**
   * 验证支付签名
   *
   * @param parsed - 解析后的支付数据
   * @returns 验证结果
   */
  async verify(parsed: ParsedPayment): Promise<VerifyResult> {
    try {
      // 调用 facilitator 验证
      const facilitatorPayload = {
        ...parsed.payload,
        payload: parsed.payload.payload || {},
      };

      const result = await this.facilitator.verify(
        facilitatorPayload as Parameters<typeof this.facilitator.verify>[0],
        parsed.requirements as Parameters<typeof this.facilitator.verify>[1],
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || result.errorMessage || "Verification failed",
        };
      }

      if (!result.payer) {
        return {
          success: false,
          error: "Payer address not found in verification result",
        };
      }

      return {
        success: true,
        payer: result.payer,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Verification error",
      };
    }
  }

  /**
   * 结算支付
   *
   * @param parsed - 解析后的支付数据
   * @returns 结算结果
   */
  async settle(parsed: ParsedPayment): Promise<SettleResult> {
    try {
      // 调用 facilitator 结算
      const facilitatorPayload = {
        ...parsed.payload,
        payload: parsed.payload.payload || {},
      };

      const result = await this.facilitator.settle(
        facilitatorPayload as Parameters<typeof this.facilitator.settle>[0],
        parsed.requirements as Parameters<typeof this.facilitator.settle>[1],
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || result.errorMessage || "Settlement failed",
        };
      }

      if (!result.transaction) {
        return {
          success: false,
          error: "Transaction hash not found in settlement result",
        };
      }

      return {
        success: true,
        txHash: result.transaction,
        network: result.network || parsed.requirements.network,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Settlement error",
      };
    }
  }

  /**
   * 生成 402 响应
   *
   * @param requirements - 支付要求
   * @param error - 可选的错误信息
   * @returns 402 响应对象
   */
  get402Response(requirements: PaymentRequirements, error?: string): Response402 {
    return {
      x402Version: 1,
      accepts: [requirements],
      error,
    };
  }

  /**
   * 清除缓存
   *
   * @param token - 可选，指定要清除的 token 地址
   */
  async clearCache(token?: string): Promise<void> {
    await this.detector.clearCache(token);
  }

  /**
   * 获取缓存统计
   *
   * @returns 缓存统计信息
   */
  getCacheStats(): { size: number; keys: string[] } {
    return this.detector.getCacheStats();
  }

  /**
   * 获取 facilitator 实例（供外部访问）
   *
   * @returns Facilitator 实例
   */
  getFacilitator(): Facilitator {
    return this.facilitator;
  }

  /**
   * 获取 detector 实例（供外部访问）
   *
   * @returns TokenDetector 实例
   */
  getDetector(): TokenDetector {
    return this.detector;
  }

  /**
   * 获取 client 实例（供外部访问）
   *
   * @returns PublicClient 实例
   */
  getClient(): PublicClient {
    return this.client;
  }

  /**
   * 获取网络名称
   *
   * @returns 网络名称
   */
  private async getNetworkName(): Promise<string> {
    if (this.network) {
      return this.network;
    }

    const chainId = await this.client.getChainId();

    // 映射常见的 chainId 到网络名称
    const networkMap: Record<number, string> = {
      1: "ethereum-mainnet",
      5: "ethereum-goerli",
      11155111: "ethereum-sepolia",
      56: "bsc-mainnet",
      97: "bsc-testnet",
      137: "polygon-mainnet",
      80001: "polygon-mumbai",
      42161: "arbitrum-mainnet",
      421613: "arbitrum-goerli",
      10: "optimism-mainnet",
      420: "optimism-goerli",
      8453: "base-mainnet",
      84531: "base-goerli",
    };

    this.network = networkMap[chainId] || `chain-${chainId}`;
    return this.network;
  }
}
