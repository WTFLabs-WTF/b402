# @wtflabs/x402-server

Server SDK for the x402 Payment Protocol. Handles payment verification and settlement with automatic token detection.

## Features

✅ **Simple API** - Just 2 required parameters to get started  
✅ **Automatic Token Detection** - Built on `@wtflabs/x402-detector`  
✅ **Payment Processing** - Verify and settle payments via `@wtflabs/x402-facilitator`  
✅ **Dynamic Requirements** - Create payment requirements on-the-fly  
✅ **Performance Optimized** - Built-in caching, non-blocking initialization  
✅ **Framework Middlewares** - Ready-to-use Express and Hono middlewares  
✅ **Zod Validation** - Runtime type safety for all data  
✅ **Decoupled Design** - Facilitator and Server are independent

## Installation

```bash
npm install @wtflabs/x402-server viem
```

## Quick Start

### Option 1: Using Middleware (Easiest)

```typescript
import express from "express";
import { createExpressMiddleware, X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";

const app = express();

// 1. Create facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

// 2. Create server
const server = new X402Server({
  client: createPublicClient({ chain: bscTestnet, transport: http() }),
  facilitator,
});

// 3. Create middleware
const paymentMiddleware = createExpressMiddleware({
  server,
  getToken: () => "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
  getAmount: () => "1000",
});

// 4. Use middleware
app.post("/api/resource", paymentMiddleware, (req, res) => {
  const { payer, txHash } = req.x402!;
  res.json({ data: "resource", payer, txHash });
});
```

### Option 2: Manual Processing

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

// 1. Create facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
  waitUntil: "confirmed",
});

// 2. Create server instance
const server = new X402Server({
  client: createPublicClient({
    chain: bscTestnet,
    transport: http(),
  }),
  facilitator,
});

// 3. Optional: Pre-warm cache (non-blocking)
server.initialize([
  "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
]);

// 4. Handle payment in your route
app.post("/api/resource", async (req, res) => {
  // Create payment requirements
  const requirements = await server.createRequirements({
    token: "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
    amount: "1000", // wei
  });

  // Process payment (parse → verify → settle)
  const result = await server.process(
    req.headers["x-payment"],
    requirements
  );

  if (!result.success) {
    return res.status(402).json(result.response);
  }

  // Payment successful!
  res.json({
    message: "Access granted",
    payer: result.data.payer,
    txHash: result.data.txHash,
    data: "your protected resource",
  });
});
```

## API Reference

### Constructor

```typescript
const server = new X402Server(config: X402ServerConfig)
```

**Required:**
- `client: PublicClient` - Viem PublicClient
- `facilitator: Facilitator` - Facilitator instance

**Optional:**
- `network?: string` - Network name (auto-detected from client)

**Example:**
```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";

// 1. Create facilitator first
const facilitator = new Facilitator({
  recipientAddress: "0x...",
  relayer: "0x...", // optional
  waitUntil: "confirmed", // optional
  baseUrl: "https://facilitator.example.com", // optional
  apiKey: "your-api-key", // optional
});

// 2. Pass to server
const server = new X402Server({
  client: viemClient,
  facilitator,
  network: "bsc-testnet", // optional
});
```

### Methods

#### `initialize(tokens: string[]): Promise<InitResult>`

Pre-warm the token detection cache. Non-blocking, can run in background.

```typescript
// Wait for initialization
await server.initialize([tokenAddress]);

// Or run in background
server.initialize([tokenAddress]).then(result => {
  if (result.success) console.log("✅ Cache ready");
});
```

#### `createRequirements(config): Promise<PaymentRequirements>`

Create payment requirements. Supports dynamic amounts and auto-detection.

```typescript
const requirements = await server.createRequirements({
  // Required
  token: "0x...",
  amount: "1000", // wei

  // Optional - override global config
  recipient?: "0x...",
  network?: "bsc-testnet",
  paymentType?: "permit" | "eip3009" | "permit2" | "auto",
  relayer?: "0x...",

  // Optional - resource description
  resource?: "https://api.example.com/data",
  description?: "Premium API access",
  mimeType?: "application/json",
  timeout?: 300,

  // Optional - performance
  autoDetect?: true, // false for fast mode
});
```

#### `process(paymentHeader, requirements): Promise<ProcessResult>`

Complete payment processing (parse → verify → settle).

```typescript
const result = await server.process(
  request.headers["x-payment"],
  requirements
);

if (result.success) {
  console.log("Payer:", result.data.payer);
  console.log("TxHash:", result.data.txHash);
} else {
  console.log("Error:", result.response.error);
  // Return 402 with result.response
}
```

#### Advanced: Step-by-Step Processing

```typescript
// 1. Parse payment header
const parsed = server.parse(paymentHeader, requirements);
if (!parsed.success) {
  return res.status(402).json(parsed.response402);
}

// 2. Verify payment
const verified = await server.verify(parsed.data);
if (!verified.success) {
  return res.status(402).json(
    server.get402Response(requirements, verified.error)
  );
}
console.log("Payer:", verified.payer);

// 3. Settle payment (optional - you can skip this for verify-only mode)
const settled = await server.settle(parsed.data);
if (!settled.success) {
  return res.status(402).json(
    server.get402Response(requirements, settled.error)
  );
}
console.log("TxHash:", settled.txHash);
```

### Utility Methods

```typescript
// Generate 402 response
const response402 = server.get402Response(requirements, error?);

// Clear token cache
await server.clearCache(tokenAddress?); // specific or all

// Get cache stats
const stats = server.getCacheStats();
console.log(stats.size, stats.keys);
```

## Usage Examples

### Example 1: Fixed Amount

```typescript
const server = new X402Server({ client, recipient });

// Pre-warm cache (optional)
await server.initialize(["0xUSDC"]);

// Fixed requirements
const requirements = await server.createRequirements({
  token: "0xUSDC",
  amount: "1000",
  description: "Access to premium API",
});

app.post("/premium-api", async (req, res) => {
  const result = await server.process(req.headers["x-payment"], requirements);
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  res.json({ data: "premium content" });
});
```

### Example 2: Dynamic Pricing

```typescript
app.post("/api/compute", async (req, res) => {
  const { complexity } = req.body;
  
  // Calculate price based on complexity
  const price = calculatePrice(complexity);
  
  // Dynamic requirements
  const requirements = await server.createRequirements({
    token: "0xUSDC",
    amount: price,
    description: `Compute task (${complexity})`,
  });
  
  const result = await server.process(req.headers["x-payment"], requirements);
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  // Execute computation
  const computeResult = await performComputation(complexity);
  res.json({ result: computeResult, paid: price });
});
```

### Example 3: Multiple Tokens

```typescript
const server = new X402Server({ client, recipient });

// Pre-warm multiple tokens
await server.initialize(["0xUSDC", "0xDAI", "0xUSDT"]);

app.get("/premium-api", async (req, res) => {
  // Return multiple payment options
  const accepts = await Promise.all([
    server.createRequirements({ token: "0xUSDC", amount: "1000" }),
    server.createRequirements({ token: "0xDAI", amount: "1000" }),
    server.createRequirements({ token: "0xUSDT", amount: "1000" }),
  ]);
  
  res.status(402).json({
    x402Version: 1,
    accepts,
  });
});

app.post("/premium-api", async (req, res) => {
  // User pays with their chosen token
  const parsed = server.parse(req.headers["x-payment"], accepts[0]);
  if (!parsed.success) {
    return res.status(402).json(parsed.response402);
  }
  
  // Detect which token was used
  const tokenUsed = parsed.data.payload.payload.authorization.token;
  
  // Create matching requirements
  const requirements = await server.createRequirements({
    token: tokenUsed,
    amount: "1000",
  });
  
  const result = await server.process(req.headers["x-payment"], requirements);
  // ...
});
```

### Example 4: Fast Mode (Skip Detection)

```typescript
// For maximum performance, skip auto-detection
const requirements = await server.createRequirements({
  token: "0xUSDC",
  amount: "1000",
  paymentType: "permit", // Manually specify
  autoDetect: false, // Skip detection (<1ms)
});
```

## Framework Integration

### Express

```typescript
import express from "express";
import { X402Server } from "@wtflabs/x402-server";

const app = express();
const server = new X402Server({ client, recipient });

app.post("/api/resource", async (req, res) => {
  const requirements = await server.createRequirements({
    token: "0xUSDC",
    amount: "1000",
  });
  
  const result = await server.process(req.headers["x-payment"], requirements);
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  res.json({ data: "resource" });
});
```

### Hono

```typescript
import { Hono } from "hono";
import { X402Server } from "@wtflabs/x402-server";

const app = new Hono();
const server = new X402Server({ client, recipient });

app.post("/api/resource", async (c) => {
  const requirements = await server.createRequirements({
    token: "0xUSDC",
    amount: "1000",
  });
  
  const result = await server.process(c.req.header("x-payment"), requirements);
  
  if (!result.success) {
    return c.json(result.response, 402);
  }
  
  return c.json({ data: "resource" });
});
```

### Next.js API Route

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { NextRequest } from "next/server";

const server = new X402Server({ client, recipient });

export async function POST(req: NextRequest) {
  const requirements = await server.createRequirements({
    token: "0xUSDC",
    amount: "1000",
  });
  
  const result = await server.process(
    req.headers.get("x-payment") || undefined,
    requirements
  );
  
  if (!result.success) {
    return Response.json(result.response, { status: 402 });
  }
  
  return Response.json({ data: "resource" });
}
```

## Performance

| Operation | First Call | Cached Call |
|-----------|-----------|-------------|
| `createRequirements(autoDetect: true)` | 2-5s | <1ms |
| `createRequirements(autoDetect: false)` | <1ms | <1ms |
| `process()` | 2-5s + network | <1ms + network |

**Tips:**
- Use `initialize()` on startup to pre-warm cache
- Set `autoDetect: false` for maximum speed (requires manual `paymentType`)
- Cache persists for the lifetime of the server instance

## Error Handling

```typescript
const result = await server.process(paymentHeader, requirements);

if (!result.success) {
  // 402 response with error details
  console.log(result.response.error);
  return res.status(402).json(result.response);
}

// Success!
console.log(result.data.payer);
console.log(result.data.txHash);
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import type {
  X402ServerConfig,
  CreateRequirementsConfig,
  PaymentRequirements,
  ProcessResult,
  InitResult,
} from "@wtflabs/x402-server";
```

## Middlewares

### Express Middleware

```typescript
import { createExpressMiddleware } from "@wtflabs/x402-server";

const middleware = createExpressMiddleware({
  server,
  getToken: (req) => req.body.token,
  getAmount: (req) => calculatePrice(req.body),
  onPaymentSuccess: async (req, payer, txHash) => {
    console.log(`Payment from ${payer}: ${txHash}`);
  },
});

app.post("/api", middleware, (req, res) => {
  const { payer, txHash } = req.x402!;
  res.json({ data: "resource", payer, txHash });
});
```

### Hono Middleware

```typescript
import { createHonoMiddleware } from "@wtflabs/x402-server";

const middleware = createHonoMiddleware({
  server,
  getToken: async (c) => (await c.req.json()).token,
  getAmount: async (c) => calculatePrice(await c.req.json()),
  onPaymentSuccess: async (c, payer, txHash) => {
    console.log(`Payment from ${payer}: ${txHash}`);
  },
});

app.post("/api", middleware, (c) => {
  const x402 = c.get("x402")!;
  return c.json({ data: "resource", payer: x402.payer });
});
```

**See [MIDDLEWARES.md](./MIDDLEWARES.md) for detailed guide.**

## Documentation

- **[README.md](./README.md)** - This file
- **[QUICK-START.md](./QUICK-START.md)** - 5-minute quick start guide
- **[USAGE.md](./USAGE.md)** - Detailed usage documentation
- **[MIDDLEWARES.md](./MIDDLEWARES.md)** - Express and Hono middleware guide
- **[ZOD-VALIDATION.md](./ZOD-VALIDATION.md)** - Zod validation explained
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Architecture and design
- **[examples/](./examples/)** - Complete examples

## License

Apache-2.0

## Related Packages

- `@wtflabs/x402-detector` - Token detection (used internally)
- `@wtflabs/x402-facilitator` - Payment processing (used internally)
- `@wtflabs/x402-fetch` - Client SDK
- `@wtflabs/x402` - Core protocol types
