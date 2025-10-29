import type { Facilitator } from "@wtflabs/x402-facilitator";
import type { X402PaymentSchema } from "@wtflabs/x402-schema";
import type { PublicClient } from "viem";
import type {
  InitializeResult,
  SettleResult,
  VerifyResult,
  X402ServerConfig,
} from "./types";

/**
 * X402Server 类
 * 集成 facilitator, schema 和 client，提供完整的服务端支付处理
 *
 * @example
 * ```typescript
 * import { X402Server } from "@wtflabs/x402-server";
 * import { Facilitator } from "@wtflabs/x402-facilitator";
 * import { X402PaymentSchema } from "@wtflabs/x402-schema";
 * import { createPublicClient, http } from "viem";
 * import { bscTestnet } from "viem/chains";
 *
 * const facilitator = new Facilitator({
 *   recipientAddress: "0x1234...",
 * });
 *
 * const schema = new X402PaymentSchema({
 *   scheme: "exact",
 *   network: "bsc-testnet",
 *   maxAmountRequired: "100000",
 *   resource: "http://localhost:3000/protected-resource",
 *   description: "Access to protected resource",
 *   mimeType: "application/json",
 *   payTo: "0x1234...",
 *   maxTimeoutSeconds: 3600,
 *   asset: "0x5678...",
 * });
 *
 * const client = createPublicClient({
 *   chain: bscTestnet,
 *   transport: http(),
 * });
 *
 * const server = new X402Server({
 *   facilitator,
 *   schema,
 *   client,
 * });
 *
 * // 初始化和校验
 * await server.initialize();
 *
 * // 验证
 * const verifyResult = await server.verify();
 *
 * // 结算
 * const settleResult = await server.settle(paymentPayload, paymentRequirements);
 * ```
 */
export class X402Server {
  private facilitator: Facilitator;
  private schema: X402PaymentSchema;
  private client: PublicClient;
  private initialized: boolean = false;

  constructor(config: X402ServerConfig) {
    this.facilitator = config.facilitator;
    this.schema = config.schema;
    this.client = config.client;
  }

  /**
   * 初始化服务器
   * 初始化和校验 schema 等数据，对 schema 增加 facilitator 数据 extra: {relayer}
   */
  async initialize(): Promise<InitializeResult> {
    try {
      // 验证 schema
      this.schema.verify();

      // 将 facilitator 的 relayer 添加到 schema 的 extra 中
      this.schema.setExtra({
        relayer: this.facilitator.relayer,
      });

      this.initialized = true;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Initialization failed",
      };
    }
  }

  /**
   * 验证配置
   * 1. 验证 client network 是否和 schema 的 network 匹配
   * 2. 验证 facilitator recipientAddress 和 schema payTo 是否一致
   */
  async verify(): Promise<VerifyResult> {
    if (!this.initialized) {
      return {
        success: false,
        errors: [
          "Server not initialized. Please call initialize() first.",
        ],
      };
    }

    const errors: string[] = [];

    try {
      // 1. 验证 network 匹配
      const clientChainId = this.client.chain?.id;
      const schemaNetwork = this.schema.get("network");

      // 简化的网络验证逻辑
      // 实际应用中可能需要更复杂的网络匹配逻辑
      if (clientChainId) {
        // 检查 schema network 是否包含 chainId
        const networkValid = this.validateNetwork(
          schemaNetwork,
          clientChainId,
        );
        if (!networkValid) {
          errors.push(
            `Network mismatch: client chainId ${clientChainId} does not match schema network ${schemaNetwork}`,
          );
        }
      }

      // 2. 验证 payTo 和 recipientAddress 匹配
      const schemaPayTo = this.schema.get("payTo");
      const facilitatorRecipientAddress =
        this.facilitator.recipientAddress;

      if (
        schemaPayTo.toLowerCase() !==
        facilitatorRecipientAddress.toLowerCase()
      ) {
        errors.push(
          `Address mismatch: schema payTo ${schemaPayTo} does not match facilitator recipientAddress ${facilitatorRecipientAddress}`,
        );
      }

      // 3. 调用 facilitator verify（如果有支付负载的话）
      // 这里暂时只做配置验证，实际支付验证在处理支付时进行

      return {
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Unknown verification error",
      );
      return {
        success: false,
        errors,
      };
    }
  }

  /**
   * 结算支付
   * @param paymentPayload 支付负载
   * @param paymentRequirements 支付要求
   */
  async settle(
    paymentPayload: any,
    paymentRequirements: any,
  ): Promise<SettleResult> {
    if (!this.initialized) {
      return {
        success: false,
        error:
          "Server not initialized. Please call initialize() first.",
      };
    }

    try {
      // 调用 facilitator 进行结算
      const result = await this.facilitator.settle(
        paymentPayload,
        paymentRequirements,
      );

      if (!result.success) {
        return {
          success: false,
          error: result.error || result.errorMessage,
        };
      }

      return {
        success: true,
        transactionHash: result.transactionHash,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Settlement failed",
      };
    }
  }

  /**
   * 验证支付负载
   * @param paymentPayload 支付负载
   * @param paymentRequirements 支付要求
   */
  async verifyPayment(
    paymentPayload: any,
    paymentRequirements: any,
  ): Promise<{
    success: boolean;
    payer?: string;
    error?: string;
  }> {
    if (!this.initialized) {
      return {
        success: false,
        error:
          "Server not initialized. Please call initialize() first.",
      };
    }

    try {
      const result = await this.facilitator.verify(
        paymentPayload,
        paymentRequirements,
      );

      return {
        success: result.success,
        payer: result.payer,
        error: result.error || result.errorMessage,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Payment verification failed",
      };
    }
  }

  /**
   * 获取 facilitator
   */
  getFacilitator(): Facilitator {
    return this.facilitator;
  }

  /**
   * 获取 schema
   */
  getSchema(): X402PaymentSchema {
    return this.schema;
  }

  /**
   * 获取 client
   */
  getClient(): PublicClient {
    return this.client;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 验证网络是否匹配
   * @param schemaNetwork schema 中的 network
   * @param clientChainId client 的 chainId
   * @returns 是否匹配
   */
  private validateNetwork(
    schemaNetwork: string,
    clientChainId: number,
  ): boolean {
    // 如果是 eip155: 格式
    if (schemaNetwork.startsWith("eip155:")) {
      const chainId = parseInt(schemaNetwork.split(":")[1] || "0");
      return chainId === clientChainId;
    }

    // 常见网络名称映射
    const networkMap: Record<string, number> = {
      "ethereum": 1,
      "goerli": 5,
      "sepolia": 11155111,
      "base": 8453,
      "base-sepolia": 84532,
      "bsc": 56,
      "bsc-testnet": 97,
      "polygon": 137,
      "polygon-mumbai": 80001,
      "arbitrum": 42161,
      "arbitrum-goerli": 421613,
      "optimism": 10,
      "optimism-goerli": 420,
      "avalanche": 43114,
      "avalanche-fuji": 43113,
    };

    const expectedChainId = networkMap[schemaNetwork];
    if (expectedChainId !== undefined) {
      return expectedChainId === clientChainId;
    }

    // 如果无法匹配，返回 true（宽松验证）
    return true;
  }
}

