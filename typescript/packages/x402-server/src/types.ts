import type { Facilitator } from "@wtflabs/x402-facilitator";
import type { X402PaymentSchema } from "@wtflabs/x402-schema";
import type { PublicClient } from "viem";

/**
 * X402Server 配置选项
 */
export interface X402ServerConfig {
  /**
   * Facilitator 实例
   */
  facilitator: Facilitator;

  /**
   * Payment Schema 实例
   */
  schema: X402PaymentSchema;

  /**
   * Viem Public Client 实例
   */
  client: PublicClient;
}

/**
 * 初始化结果
 */
export interface InitializeResult {
  success: boolean;
  error?: string;
}

/**
 * 验证结果
 */
export interface VerifyResult {
  success: boolean;
  errors?: string[];
}

/**
 * 结算结果
 */
export interface SettleResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

