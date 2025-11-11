import {
  NetworkSchema,
  PaymentPayloadSchema,
  PaymentRequirementsSchema,
} from "x402x/types";
import { z } from "zod";

/**
 * 以太坊地址正则
 */
const EthAddressRegex = /^0x[a-fA-F0-9]{40}$/;

/**
 * 整数字符串验证
 *
 * @param value - 整数字符串
 * @returns 是否为整数字符串
 */
const isIntegerString = (value: string) => {
  const num = Number(value);
  return Number.isInteger(num) && num >= 0;
};

/**
 * CreateRequirementsConfig Schema
 *
 * @example
 * ```typescript
 * const config = {
 *   asset: "0x1234567890abcdef1234567890abcdef12345678",
 *   maxAmountRequired: "1000",
 * };
 * ```
 *
 * @returns CreateRequirementsConfigSchema
 */
export const CreateRequirementsConfigSchema = z.object({
  // 必填
  asset: z.string().regex(EthAddressRegex, "Invalid token address"),
  maxAmountRequired: z
    .string()
    .refine(isIntegerString, "Amount must be a non-negative integer string"),

  // 可选 - 网络和 scheme
  network: NetworkSchema.optional(),
  scheme: z.literal("exact").optional(),
  outputSchema: z.record(z.any()).optional(),

  // 可选 - 额外信息
  extra: z.record(z.any()).optional(),

  // 可选 - 支付类型
  paymentType: z.enum(["permit", "eip3009", "permit2", "auto"]).optional(),

  // 可选 - 资源描述
  resource: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  maxTimeoutSeconds: z.number().int().positive().optional(),

  // 可选 - 性能控制
  autoDetect: z.boolean().optional(),
});

export type CreateRequirementsConfig = z.infer<typeof CreateRequirementsConfigSchema>;

/**
 * PaymentRequirements Schema
 *
 * @example
 * ```typescript
 * const requirements = {
 *   x402Version: 1,
 *   scheme: "exact",
 *   network: "ethereum-mainnet",
 *   maxAmountRequired: "1000",
 *   payTo: "0x1234567890abcdef1234567890abcdef12345678",
 *   asset: "0x1234567890abcdef1234567890abcdef12345678",
 *   maxTimeoutSeconds: 300,
 *   resource: "https://api.example.com/data",
 *   description: "API access",
 *   mimeType: "application/json",
 *   paymentType: "permit",
 *   extra: {
 *     relayer: "0x1234567890abcdef1234567890abcdef12345678",
 *     name: "API access",
 *     version: "1.0.0",
 *   },
 * };
 * ```
 *
 * @returns PaymentRequirementsSchema
 */

export type PaymentRequirements = z.infer<typeof PaymentRequirementsSchema>;

/**
 * PaymentPayload Schema
 *
 * @example
 * ```typescript
 * const payload = {
 *   x402Version: 1,
 *   scheme: "exact",
 *   network: "ethereum-mainnet",
 *   payload: {
 *     maxAmountRequired: "1000",
 *     asset: "0x1234567890abcdef1234567890abcdef12345678",
 *     recipient: "0x1234567890abcdef1234567890abcdef12345678",
 *     nonce: "1234567890abcdef1234567890abcdef12345678",
 *     expiration: 1715000000,
 *   },
 * };
 * ```
 */
// export const PaymentPayloadSchema = z.object({
//   x402Version: z.number(),
//   scheme: z.literal("exact"),
//   network: z.string(),
//   payload: z.any(),
// });

export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;

/**
 * Payment Error Stage
 */
export type PaymentErrorStage = "parse" | "verify" | "settle";

/**
 * Response402 Schema
 */
export const Response402Schema = z.object({
  x402Version: z.literal(1),
  accepts: z.array(PaymentRequirementsSchema),
  error: z.string().optional(),
  errorStage: z.enum(["parse", "verify", "settle"]).optional(),
});

export type Response402 = z.infer<typeof Response402Schema>;

/**
 * InitResult Schema
 */
export const InitResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true) }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type InitResult = z.infer<typeof InitResultSchema>;

/**
 * ProcessResult Schema
 */
export const ProcessResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    status: z.literal(200),
    data: z.object({
      payer: z.string().regex(EthAddressRegex),
      txHash: z.string(),
    }),
  }),
  z.object({
    success: z.literal(false),
    status: z.literal(402),
    errorStage: z.enum(["parse", "verify"]),
    response: Response402Schema,
  }),
  z.object({
    success: z.literal(false),
    status: z.literal(500),
    errorStage: z.literal("settle"),
    response: Response402Schema,
    error: z.string(),
  }),
]);

export type ProcessResult = z.infer<typeof ProcessResultSchema>;

/**
 * ParsedPayment Schema
 */
export const ParsedPaymentSchema = z.object({
  payload: PaymentPayloadSchema,
  requirements: PaymentRequirementsSchema,
});

export type ParsedPayment = z.infer<typeof ParsedPaymentSchema>;

/**
 * ParseResult Schema
 */
export const ParseResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), data: ParsedPaymentSchema }),
  z.object({ success: z.literal(false), response402: Response402Schema }),
]);

export type ParseResult = z.infer<typeof ParseResultSchema>;

/**
 * VerifyResult Schema
 */
export const VerifyResultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), payer: z.string().regex(EthAddressRegex) }),
  z.object({ success: z.literal(false), error: z.string() }),
]);

export type VerifyResult = z.infer<typeof VerifyResultSchema>;

/**
 * SettleResult Schema
 */
export const SettleResultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    txHash: z.string(),
    network: z.string(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
]);

export type SettleResult = z.infer<typeof SettleResultSchema>;
