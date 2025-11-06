/**
 * 支持的支付方式
 */
export type PaymentMethod = "eip3009" | "permit" | "permit2" | "permit2-witness";

/**
 * Token 信息
 */
export interface TokenInfo {
  name: string;
  version: string;
}

/**
 * Token 支付能力检测结果
 */
export interface TokenPaymentCapabilities {
  /** Token 地址 */
  address: string;
  /** 支持的支付方式列表 */
  supportedMethods: PaymentMethod[];
  /** 详细检测结果 */
  details: {
    /** 是否支持 EIP-3009 (transferWithAuthorization) */
    hasEIP3009: boolean;
    /** 是否支持 EIP-2612 (permit) */
    hasPermit: boolean;
    /** 是否支持 Permit2 (通用授权) */
    hasPermit2Approval: boolean;
  };
}

/**
 * 完整的 Token 检测结果（包含 name 和 version）
 */
export interface TokenDetectionResult extends TokenPaymentCapabilities {
  /** Token 名称 */
  name: string;
  /** Token version（用于 EIP-712 签名） */
  version: string;
}

/**
 * 预设 Token 配置
 */
export interface PresetTokenConfig {
  /** 支持的支付方式 */
  supportedMethods: PaymentMethod[];
  /** 支持的网络 ID 列表 */
  supportedNetworks: number[];
  /** Token 描述（可选） */
  description?: string;
}

/**
 * Logger 接口
 */
export interface Logger {
  log: (message: string) => void;
  error: (message: string, error?: unknown) => void;
}

/**
 * TokenDetector 配置选项
 */
export interface TokenDetectorOptions {
  /** 自定义 logger，默认使用 console */
  logger?: Logger | null; // null 表示禁用日志
}
