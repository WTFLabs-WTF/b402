# x402-fetch

A utility package that extends the native `fetch` API to automatically handle 402 Payment Required responses using the x402 payment protocol. This package enables seamless integration of payment functionality into your applications when making HTTP requests.

## Supported Authorization Types

This package supports multiple EVM authorization standards:

- **EIP-3009** (default): `transferWithAuthorization` - gasless token transfers
- **EIP-2612 Permit**: Standard permit functionality for ERC-20 tokens
- **Permit2**: Uniswap's universal token approval system

The authorization type is automatically selected based on the server's payment requirements (`extra.authorizationType`).

## Installation

```bash
npm install x402-fetch
```

## Quick Start

```typescript
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
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
import { wrapFetchWithPayment } from "x402-fetch";
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

### Server-Side: Specifying Authorization Type

The server specifies which authorization type the client should use in the 402 response:

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
        extra: {
          authorizationType: "permit", // Specify permit
        }
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
        extra: {
          authorizationType: "permit2", // Specify permit2
        }
      }]
    }, 402);
  }
  
  // Verify and settle payment...
});
```

### Authorization Type Selection

The client automatically detects and uses the appropriate authorization type:

1. **Server specifies `authorizationType: "permit"`** → Client uses EIP-2612 Permit
2. **Server specifies `authorizationType: "permit2"`** → Client uses Permit2
3. **Server specifies `authorizationType: "eip3009"` or omits it** → Client uses EIP-3009 (default)

### Authorization Type Comparison

| Feature | EIP-3009 | EIP-2612 Permit | Permit2 |
|---------|----------|-----------------|---------|
| Gas efficiency | High | High | High |
| Token support | Limited (tokens with EIP-3009) | Wide (most ERC-20) | Universal |
| Approval management | Per-transaction | Per-spender | Universal router |
| Nonce management | Custom | On-chain | Advanced |
| Best for | Specialized tokens | Standard ERC-20 | DeFi integrations |

