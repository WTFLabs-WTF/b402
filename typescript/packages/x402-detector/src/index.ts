/**
 * Token payment capability detection for x402 protocol
 * - EIP-2612 Permit detection
 * - EIP-3009 transferWithAuthorization detection
 * - Permit2 support detection
 * - Proxy contract support (EIP-1967, EIP-1822)
 * - Built-in caching mechanism
 */

// Export types
export type {
  PaymentMethod,
  TokenInfo,
  TokenPaymentCapabilities,
  TokenDetectionResult,
  PresetTokenConfig,
  Logger,
  TokenDetectorOptions,
} from "./types";

// Export constants
export {
  EIP3009_SIGNATURES,
  EIP2612_PERMIT,
  PERMIT2_ADDRESS,
  EIP1967_IMPLEMENTATION_SLOT,
  EIP1822_IMPLEMENTATION_SLOT,
  PRESET_TOKEN_CAPABILITIES,
} from "./constants";

// Export detector functions (with optional logger support)
export {
  detectTokenPaymentMethods,
  getRecommendedPaymentMethod,
  getTokenInfo,
  detectSettleMethods,
} from "./detector";

// Export proxy utilities
export { getImplementationAddress } from "./proxy";

// Export cache-enabled detector class (recommended for server usage)
export { TokenDetector } from "./cache";
