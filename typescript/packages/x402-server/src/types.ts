import type { PublicClient } from "viem";
import type { Facilitator } from "x402x-facilitator";

/**
 * X402Server 配置选项
 */
export interface X402ServerConfig {
  /** Viem PublicClient (必填) */
  client: PublicClient;

  /** Facilitator 实例 (必填) */
  facilitator: Facilitator;

  /** 网络名称，默认从 client 自动检测 */
  network?: string;
}

// Re-export all types and schemas from schemas.ts
export type {
  CreateRequirementsConfig,
  PaymentRequirements,
  PaymentPayload,
  Response402,
  InitResult,
  ProcessResult,
  ParseResult,
  VerifyResult,
  SettleResult,
  ParsedPayment,
} from "./schemas";

export {
  CreateRequirementsConfigSchema,
  Response402Schema,
  InitResultSchema,
  ProcessResultSchema,
  ParseResultSchema,
  VerifyResultSchema,
  SettleResultSchema,
  ParsedPaymentSchema,
} from "./schemas";

export { PaymentRequirementsSchema, PaymentPayloadSchema } from "x402x/types";
