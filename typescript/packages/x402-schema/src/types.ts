import { z } from "zod";

/**
 * 支持的支付类型
 */
export const PaymentTypeSchema = z.enum([
  "permit",
  "eip3009",
  "permit2",
]);

export type PaymentType = z.infer<typeof PaymentTypeSchema>;

/**
 * 网络类型
 */
export const NetworkSchema = z.string();

export type Network = z.infer<typeof NetworkSchema>;

/**
 * 输入 schema
 */
export const InputSchemaSchema = z.object({
  type: z.literal("http"),
  method: z.enum(["GET", "POST"]),
  discoverable: z.boolean().default(true),
  bodyFields: z.record(z.any()).optional(),
});

export type InputSchema = z.infer<typeof InputSchemaSchema>;

/**
 * 输出 schema
 */
export const OutputSchemaSchema = z.record(z.any());

export type OutputSchema = z.infer<typeof OutputSchemaSchema>;

/**
 * X402 Payment Schema 配置
 */
export const X402PaymentSchemaConfigSchema = z.object({
  scheme: z.literal("exact").default("exact"),
  network: NetworkSchema,
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string().default("application/json"),
  payTo: z.string(),
  maxTimeoutSeconds: z.number().default(3600),
  asset: z.string(),
  paymentType: PaymentTypeSchema.optional(),
  outputSchema: z
    .object({
      input: InputSchemaSchema.optional(),
      output: OutputSchemaSchema.optional(),
    })
    .optional(),
  extra: z.record(z.any()).optional(),
});

export type X402PaymentSchemaConfig = z.infer<
  typeof X402PaymentSchemaConfigSchema
>;

/**
 * 完整的 schema，包含额外信息
 */
export type X402PaymentSchemaWithExtra = X402PaymentSchemaConfig & {
  extra?: {
    relayer?: string;
    [key: string]: any;
  };
};

