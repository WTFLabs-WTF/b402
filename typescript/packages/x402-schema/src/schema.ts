import { z } from "zod";
import {
  type X402PaymentSchemaConfig,
  X402PaymentSchemaConfigSchema,
  type X402PaymentSchemaWithExtra,
} from "./types";

/**
 * X402 Payment Schema 类
 * 用于校验和管理支付 schema 配置
 *
 * @example
 * ```ts
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
 *   paymentType: "permit",
 *   outputSchema: {
 *     input: {
 *       type: "http",
 *       method: "POST",
 *       discoverable: true,
 *       bodyFields: {}
 *     },
 *     output: {
 *       message: "string",
 *       authorizationType: "string",
 *       payer: "string"
 *     }
 *   }
 * });
 *
 * schema.verify();
 * schema.set("maxAmountRequired", "200000");
 * ```
 */
export class X402PaymentSchema {
  private config: X402PaymentSchemaWithExtra;

  constructor(config: X402PaymentSchemaConfig) {
    // 验证配置
    const validated = X402PaymentSchemaConfigSchema.parse(config);
    this.config = validated;
  }

  /**
   * 验证 schema 配置
   * @throws {z.ZodError} 如果配置无效
   */
  verify(): void {
    try {
      X402PaymentSchemaConfigSchema.parse(this.config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(
          `Schema validation failed: ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        );
      }
      throw error;
    }
  }

  /**
   * 设置 schema 配置项
   * @param key 配置键
   * @param value 配置值
   */
  set<K extends keyof X402PaymentSchemaConfig>(
    key: K,
    value: X402PaymentSchemaConfig[K],
  ): void {
    this.config[key] = value;
    this.verify();
  }

  /**
   * 获取配置项
   * @param key 配置键
   * @returns 配置值
   */
  get<K extends keyof X402PaymentSchemaWithExtra>(
    key: K,
  ): X402PaymentSchemaWithExtra[K] {
    return this.config[key];
  }

  /**
   * 获取完整配置
   * @returns 完整的 schema 配置
   */
  toJSON(): X402PaymentSchemaWithExtra {
    return { ...this.config };
  }

  /**
   * 设置 extra 数据
   * @param extra 额外的数据
   */
  setExtra(extra: Record<string, any>): void {
    this.config.extra = {
      ...this.config.extra,
      ...extra,
    };
  }

  /**
   * 获取 extra 数据
   * @returns extra 数据
   */
  getExtra(): Record<string, any> | undefined {
    return this.config.extra;
  }
}

