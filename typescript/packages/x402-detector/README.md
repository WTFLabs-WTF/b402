# @wtflabs/x402-detector

Token payment capability detection SDK for the x402 protocol. Automatically detects which payment authorization methods (EIP-2612 Permit, EIP-3009, Permit2) are supported by ERC-20 tokens.

## Features

✅ **Comprehensive Detection**
- EIP-2612 Permit detection
- EIP-3009 (transferWithAuthorization) detection  
- Uniswap Permit2 support detection
- Token name and version extraction for EIP-712 signing

✅ **Proxy Contract Support**
- EIP-1967 transparent proxy detection
- EIP-1822 UUPS proxy detection
- Automatic implementation contract analysis

✅ **Performance Optimized**
- Built-in caching mechanism (永久缓存)
- Parallel detection for multiple tokens
- First call: 2-5s, cached calls: <1ms

✅ **Simple & Clean API**
- One class, minimal methods
- TypeScript-first with full type safety
- Zero external dependencies (except viem)

## Installation

```bash
npm install @wtflabs/x402-detector viem
```

## Quick Start

### Basic Usage (Recommended)

```typescript
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { TokenDetector } from "@wtflabs/x402-detector";

// Create viem client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

// Create detector
const detector = new TokenDetector(client);

// Detect token (first call: detects from blockchain)
const result = await detector.detect("0x25d066c4C68C8A6332DfDB4230263608305Ca991");
console.log(result);
// {
//   address: "0x25d066c4c68c8a6332dfdb4230263608305ca991",
//   supportedMethods: ["permit", "permit2", "permit2-witness"],
//   details: { hasEIP3009: false, hasPermit: true, hasPermit2Approval: true },
//   name: "USD Coin",
//   version: "1"
// }

// Second call: returns from cache (<1ms)
const result2 = await detector.detect("0x25d066c4C68C8A6332DfDB4230263608305Ca991");

// Get recommended payment method
const method = await detector.getRecommendedMethod(tokenAddress);
console.log(method); // "permit"
```

### Batch Detection (Cache Warming)

```typescript
const detector = new TokenDetector(client);

// Pre-warm cache for multiple tokens (parallel)
const tokens = [
  "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
  "0xcea4eaef42afd4d6e12660b59018e90fa3ab28f4", // DAI
];

const results = await detector.initialize(tokens);
// 🔥 Warming up cache for 2 tokens...
// ✅ Successfully detected 2/2 tokens

// Subsequent calls are instant (<1ms from cache)
for (const token of tokens) {
  const info = await detector.detect(token);
  console.log(info.name, info.supportedMethods);
}
```

### Server Integration Example

```typescript
import { TokenDetector } from "@wtflabs/x402-detector";

class PaymentServer {
  private detector: TokenDetector;

  constructor(client) {
    this.detector = new TokenDetector(client);
  }

  async initialize() {
    // Pre-warm cache on startup
    await this.detector.initialize([
      "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
      "0xcea4eaef42afd4d6e12660b59018e90fa3ab28f4", // DAI
    ]);
  }

  async createPaymentRequirements(tokenAddress: string, amount: string) {
    // Fast lookup from cache
    const result = await this.detector.detect(tokenAddress);
    const method = await this.detector.getRecommendedMethod(tokenAddress);

    return {
      scheme: "exact",
      network: "bsc-testnet",
      maxAmountRequired: amount,
      asset: tokenAddress,
      paymentType: method,
      extra: {
        name: result.name,
        version: result.version,
      },
    };
  }
}
```

## API Reference

### TokenDetector Class

#### `constructor(client: PublicClient)`

创建检测器实例。

**Parameters:**
- `client: PublicClient` - viem PublicClient

**Example:**
```typescript
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const detector = new TokenDetector(client);
```

#### `detect(tokenAddress: string): Promise<TokenDetectionResult>`

完整检测（支付能力 + Token 信息）。优先从缓存读取，缓存未命中时执行检测并缓存结果。

**Returns:**
```typescript
interface TokenDetectionResult {
  address: string;
  supportedMethods: PaymentMethod[];
  details: {
    hasEIP3009: boolean;
    hasPermit: boolean;
    hasPermit2Approval: boolean;
  };
  name: string;
  version: string;
}
```

#### `getRecommendedMethod(tokenAddress: string): Promise<"eip3009" | "permit" | "permit2" | null>`

获取推荐的支付方式。优先级：eip3009 > permit > permit2。

**Example:**
```typescript
const method = await detector.getRecommendedMethod(tokenAddress);
console.log(method); // "permit"
```

#### `initialize(tokenAddresses: string[]): Promise<TokenDetectionResult[]>`

批量检测多个 Token 并缓存结果（并行执行）。

**Example:**
```typescript
const results = await detector.initialize([token1, token2, token3]);
```

#### `clearCache(tokenAddress?: string): Promise<void>`

清除缓存。不提供参数时清除所有缓存。

**Example:**
```typescript
// Clear specific token
await detector.clearCache(tokenAddress);

// Clear all cache
await detector.clearCache();
```

#### `getCacheStats(): { size: number; keys: string[] }`

获取缓存统计信息。

**Example:**
```typescript
const stats = detector.getCacheStats();
console.log(stats.size); // 3
console.log(stats.keys); // ["56:0x...", "56:0x...", ...]
```

### Standalone Functions

如果只需要一次性检测（不需要缓存），可以使用独立函数：

```typescript
import {
  detectTokenPaymentMethods,
  getRecommendedPaymentMethod,
  getTokenInfo,
} from "@wtflabs/x402-detector";

// 检测支付能力
const capabilities = await detectTokenPaymentMethods(tokenAddress, client);

// 获取推荐方法
const method = await getRecommendedPaymentMethod(tokenAddress, client);

// 获取 Token 信息
const info = await getTokenInfo(tokenAddress, client);
```

## Performance

| Operation | First Call | Cached Call |
|-----------|-----------|-------------|
| `detect()` | 2-5s | <1ms |
| `getRecommendedMethod()` | 2-5s | <1ms |
| `initialize(10 tokens)` | ~5s | N/A |

**💡 Tips:**
- 缓存永久有效，除非手动清除
- 建议在服务启动时调用 `initialize()` 预热缓存
- 使用 `TokenDetector` 类以获得最佳性能

## Supported Features

### Payment Methods
- ✅ **EIP-3009** - transferWithAuthorization (USDC native)
- ✅ **EIP-2612** - Permit (standard ERC-20)
- ✅ **Permit2** - Uniswap universal approval

### Proxy Contracts
- ✅ EIP-1967 Transparent Proxy
- ✅ EIP-1822 UUPS Proxy
- ✅ Custom implementation() function

### Token Info
- ✅ Token name extraction
- ✅ Token version extraction (EIP-5267 & fallback)
- ✅ Proxy-aware reading

## Preset Tokens

预设配置可避免重复检测已知 Token：

```typescript
import { PRESET_TOKEN_CAPABILITIES } from "@wtflabs/x402-detector";

// Example preset
PRESET_TOKEN_CAPABILITIES["0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d"] = {
  supportedMethods: ["permit"],
  supportedNetworks: [56], // BSC
  description: "World Liberty Financial USD",
};
```

## Error Handling

```typescript
try {
  const result = await detector.detect(tokenAddress);
  console.log(result);
} catch (error) {
  console.error("Detection failed:", error.message);
}
```

## TypeScript Support

```typescript
import type {
  PaymentMethod,
  TokenInfo,
  TokenPaymentCapabilities,
  TokenDetectionResult,
  PresetTokenConfig,
} from "@wtflabs/x402-detector";
```

## Cache Management

缓存基于 `chainId:address` 键存储，永久有效直到手动清除：

```typescript
// Get cache stats
const stats = detector.getCacheStats();
console.log(`Cached ${stats.size} tokens`);

// Clear specific token
await detector.clearCache("0x...");

// Clear all
await detector.clearCache();
```

## License

Apache-2.0

## Related Packages

- `@wtflabs/x402` - Core x402 protocol implementation
- `@wtflabs/x402-server` - Server SDK (uses this detector)
- `@wtflabs/x402-client` - Client SDK
