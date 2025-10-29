/**
 * Facilitator 等待策略
 */
export type WaitUntil = "simulated" | "submitted" | "confirmed";

/**
 * Facilitator 配置选项
 */
export interface FacilitatorConfig {
  /**
   * 商家地址 (收款地址，支持 EIP 7702)
   */
  recipientAddress: string;

  /**
   * 中继地址 (可选，默认使用内置 WTF Facilitator)
   */
  relayer?: string;

  /**
   * 等待策略
   * - "simulated": 仅模拟交易 (最快)
   * - "submitted": 等待交易提交
   * - "confirmed": 等待链上确认 (最安全，默认)
   */
  waitUntil?: WaitUntil;

  /**
   * Facilitator API 基础 URL (可选)
   */
  baseUrl?: string;

  /**
   * API 密钥 (可选)
   */
  apiKey?: string;
}

/**
 * 支付负载
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: any;
}

/**
 * 支付要求
 */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, any>;
}

/**
 * 验证响应
 */
export interface VerifyResponse {
  success: boolean;
  payer?: string;
  error?: string;
  errorMessage?: string;
}

/**
 * 结算响应
 */
export interface SettleResponse {
  success: boolean;
  transactionHash?: string;
  network?: string;
  error?: string;
  errorMessage?: string;
  receipt?: any;
}

/**
 * 支持的支付类型响应
 */
export interface SupportedResponse {
  kinds: Array<{
    x402Version: number;
    scheme: string;
    network: string;
    extra?: Record<string, any>;
  }>;
}

