# x402-fetch

A utility package that extends the native `fetch` API to automatically handle 402 Payment Required responses using the x402 payment protocol. This package enables seamless integration of payment functionality into your applications when making HTTP requests.

## Supported Authorization Types

This package supports multiple EVM authorization standards:

- **EIP-3009** (default): `transferWithAuthorization` - gasless token transfers
- **EIP-2612 Permit**: Standard permit functionality for ERC-20 tokens
- **Permit2**: Uniswap's universal token approval system

The authorization type is automatically selected based on the server's payment requirements (`paymentType` field).

## Installation

```bash
npm install @wtflabs/x402-fetch
```

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@wtflabs/x402-fetch";
import { baseSepolia } from "viem/chains";

// Create a wallet client
const account = privateKeyToAccount("0xYourPrivateKey");
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

// Wrap the fetch function with payment handling
const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Make a request that may require payment
const response = await fetchWithPay("https://api.example.com/paid-endpoint", {
  method: "GET",
});

const data = await response.json();
```

## 多链支持

x402-fetch 现在支持灵活的多 EVM 链配置！使用新的 `createEvmSigner` API：

```typescript
import { createEvmSigner, wrapFetchWithPayment } from '@wtflabs/x402-fetch';

// 方式 1：使用链名称
const bscSigner = createEvmSigner('bsc', '0xYourPrivateKey');

// 方式 2：使用 viem chain 对象
import { polygon } from 'viem/chains';
const polygonSigner = createEvmSigner(polygon, '0xYourPrivateKey');

// 方式 3：自定义配置（包括自定义 RPC）
const customSigner = createEvmSigner({
  chainId: 56,
  name: 'BSC',
  rpcUrl: 'https://my-custom-rpc.com',
}, '0xYourPrivateKey');

// 为每条链创建独立的 fetch wrapper
const fetchBsc = wrapFetchWithPayment(fetch, bscSigner);
const fetchPolygon = wrapFetchWithPayment(fetch, polygonSigner);
```

**[📖 查看完整的多链使用指南](./MULTI_CHAIN_USAGE.md)**

## API

### `wrapFetchWithPayment(fetch, walletClient, maxValue?, paymentRequirementsSelector?)`

Wraps the native fetch API to handle 402 Payment Required responses automatically.

#### Parameters

- `fetch`: The fetch function to wrap (typically `globalThis.fetch`)
- `walletClient`: The wallet client used to sign payment messages (must implement the x402 wallet interface)
- `maxValue`: Optional maximum allowed payment amount in base units (defaults to 0.1 USDC)
- `paymentRequirementsSelector`: Optional function to select payment requirements from the response (defaults to `selectPaymentRequirements`)

#### Returns

A wrapped fetch function that automatically handles 402 responses by:
1. Making the initial request
2. If a 402 response is received, parsing the payment requirements
3. Verifying the payment amount is within the allowed maximum
4. Creating a payment header using the provided wallet client
5. Retrying the request with the payment header

## Examples

### Basic Usage

```typescript
import { config } from "dotenv";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "@wtflabs/x402-fetch";
import { baseSepolia } from "viem/chains";

config();

const { PRIVATE_KEY, API_URL } = process.env;

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const client = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});

const fetchWithPay = wrapFetchWithPayment(fetch, client);

// Make a request to a paid API endpoint
fetchWithPay(API_URL, {
  method: "GET",
})
  .then(async response => {
    const data = await response.json();
    console.log(data);
  })
  .catch(error => {
    console.error(error);
  });
```

### Server-Side: Specifying Payment Type

The server specifies which payment type the client should use in the 402 response:

```typescript
// EIP-2612 Permit example
app.post("/api/protected", async (c) => {
  const paymentHeader = c.req.header("X-PAYMENT");
  
  if (!paymentHeader) {
    return c.json({
      x402Version: 1,
      accepts: [{
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "100000",
        resource: "http://localhost:3000/api/protected",
        description: "Access to protected resource",
        mimeType: "application/json",
        payTo: "0x...",
        maxTimeoutSeconds: 3600,
        asset: "0x...", // Token address
        paymentType: "permit", // Specify permit
      }]
    }, 402);
  }
  
  // Verify and settle payment...
});
```

```typescript
// Permit2 example
app.post("/api/protected", async (c) => {
  const paymentHeader = c.req.header("X-PAYMENT");
  
  if (!paymentHeader) {
    return c.json({
      x402Version: 1,
      accepts: [{
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: "100000",
        resource: "http://localhost:3000/api/protected",
        description: "Access to protected resource",
        mimeType: "application/json",
        payTo: "0x...",
        maxTimeoutSeconds: 3600,
        asset: "0x...", // Token address
        paymentType: "permit2", // Specify permit2
      }]
    }, 402);
  }
  
  // Verify and settle payment...
});
```

### Payment Type Selection

The client automatically detects and uses the appropriate payment type:

1. **Server specifies `paymentType: "permit"`** → Client uses EIP-2612 Permit
2. **Server specifies `paymentType: "permit2"`** → Client uses Permit2
3. **Server specifies `paymentType: "eip3009"` or omits it** → Client uses EIP-3009 (default)

### Authorization Type Comparison

| Feature | EIP-3009 | EIP-2612 Permit | Permit2 |
|---------|----------|-----------------|---------|
| Gas efficiency | High | High | High |
| Token support | Limited (tokens with EIP-3009) | Wide (most ERC-20) | Universal |
| Approval management | Per-transaction | Per-spender | Universal router |
| Nonce management | Custom | On-chain | Advanced |
| Best for | Specialized tokens | Standard ERC-20 | DeFi integrations |

