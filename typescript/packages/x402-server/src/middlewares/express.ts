/**
 * Express 中间件 for x402 Payment Protocol
 */

import type { X402Server } from "../server";
import type { CreateRequirementsConfig, Response402 } from "../schemas";

/**
 * Express-like Request 接口
 * 定义最小化的类型，避免直接依赖 express
 */
export interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  protocol?: string;
  hostname?: string;
  originalUrl?: string;
  path?: string;
  x402?: {
    payer: string;
    txHash: string;
  };
}

/**
 * Express-like Response 接口
 */
export interface ExpressResponse {
  status(code: number): this;
  json(body: unknown): this;
}

/**
 * Express-like NextFunction 类型
 */
export type ExpressNextFunction = (error?: Error) => void;

/**
 * Express 中间件配置选项
 */
export interface ExpressMiddlewareOptions {
  /** X402Server 实例 */
  server: X402Server;

  /** 获取 token 地址的函数 */
  getToken: (req: ExpressRequest) => string | Promise<string>;

  /** 获取金额的函数 */
  getAmount: (req: ExpressRequest) => string | Promise<string>;

  /** 可选：获取额外配置的函数 */
  getConfig?: (
    req: ExpressRequest,
  ) => Partial<CreateRequirementsConfig> | Promise<Partial<CreateRequirementsConfig>>;

  /** 可选：自定义错误处理 */
  onError?: (error: Error, req: ExpressRequest, res: ExpressResponse) => void;

  /** 可选：自定义 402 响应处理 */
  on402?: (req: ExpressRequest, res: ExpressResponse, response402: Response402) => void;

  /** 可选：支付成功后的回调 */
  onPaymentSuccess?: (req: ExpressRequest, payer: string, txHash: string) => void | Promise<void>;
}

/**
 * 创建 Express 中间件
 *
 * @param options - 中间件配置
 * @returns Express 中间件函数
 *
 * @example
 * ```typescript
 * const middleware = createExpressMiddleware({
 *   server,
 *   getToken: (req) => req.body.token || USDC,
 *   getAmount: (req) => calculatePrice(req.body),
 * });
 *
 * app.post("/api/resource", middleware, (req, res) => {
 *   // Payment already verified and settled
 *   const { payer, txHash } = req.x402;
 *   res.json({ data: "resource", payer, txHash });
 * });
 * ```
 */
export function createExpressMiddleware(options: ExpressMiddlewareOptions) {
  return async (req: ExpressRequest, res: ExpressResponse, next: ExpressNextFunction) => {
    try {
      // 1. 获取 token 和 amount
      const token = await options.getToken(req);
      const amount = await options.getAmount(req);

      // 2. 获取额外配置
      const extraConfig = options.getConfig ? await options.getConfig(req) : {};

      // 3. 自动生成 resource URL（如果未在 extraConfig 中提供）
      let resource: string | undefined = extraConfig.resource;
      if (!resource && req.protocol && req.hostname && req.originalUrl) {
        // 自动从请求信息生成完整的 resource URL
        resource = `${req.protocol}://${req.hostname}${req.originalUrl}`;
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
      const paymentHeader = req.headers["x-payment"] as string | undefined;
      const result = await options.server.process(paymentHeader, requirements);

      // 6. 处理结果
      if (!result.success) {
        // 支付失败，根据错误阶段返回不同状态码
        // - parse/verify 失败: 402 (客户端需要重新支付)
        // - settle 失败: 500 (服务端错误)
        if (options.on402 && result.status === 402) {
          options.on402(req, res, result.response);
        } else {
          res.status(result.status).json(result.response);
        }
        return;
      }

      // 7. 支付成功
      // 将支付信息附加到 req 对象
      req.x402 = {
        payer: result.data.payer,
        txHash: result.data.txHash,
      };

      // 调用成功回调
      if (options.onPaymentSuccess) {
        await options.onPaymentSuccess(req, result.data.payer, result.data.txHash);
      }

      // 继续到下一个中间件
      next();
    } catch (error) {
      // 错误处理
      if (options.onError) {
        options.onError(error as Error, req, res);
      } else {
        // 检查是否为 Zod 验证错误
        const isZodError = error && typeof error === "object" && "issues" in error;

        if (isZodError) {
          console.error("x402 middleware validation error:", error);
          res.status(400).json({
            error: "Invalid payment configuration",
            message: error instanceof Error ? error.message : "Validation failed",
            details: (error as { issues?: unknown[] }).issues,
          });
        } else {
          console.error("x402 middleware error:", error);
          res.status(500).json({
            error: "Payment processing error",
            message: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }
  };
}

/**
 * Express 中间件函数类型
 */
export type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction,
) => void | Promise<void>;
