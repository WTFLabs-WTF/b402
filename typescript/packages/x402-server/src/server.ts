import type { Facilitator } from "@wtflabs/x402-facilitator";
import type { X402PaymentSchema, X402PaymentSchemaWithExtra } from "@wtflabs/x402-schema";
import type { PublicClient } from "viem";
import type {
  InitializeResult,
  SettleResult,
  VerifyResult,
  X402ServerConfig,
} from "./types";
import { PaymentPayload, PaymentRequirements } from "@wtflabs/x402/types";
import { detectTokenPaymentMethods, getRecommendedPaymentMethod, getTokenInfo, type PaymentMethod } from "./token-detection";

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
   * 并获取 token 的 name 和 version 信息
   */
  async initialize(): Promise<InitializeResult> {
    try {
      // 验证 schema
      this.schema.verify();

      // 获取 token 信息（name 和 version）并添加到 schema extra 中
      const schemaAsset = this.schema.get("asset");
      if (schemaAsset) {
        try {
          const tokenInfo = await getTokenInfo(schemaAsset, this.client);
          this.schema.setExtra({
            relayer: this.facilitator.relayer,
            name: tokenInfo.name,
            version: tokenInfo.version,
          });
          console.log(`✅ Token info retrieved: ${tokenInfo.name} v${tokenInfo.version}`);
        } catch (error) {
          console.warn(`⚠️  Failed to get token info, signatures may fail:`, error);
          // 仍然设置 relayer，但没有 name 和 version
          this.schema.setExtra({
            relayer: this.facilitator.relayer,
          });
        }
      } else {
        // 如果没有 asset，只设置 relayer
        this.schema.setExtra({
          relayer: this.facilitator.relayer,
        });
      }

      // TODO 将_verify中的内容内置到initialize中
      const verifyResult = await this._verify();
      if (!verifyResult.success) {
        return {
          success: false,
          error: verifyResult.errors?.[0] || "Verification failed",
        };
      }

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
  async _verify(): Promise<VerifyResult> {

    const errors: string[] = [];

    try {
      // 1. 检测 token 对 permit 和 eip3009 的支持
      const schemaAsset = this.schema.get("asset");
      if (schemaAsset) {
        const tokenCapabilities = await detectTokenPaymentMethods(
          schemaAsset,
          this.client
        );

        // 如果 schema 中不存在 paymentType，则根据 tokenCapabilities 自动确定
        // 优先级：eip3009 > permit2 > permit
        const currentPaymentType = this.schema.get("paymentType");
        if (!currentPaymentType) {
          const recommendedMethod = getRecommendedPaymentMethod(tokenCapabilities);
          if (recommendedMethod) {
            this.schema.set("paymentType", recommendedMethod);
            // console.log(`✅ Auto-selected payment method: ${recommendedMethod}`);
          } else {
            errors.push(
              `Token ${schemaAsset} does not support any advanced payment methods (permit, eip3009, permit2). Please specify paymentType manually.`
            );
          }
        } else {
          // 验证 schema 中指定的 paymentType 是否被 token 支持
          if (!tokenCapabilities.supportedMethods.includes(currentPaymentType)) {
            errors.push(
              `Token ${schemaAsset} does not support the specified payment method "${currentPaymentType}". Supported methods: ${tokenCapabilities.supportedMethods.join(", ")}`
            );
          }
        }

        // 如果 token 不支持任何高级支付方法，给出警告
        if (tokenCapabilities.supportedMethods.length === 0) {
          errors.push(
            `Token ${schemaAsset} does not support any advanced payment methods (permit, eip3009, permit2)`
          );
        }
      }

      // 2. 检查 facilitator 的 /supported 是否包含此代币和链
      const clientChainId = this.client.chain?.id;
      const schemaNetwork = this.schema.get("network");

      if (clientChainId && schemaAsset) {
        const facilitatorSupported = await this.facilitator.supported({
          chainId: clientChainId,
          tokenAddress: schemaAsset,
        });

        // console.log(
        //   `Checking facilitator support for chainId ${clientChainId} and token ${schemaAsset}`
        // );

        // 检查 facilitator 是否支持当前的链和代币组合
        const isSupportedByFacilitator = facilitatorSupported.kinds.some(
          (kind) => {
            // 检查网络匹配
            const networkMatches = kind.network === schemaNetwork;

            // 检查资产匹配
            const assetsInKind = (kind.extra as any)?.assets || [];
            const assetMatches = assetsInKind.some(
              (asset: any) =>
                asset.address.toLowerCase() === schemaAsset.toLowerCase()
            );

            return networkMatches && assetMatches;
          }
        );

        if (!isSupportedByFacilitator) {
          errors.push(
            `Facilitator does not support token ${schemaAsset} on network ${schemaNetwork} (chainId: ${clientChainId})`
          );
        } else {
          // console.log(`✅ Facilitator supports this configuration`);
        }

        // 3. 检查当前配置的链是否在 /supported 中
        const chainSupported = facilitatorSupported.kinds.some(
          (kind) => kind.network === schemaNetwork
        );

        if (!chainSupported) {
          errors.push(
            `Facilitator does not support network ${schemaNetwork} (chainId: ${clientChainId})`
          );
        }
      }

      // 4. 验证 network 匹配
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
        transaction: result.transaction,
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
    data?: string;
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
        data: result.payer,
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

  /**
   * 解析支付 header
   * @param paymentHeaderBase64 Base64 编码的支付 header
   * @returns 解析结果，成功时返回 paymentPayload 和 paymentRequirements，失败时返回服务端的支付要求
   */
  parsePaymentHeader(
    paymentHeaderBase64: string,
  ):
    | {
      success: true;
      data: {
        paymentPayload: PaymentPayload;
        paymentRequirements: PaymentRequirements;
      };
    }
    | { success: false; data: PaymentRequirements; error: string } {
    // 获取服务端的支付要求（从 schema 转换）
    const paymentRequirements = this.schema.toJSON() as PaymentRequirements;

    // 检查是否有 payment header
    if (!paymentHeaderBase64) {
      return {
        success: false,
        data: paymentRequirements,
        error: "No X-PAYMENT header",
      };
    }

    // 解码 payment header
    let paymentPayload: PaymentPayload;
    try {
      const paymentHeaderJson = Buffer.from(
        paymentHeaderBase64,
        "base64",
      ).toString("utf-8");
      paymentPayload = JSON.parse(paymentHeaderJson) as PaymentPayload;
    } catch (err) {
      return {
        success: false,
        data: paymentRequirements,
        error: "Invalid payment header format",
      };
    }

    // 验证支付数据与服务端 schema 是否一致
    const validationError = this.validatePaymentPayload(
      paymentPayload,
      paymentRequirements,
    );
    if (validationError) {
      return {
        success: false,
        data: paymentRequirements,
        error: validationError,
      };
    }

    // 返回成功结果
    return {
      success: true,
      data: {
        paymentPayload,
        paymentRequirements,
      },
    };
  }

  /**
   * 验证客户端的支付数据是否与服务端要求一致
   * @param paymentPayload 客户端的支付负载
   * @param paymentRequirements 服务端的支付要求
   * @returns 错误信息，如果验证通过则返回 null
   */
  private validatePaymentPayload(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): string | null {
    // 1. 验证 scheme
    if (paymentPayload.scheme !== paymentRequirements.scheme) {
      return `Scheme mismatch: expected '${paymentRequirements.scheme}', got '${paymentPayload.scheme}'`;
    }

    // 2. 验证 network
    if (paymentPayload.network !== paymentRequirements.network) {
      return `Network mismatch: expected '${paymentRequirements.network}', got '${paymentPayload.network}'`;
    }

    // 3. 验证支付金额（从 payload 中提取）
    if (paymentPayload.payload) {
      const authorization = (paymentPayload.payload as any).authorization;
      if (authorization?.value) {
        const paymentAmount = BigInt(authorization.value);
        const maxAmount = BigInt(paymentRequirements.maxAmountRequired);

        if (paymentAmount !== maxAmount) {
          return `Payment amount error ${paymentAmount} !== ${maxAmount}`;
        }
      }

      // 4. 验证 payTo 地址
      if (authorization?.to) {
        const expectedPayTo = paymentRequirements.payTo.toLowerCase();
        const actualPayTo = authorization.to.toLowerCase();

        if (actualPayTo !== expectedPayTo && actualPayTo !== paymentRequirements.extra?.relayer?.toLowerCase()) {
          return `PayTo address mismatch: expected '${expectedPayTo}', got '${actualPayTo}'`;
        }
      }

      // 5. 验证 asset 地址（如果是 permit 或 permit2）
      const authorizationType = (paymentPayload.payload as any)
        .authorizationType;
      if (
        authorizationType === "permit" ||
        authorizationType === "permit2" ||
        authorizationType === "eip3009"
      ) {
        // 对于 permit/permit2，asset 通常在 schema 中，需要与实际调用的合约匹配
        // 这里可以添加更多验证逻辑
      }
    }

    // 验证通过
    return null;
  }
}

