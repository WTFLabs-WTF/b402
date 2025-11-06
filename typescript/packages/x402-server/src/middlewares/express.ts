/**
 * Express 中间件 for x402 Payment Protocol
 */

import type { X402Server } from "../server";
import type { CreateRequirementsConfig } from "../schemas";

/**
 * Express types (避免直接导入 express，因为它是可选依赖)
 */
type Request = any;
type Response = any;
type NextFunction = any;

/**
 * Express 中间件配置选项
 */
export interface ExpressMiddlewareOptions {
  /** X402Server 实例 */
  server: X402Server;

  /** 获取 token 地址的函数 */
  getToken: (req: Request) => string | Promise<string>;

  /** 获取金额的函数 */
  getAmount: (req: Request) => string | Promise<string>;

  /** 可选：获取额外配置的函数 */
  getConfig?: (req: Request) => Partial<CreateRequirementsConfig> | Promise<Partial<CreateRequirementsConfig>>;

  /** 可选：自定义错误处理 */
  onError?: (error: Error, req: Request, res: Response) => void;

  /** 可选：自定义 402 响应处理 */
  on402?: (req: Request, res: Response, response402: any) => void;

  /** 可选：支付成功后的回调 */
  onPaymentSuccess?: (req: Request, payer: string, txHash: string) => void | Promise<void>;
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
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. 获取 token 和 amount
      const token = await options.getToken(req);
      const amount = await options.getAmount(req);

      // 2. 获取额外配置
      const extraConfig = options.getConfig ? await options.getConfig(req) : {};

      // 3. 创建支付要求
      const requirements = await options.server.createRequirements({
        token,
        amount,
        ...extraConfig,
      });

      // 4. 处理支付
      const paymentHeader = req.headers["x-payment"] as string | undefined;
      const result = await options.server.process(paymentHeader, requirements);

      // 5. 处理结果
      if (!result.success) {
        // 支付失败，返回 402
        if (options.on402) {
          options.on402(req, res, result.response);
        } else {
          res.status(402).json(result.response);
        }
        return;
      }

      // 6. 支付成功
      // 将支付信息附加到 req 对象
      (req as any).x402 = {
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
        console.error("x402 middleware error:", error);
        res.status(500).json({
          error: "Payment processing error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  };
}

/**
 * 扩展 Express Request 类型
 * 注意：这个扩展只在安装了 @types/express 时生效
 */
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      x402?: {
        payer: string;
        txHash: string;
      };
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

