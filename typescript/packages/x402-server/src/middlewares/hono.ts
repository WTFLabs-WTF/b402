/**
 * Hono 中间件 for x402 Payment Protocol
 */

import type { X402Server } from "../server";
import type { CreateRequirementsConfig, Response402 } from "../schemas";

/**
 * Hono-like Request 接口
 */
export interface HonoRequest {
  url?: string;
  header(name: string): string | undefined;
  json<T = unknown>(): Promise<T>;
  query(name: string): string | undefined;
}

/**
 * Hono-like Context 接口
 */
export interface HonoContext {
  req: HonoRequest;
  json(body: unknown, status?: number): Response;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

/**
 * Hono-like Next 函数
 */
export type HonoNext = () => Promise<void>;

/**
 * Hono 中间件函数类型
 */
export type HonoMiddlewareHandler = (c: HonoContext, next: HonoNext) => Promise<Response | void>;

/**
 * Hono 中间件配置选项
 */
export interface HonoMiddlewareOptions {
  /** X402Server 实例 */
  server: X402Server;

  /** 获取 token 地址的函数 */
  getToken: (c: HonoContext) => string | Promise<string>;

  /** 获取金额的函数 */
  getAmount: (c: HonoContext) => string | Promise<string>;

  /** 可选：获取额外配置的函数 */
  getConfig?: (
    c: HonoContext,
  ) => Partial<CreateRequirementsConfig> | Promise<Partial<CreateRequirementsConfig>>;

  /** 可选：自定义错误处理 */
  onError?: (error: Error, c: HonoContext) => Response | Promise<Response>;

  /** 可选：自定义 402 响应处理 */
  on402?: (c: HonoContext, response402: Response402) => Response | Promise<Response>;

  /** 可选：支付成功后的回调 */
  onPaymentSuccess?: (c: HonoContext, payer: string, txHash: string) => void | Promise<void>;
}

/**
 * 创建 Hono 中间件
 *
 * @param options - 中间件配置
 * @returns Hono 中间件函数
 *
 * @example
 * ```typescript
 * const middleware = createHonoMiddleware({
 *   server,
 *   getToken: (c) => c.req.query("token") || USDC,
 *   getAmount: async (c) => {
 *     const body = await c.req.json();
 *     return calculatePrice(body.complexity);
 *   },
 * });
 *
 * app.post("/api/resource", middleware, (c) => {
 *   // Payment already verified and settled
 *   const { payer, txHash } = c.get("x402");
 *   return c.json({ data: "resource", payer, txHash });
 * });
 * ```
 */
export function createHonoMiddleware(options: HonoMiddlewareOptions): HonoMiddlewareHandler {
  return async (c: HonoContext, next: HonoNext) => {
    try {
      // 1. 获取 token 和 amount
      const token = await options.getToken(c);
      const amount = await options.getAmount(c);

      // 2. 获取额外配置
      const extraConfig = options.getConfig ? await options.getConfig(c) : {};

      // 3. 自动生成 resource URL（如果未在 extraConfig 中提供）
      let resource: string | undefined = extraConfig.resource;
      if (!resource && c.req.url) {
        // 自动从请求信息生成完整的 resource URL
        resource = c.req.url;
      }

      // 4. 创建支付要求（过滤掉 undefined 值）
      const filteredConfig = Object.fromEntries(
        Object.entries({ ...extraConfig, resource }).filter(([, value]) => value !== undefined),
      );

      const requirements = await options.server.createRequirements({
        asset: token,
        maxAmountRequired: amount,
        ...filteredConfig,
      } as CreateRequirementsConfig);

      // 5. 处理支付
      const paymentHeader = c.req.header("x-payment");
      const result = await options.server.process(paymentHeader, requirements);

      // 6. 处理结果
      if (!result.success) {
        // 支付失败，根据错误阶段返回不同状态码
        // - parse/verify 失败: 402 (客户端需要重新支付)
        // - settle 失败: 500 (服务端错误)
        if (options.on402 && result.status === 402) {
          return options.on402(c, result.response);
        } else {
          return c.json(result.response, result.status);
        }
      }

      // 7. 支付成功
      // 将支付信息存储到 context
      c.set("x402", {
        payer: result.data.payer,
        txHash: result.data.txHash,
      });

      // 调用成功回调
      if (options.onPaymentSuccess) {
        await options.onPaymentSuccess(c, result.data.payer, result.data.txHash);
      }

      // 继续到下一个中间件
      await next();
    } catch (error) {
      // 错误处理
      if (options.onError) {
        return options.onError(error as Error, c);
      } else {
        // 检查是否为 Zod 验证错误
        const isZodError = error && typeof error === "object" && "issues" in error;

        if (isZodError) {
          console.error("x402 middleware validation error:", error);
          return c.json(
            {
              error: "Invalid payment configuration",
              message: error instanceof Error ? error.message : "Validation failed",
              details: (error as { issues?: unknown[] }).issues,
            },
            400,
          );
        } else {
          console.error("x402 middleware error:", error);
          return c.json(
            {
              error: "Payment processing error",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            500,
          );
        }
      }
    }
  };
}
