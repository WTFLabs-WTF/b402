/**
 * Server SDK for x402 Payment Protocol
 *
 * - Automatic token detection (via @wtflabs/x402-detector)
 * - Payment verification and settlement (via @wtflabs/x402-facilitator)
 * - Dynamic PaymentRequirements creation with Zod validation for server side
 * - Built-in caching for performance
 * - Express and Hono middlewares
 */

// Export main class
export { X402Server } from "./server";

// Export middlewares
export { createExpressMiddleware, createHonoMiddleware } from "./middlewares";
export type { ExpressMiddlewareOptions, HonoMiddlewareOptions } from "./middlewares";

// Export types and schemas
export type {
  X402ServerConfig,
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
} from "./types";

export {
  CreateRequirementsConfigSchema,
  PaymentRequirementsSchema,
  PaymentPayloadSchema,
  Response402Schema,
  InitResultSchema,
  ProcessResultSchema,
  ParseResultSchema,
  VerifyResultSchema,
  SettleResultSchema,
  ParsedPaymentSchema,
} from "./types";

// Export utilities
export { decodeBase64, encodeBase64 } from "./utils";

// Re-export WaitUntil from facilitator
export type { WaitUntil } from "x402x-facilitator";
