import type {
  FacilitatorConfig,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
  WaitUntil,
} from "./types";

/**
 * WTF Facilitator 默认 URL
 */
const DEFAULT_FACILITATOR_URL = "https://facilitator.wtf.com/v1";

/**
 * 默认 Relayer 地址
 */
const DEFAULT_RELAYER_ADDRESS = "0x877D0A51a37178b5F34Ffb68a5c2beD0ff46D432";

/**
 * Facilitator 类
 * 用于处理支付验证和结算
 *
 * @example
 * ```typescript
 * const facilitator = new Facilitator({
 *   recipientAddress: "0x1234...",
 *   relayer: "0x5678...", // 可选
 *   waitUntil: "confirmed", // 可选
 * });
 *
 * // 验证支付
 * const verifyResult = await facilitator.verify(
 *   paymentPayload,
 *   paymentRequirements
 * );
 *
 * // 结算支付
 * const settleResult = await facilitator.settle(
 *   paymentPayload,
 *   paymentRequirements
 * );
 *
 * // 获取支持的支付类型
 * const supported = await facilitator.supported();
 * ```
 */
export class Facilitator {
  private config: Required<FacilitatorConfig>;
  private authHeaders: Record<string, string>;

  constructor(config: FacilitatorConfig) {
    if (!config.recipientAddress) {
      throw new Error("recipientAddress is required");
    }

    this.config = {
      recipientAddress: config.recipientAddress,
      relayer: config.relayer || DEFAULT_RELAYER_ADDRESS,
      waitUntil: config.waitUntil || "confirmed",
      baseUrl: config.baseUrl || DEFAULT_FACILITATOR_URL,
      apiKey: config.apiKey || "",
    };

    this.authHeaders = this.config.apiKey
      ? {
        Authorization: `Bearer ${this.config.apiKey}`,
      }
      : {};
  }

  /**
   * 获取 relayer 地址
   */
  get relayer(): string {
    return this.config.relayer;
  }

  /**
   * 获取 recipient 地址
   */
  get recipientAddress(): string {
    return this.config.recipientAddress;
  }

  /**
   * 获取等待策略
   */
  get waitUntil(): WaitUntil {
    return this.config.waitUntil;
  }

  /**
   * 验证支付
   * @param payload 支付负载
   * @param requirements 支付要求
   * @returns 验证结果
   */
  async verify(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<VerifyResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders,
        },
        body: JSON.stringify({
          x402Version: payload.x402Version,
          paymentPayload: payload,
          paymentRequirements: requirements,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Verification failed: ${response.status}`,
          errorMessage: errorText,
        };
      }

      const data = (await response.json()) as {
        success?: boolean;
        payer?: string;
        error?: string;
        errorMessage?: string;
      };
      return {
        success: data.success ?? true,
        payer: data.payer,
        error: data.error,
        errorMessage: data.errorMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: "Verification error",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 结算支付
   * @param payload 支付负载
   * @param requirements 支付要求
   * @param waitUntil 可选的等待策略，覆盖配置中的默认值
   * @returns 结算结果
   */
  async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    waitUntil?: WaitUntil,
  ): Promise<SettleResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders,
        },
        body: JSON.stringify({
          x402Version: payload.x402Version,
          paymentPayload: payload,
          paymentRequirements: requirements,
          waitUntil: waitUntil || this.config.waitUntil,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Settlement failed: ${response.status}`,
          errorMessage: errorText,
        };
      }

      const data = (await response.json()) as {
        success?: boolean;
        transactionHash?: string;
        network?: string;
        receipt?: any;
        error?: string;
        errorMessage?: string;
      };
      return {
        success: data.success ?? true,
        transactionHash: data.transactionHash,
        network: data.network,
        receipt: data.receipt,
        error: data.error,
        errorMessage: data.errorMessage,
      };
    } catch (error) {
      return {
        success: false,
        error: "Settlement error",
        errorMessage:
          error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 获取支持的支付类型
   * @param filters 可选的过滤条件
   * @returns 支持的支付类型列表
   */
  async supported(filters?: {
    chainId?: number;
    tokenAddress?: string;
  }): Promise<SupportedResponse> {
    try {
      const url = new URL(`${this.config.baseUrl}/supported`);
      if (filters?.chainId) {
        url.searchParams.set("chainId", filters.chainId.toString());
      }
      if (filters?.tokenAddress) {
        url.searchParams.set("tokenAddress", filters.tokenAddress);
      }

      const response = await fetch(url.toString(), {
        headers: this.authHeaders,
      });

      if (!response.ok) {
        throw new Error(`Failed to get supported kinds: ${response.status}`);
      }

      const data = await response.json();
      return data as SupportedResponse;
    } catch (error) {
      console.error("Error fetching supported payment kinds:", error);
      return { kinds: [] };
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): Required<FacilitatorConfig> {
    return { ...this.config };
  }
}

