# @wtflabs/x402-server

完整的服务端 SDK，用于 x402 支付协议。提供支付验证、结算和自动 Token 检测功能。

## ✨ 特性

- 🚀 **简洁 API** - 仅需 2 个必填参数即可开始
- 🔍 **自动 Token 检测** - 基于 `@wtflabs/x402-detector` 自动识别支付类型
- 💰 **支付处理** - 通过 `@wtflabs/x402-facilitator` 验证和结算支付
- ⚡ **动态需求** - 实时创建支付要求
- 🎯 **性能优化** - 内置缓存、非阻塞初始化
- 🔌 **框架中间件** - Express 和 Hono 中间件开箱即用
- ✅ **Zod 验证** - 运行时类型安全
- 🔒 **100% 类型安全** - 零 `any` 类型，完整 TypeScript 支持
- 🎨 **解耦设计** - Facilitator 和 Server 独立运行

## 📦 安装

```bash
npm install @wtflabs/x402-server @wtflabs/x402-facilitator viem
```

**可选依赖**（根据框架选择）：
```bash
# 使用 Express
npm install express

# 使用 Hono
npm install hono
```

## 🚀 快速开始

### 方式 1：使用中间件（推荐）

#### Express 中间件

```typescript
import express from "express";
import { createExpressMiddleware, X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const app = express();

// 1. 创建 viem client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

// 2. 创建 facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
  waitUntil: "confirmed",
});

// 3. 创建 server
const server = new X402Server({
  client,
  facilitator,
});

// 4. 创建中间件
const paymentMiddleware = createExpressMiddleware({
  server,
  getToken: () => "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
  getAmount: () => "1000000", // 1 USDC (6 decimals)
});

// 5. 使用中间件
app.post("/api/premium", paymentMiddleware, (req, res) => {
  const { payer, txHash } = req.x402!;
  res.json({
    success: true,
    data: "Premium content",
    payer,
    txHash,
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

#### Hono 中间件

```typescript
import { Hono } from "hono";
import { createHonoMiddleware, X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const app = new Hono();

// 1. 创建 viem client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

// 2. 创建 facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

// 3. 创建 server
const server = new X402Server({
  client,
  facilitator,
});

// 4. 创建中间件
const paymentMiddleware = createHonoMiddleware({
  server,
  getToken: () => "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
  getAmount: () => "1000000",
});

// 5. 使用中间件
app.post("/api/premium", paymentMiddleware, (c) => {
  const x402 = c.get("x402") as { payer: string; txHash: string };
  return c.json({
    success: true,
    data: "Premium content",
    payer: x402.payer,
    txHash: x402.txHash,
  });
});

export default app;
```

### 方式 2：手动处理

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

// 1. 创建 viem client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

// 2. 创建 facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
  waitUntil: "confirmed",
});

// 3. 创建 server
const server = new X402Server({
  client,
  facilitator,
  network: "bsc-testnet", // 可选
});

// 4. 可选：预热缓存（非阻塞）
server.initialize([
  "0x25d066c4C68C8A6332DfDB4230263608305Ca991", // USDC
]);

// 5. 在路由中处理支付
app.post("/api/resource", async (req, res) => {
  // 创建支付要求
  const requirements = await server.createRequirements({
    asset: "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
    maxAmountRequired: "1000000",
    description: "Premium API access",
  });

  // 处理支付（parse → verify → settle）
  const result = await server.process(
    req.headers["x-payment"] as string,
    requirements
  );

  if (!result.success) {
    return res.status(402).json(result.response);
  }

  // 支付成功
  res.json({
    message: "Access granted",
    payer: result.data.payer,
    txHash: result.data.txHash,
    data: "Your protected resource",
  });
});
```

## 📚 API 参考

### X402Server 构造函数

```typescript
const server = new X402Server(config: X402ServerConfig)
```

#### 参数

**必填：**
- `client: PublicClient` - Viem PublicClient 实例
- `facilitator: Facilitator` - Facilitator 实例（处理支付）

**可选：**
- `network?: string` - 网络名称（默认从 client 自动检测）

#### 示例

```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
  waitUntil: "confirmed",
});

const server = new X402Server({
  client,
  facilitator,
  network: "bsc-testnet", // 可选
});
```

### 核心方法

#### `initialize(tokens: string[]): Promise<InitResult>`

预热 Token 检测缓存。非阻塞，可以在后台运行。

```typescript
// 等待初始化完成
await server.initialize([tokenAddress]);

// 或在后台运行
server.initialize([tokenAddress]).then(result => {
  if (result.success) {
    console.log("✅ Cache ready");
  }
});
```

#### `createRequirements(config): Promise<PaymentRequirements>`

创建支付要求。支持动态金额和自动检测。

**参数：**

```typescript
interface CreateRequirementsConfig {
  // 必填
  asset: string;              // Token 合约地址
  maxAmountRequired: string;  // 金额（wei，字符串格式）

  // 可选 - 网络和方案
  network?: string;           // 网络名称（覆盖全局配置）
  scheme?: "exact";           // 支付方案（目前仅支持 "exact"）
  outputSchema?: Record<string, unknown>;

  // 可选 - 支付类型
  paymentType?: "permit" | "eip3009" | "permit2" | "auto";

  // 可选 - 资源描述
  resource?: string;          // 资源 URL
  description?: string;       // 描述
  mimeType?: string;          // MIME 类型
  maxTimeoutSeconds?: number; // 超时时间（秒）

  // 可选 - 额外元数据
  extra?: Record<string, unknown>;

  // 可选 - 性能控制
  autoDetect?: boolean;       // false = 快速模式（需手动指定 paymentType）
}
```

**示例：**

```typescript
// 自动检测（默认）
const requirements = await server.createRequirements({
  asset: "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
  maxAmountRequired: "1000000",
  description: "Premium access",
});

// 快速模式（跳过检测）
const requirements = await server.createRequirements({
  asset: "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
  maxAmountRequired: "1000000",
  paymentType: "permit",
  autoDetect: false, // <1ms
});
```

#### `process(paymentHeader, requirements): Promise<ProcessResult>`

完整的支付处理流程（解析 → 验证 → 结算）。

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
  // 返回 402 状态码和 result.response
}
```

#### 分步处理（高级用法）

如需更细粒度的控制，可以分步处理：

```typescript
// 1. 解析支付头
const parsed = server.parse(paymentHeader, requirements);
if (!parsed.success) {
  return res.status(402).json(parsed.response402);
}

// 2. 验证支付
const verified = await server.verify(parsed.data);
if (!verified.success) {
  return res.status(402).json(
    server.get402Response(requirements, verified.error)
  );
}
console.log("Payer:", verified.payer);

// 3. 结算支付（可选 - 仅验证模式可跳过）
const settled = await server.settle(parsed.data);
if (!settled.success) {
  return res.status(402).json(
    server.get402Response(requirements, settled.error)
  );
}
console.log("TxHash:", settled.txHash);
```

### 工具方法

```typescript
// 生成 402 响应
const response402 = server.get402Response(requirements, error?);

// 清除 Token 缓存
await server.clearCache(tokenAddress?); // 指定地址或清除全部

// 获取缓存统计
const stats = server.getCacheStats();
console.log(stats.size, stats.keys);

// 获取底层实例（高级用法）
const facilitator = server.getFacilitator();
const detector = server.getDetector();
const client = server.getClient();
```

## 💡 使用示例

### 示例 1: 固定金额

```typescript
import express from "express";
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";

const app = express();

// 创建 facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

// 创建 server
const server = new X402Server({ client, facilitator });

// 预热缓存（可选）
await server.initialize(["0xUSDC"]);

// 固定要求
const requirements = await server.createRequirements({
  asset: "0xUSDC",
  maxAmountRequired: "1000000",
  description: "Access to premium API",
});

app.post("/premium-api", async (req, res) => {
  const result = await server.process(
    req.headers["x-payment"] as string,
    requirements
  );
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  res.json({ data: "premium content" });
});
```

### 示例 2: 动态定价

```typescript
app.post("/api/compute", async (req, res) => {
  const { complexity } = req.body;
  
  // 根据复杂度计算价格
  const price = calculatePrice(complexity);
  
  // 动态创建要求
  const requirements = await server.createRequirements({
    asset: "0xUSDC",
    maxAmountRequired: price,
    description: `Compute task (complexity: ${complexity})`,
  });
  
  const result = await server.process(
    req.headers["x-payment"] as string,
    requirements
  );
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  // 执行计算
  const computeResult = await performComputation(complexity);
  res.json({ result: computeResult, paid: price });
});
```

### 示例 3: 多 Token 支持

```typescript
const server = new X402Server({ client, facilitator });

// 预热多个 Token
await server.initialize(["0xUSDC", "0xDAI", "0xUSDT"]);

app.get("/premium-api", async (req, res) => {
  // 返回多个支付选项
  const accepts = await Promise.all([
    server.createRequirements({ 
      asset: "0xUSDC", 
      maxAmountRequired: "1000000" 
    }),
    server.createRequirements({ 
      asset: "0xDAI", 
      maxAmountRequired: "1000000000000000000" 
    }),
    server.createRequirements({ 
      asset: "0xUSDT", 
      maxAmountRequired: "1000000" 
    }),
  ]);
  
  res.status(402).json({
    x402Version: 1,
    accepts,
  });
});

app.post("/premium-api", async (req, res) => {
  // 用户使用选定的 Token 支付
  const parsed = server.parse(
    req.headers["x-payment"] as string, 
    accepts[0]
  );
  
  if (!parsed.success) {
    return res.status(402).json(parsed.response402);
  }
  
  // 检测使用的 Token
  const tokenUsed = parsed.data.payload.payload.authorization.token;
  
  // 创建匹配的要求
  const requirements = await server.createRequirements({
    asset: tokenUsed,
    maxAmountRequired: "1000000",
  });
  
  const result = await server.process(
    req.headers["x-payment"] as string,
    requirements
  );
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  res.json({ data: "premium content" });
});
```

### 示例 4: 快速模式（跳过检测）

```typescript
// 为获得最大性能，跳过自动检测
const requirements = await server.createRequirements({
  asset: "0xUSDC",
  maxAmountRequired: "1000000",
  paymentType: "permit",  // 手动指定
  autoDetect: false,      // 跳过检测 (<1ms)
});
```

## 🔌 框架集成

### Express

```typescript
import express from "express";
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const app = express();

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

const server = new X402Server({ client, facilitator });

app.post("/api/resource", async (req, res) => {
  const requirements = await server.createRequirements({
    asset: "0xUSDC",
    maxAmountRequired: "1000000",
  });
  
  const result = await server.process(
    req.headers["x-payment"] as string,
    requirements
  );
  
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
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const app = new Hono();

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

const server = new X402Server({ client, facilitator });

app.post("/api/resource", async (c) => {
  const requirements = await server.createRequirements({
    asset: "0xUSDC",
    maxAmountRequired: "1000000",
  });
  
  const result = await server.process(
    c.req.header("x-payment"),
    requirements
  );
  
  if (!result.success) {
    return c.json(result.response, 402);
  }
  
  return c.json({ data: "resource" });
});
```

### Next.js App Router

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { NextRequest } from "next/server";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const facilitator = new Facilitator({
  recipientAddress: "0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3",
});

const server = new X402Server({ client, facilitator });

export async function POST(req: NextRequest) {
  const requirements = await server.createRequirements({
    asset: "0xUSDC",
    maxAmountRequired: "1000000",
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

## 🎯 中间件详细文档

### Express 中间件

#### 基础用法

```typescript
import { createExpressMiddleware } from "@wtflabs/x402-server";

const middleware = createExpressMiddleware({
  server,
  getToken: (req) => req.body.token || "0xUSDC",
  getAmount: (req) => calculatePrice(req.body),
});

app.post("/api", middleware, (req, res) => {
  const { payer, txHash } = req.x402!;
  res.json({ data: "resource", payer, txHash });
});
```

#### 高级配置

```typescript
const middleware = createExpressMiddleware({
  server,
  
  // 获取 token 地址
  getToken: (req) => req.query.token as string || "0xUSDC",
  
  // 获取金额
  getAmount: (req) => {
    const { complexity } = req.body;
    return calculateDynamicPrice(complexity);
  },
  
  // 可选：额外配置
  getConfig: (req) => ({
    description: `API call for user ${req.user?.id}`,
    resource: req.url,
  }),
  
  // 可选：自定义错误处理
  onError: (error, req, res) => {
    console.error("Payment error:", error);
    res.status(500).json({ error: error.message });
  },
  
  // 可选：自定义 402 响应
  on402: (req, res, response402) => {
    console.log("Payment required for:", req.url);
    res.status(402).json(response402);
  },
  
  // 可选：支付成功回调
  onPaymentSuccess: async (req, payer, txHash) => {
    await logPayment(payer, txHash);
    console.log(`Payment received from ${payer}`);
  },
});
```

#### 类型定义

```typescript
import type { 
  ExpressRequest, 
  ExpressResponse, 
  ExpressNextFunction,
  ExpressMiddleware 
} from "@wtflabs/x402-server";

// ExpressRequest 接口
interface ExpressRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
  x402?: {
    payer: string;
    txHash: string;
  };
}

// ExpressResponse 接口
interface ExpressResponse {
  status(code: number): this;
  json(body: unknown): this;
}

// 中间件类型
type ExpressMiddleware = (
  req: ExpressRequest,
  res: ExpressResponse,
  next: ExpressNextFunction
) => void | Promise<void>;
```

### Hono 中间件

#### 基础用法

```typescript
import { createHonoMiddleware } from "@wtflabs/x402-server";

const middleware = createHonoMiddleware({
  server,
  getToken: (c) => c.req.query("token") || "0xUSDC",
  getAmount: async (c) => {
    const body = await c.req.json();
    return calculatePrice(body.complexity);
  },
});

app.post("/api", middleware, (c) => {
  const x402 = c.get("x402") as { payer: string; txHash: string };
  return c.json({ data: "resource", payer: x402.payer });
});
```

#### 高级配置

```typescript
const middleware = createHonoMiddleware({
  server,
  
  // 获取 token 地址
  getToken: (c) => c.req.query("token") || "0xUSDC",
  
  // 获取金额
  getAmount: async (c) => {
    const body = await c.req.json<{ complexity: number }>();
    return calculateDynamicPrice(body.complexity);
  },
  
  // 可选：额外配置
  getConfig: async (c) => {
    const body = await c.req.json();
    return {
      description: `API call with complexity ${body.complexity}`,
    };
  },
  
  // 可选：自定义错误处理
  onError: (error, c) => {
    console.error("Payment error:", error);
    return c.json({ error: error.message }, 500);
  },
  
  // 可选：自定义 402 响应
  on402: (c, response402) => {
    console.log("Payment required");
    return c.json(response402, 402);
  },
  
  // 可选：支付成功回调
  onPaymentSuccess: async (c, payer, txHash) => {
    await logPayment(payer, txHash);
    console.log(`Payment received from ${payer}`);
  },
});
```

#### 类型定义

```typescript
import type { 
  HonoContext, 
  HonoRequest, 
  HonoNext,
  HonoMiddlewareHandler 
} from "@wtflabs/x402-server";

// HonoRequest 接口
interface HonoRequest {
  header(name: string): string | undefined;
  json<T = unknown>(): Promise<T>;
  query(name: string): string | undefined;
}

// HonoContext 接口
interface HonoContext {
  req: HonoRequest;
  json(body: unknown, status?: number): Response;
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

// 中间件类型
type HonoMiddlewareHandler = (
  c: HonoContext, 
  next: HonoNext
) => Promise<Response | void>;
```

## 🎨 TypeScript 类型

### 完整类型导出

```typescript
import type {
  // 配置
  X402ServerConfig,
  CreateRequirementsConfig,
  
  // 数据结构
  PaymentRequirements,
  PaymentPayload,
  Response402,
  ParsedPayment,
  
  // 结果类型
  InitResult,
  ProcessResult,
  ParseResult,
  VerifyResult,
  SettleResult,
  
  // 中间件类型
  ExpressRequest,
  ExpressResponse,
  ExpressNextFunction,
  ExpressMiddleware,
  ExpressMiddlewareOptions,
  
  HonoContext,
  HonoRequest,
  HonoNext,
  HonoMiddlewareHandler,
  HonoMiddlewareOptions,
  
  // Facilitator 类型
  WaitUntil,
} from "@wtflabs/x402-server";
```

### Zod Schema 导出

所有类型都有对应的 Zod schema，用于运行时验证：

```typescript
import {
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
} from "@wtflabs/x402-server";

// 使用 schema 验证
const validated = CreateRequirementsConfigSchema.parse(config);
```

## ⚡ 性能优化

### 性能指标

| 操作 | 首次调用 | 缓存调用 |
|------|---------|---------|
| `createRequirements(autoDetect: true)` | 2-5s | <1ms |
| `createRequirements(autoDetect: false)` | <1ms | <1ms |
| `process()` | 2-5s + 网络 | <1ms + 网络 |

### 优化技巧

#### 1. 预热缓存

```typescript
// 服务启动时预热
await server.initialize([
  "0xUSDC",
  "0xDAI",
  "0xUSDT",
]);
```

#### 2. 快速模式

```typescript
// 跳过自动检测以获得最大性能
const requirements = await server.createRequirements({
  asset: "0xUSDC",
  maxAmountRequired: "1000000",
  paymentType: "permit",
  autoDetect: false, // <1ms
});
```

#### 3. 复用 Requirements

```typescript
// 对于固定金额的 API，可以复用 requirements
const cachedRequirements = await server.createRequirements({
  asset: "0xUSDC",
  maxAmountRequired: "1000000",
});

// 在多个请求中复用
app.post("/api", async (req, res) => {
  const result = await server.process(
    req.headers["x-payment"] as string,
    cachedRequirements
  );
  // ...
});
```

#### 4. 后台初始化

```typescript
// 不阻塞服务启动
server.initialize([tokenAddress]).then(result => {
  if (result.success) {
    console.log("✅ Cache warmed up");
  }
});

// 立即开始服务
app.listen(3000);
```

## ❌ 错误处理

### ProcessResult 类型

```typescript
type ProcessResult = 
  | {
      success: true;
      status: 200;
      data: {
        payer: string;
        txHash: string;
      };
    }
  | {
      success: false;
      status: 402;
      response: Response402;
    };
```

### 错误处理示例

```typescript
const result = await server.process(paymentHeader, requirements);

if (!result.success) {
  // 402 响应，包含错误详情
  console.log("Error:", result.response.error);
  console.log("Accepts:", result.response.accepts);
  return res.status(402).json(result.response);
}

// 成功
console.log("Payer:", result.data.payer);
console.log("TxHash:", result.data.txHash);
```

### 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| `missing_payment_header` | 未提供 X-Payment header | 客户端需要发送支付头 |
| `invalid_payment_header` | 支付头格式错误 | 检查 Base64 编码和 JSON 格式 |
| `Verification failed` | 签名验证失败 | 检查签名和参数匹配 |
| `Settlement failed` | 链上交易失败 | 检查余额、授权和网络状态 |

### Try-Catch 处理

```typescript
try {
  const result = await server.process(paymentHeader, requirements);
  
  if (!result.success) {
    return res.status(402).json(result.response);
  }
  
  res.json({ data: "success" });
} catch (error) {
  console.error("Unexpected error:", error);
  res.status(500).json({ 
    error: "Internal server error",
    message: error instanceof Error ? error.message : "Unknown error"
  });
}
```

## 🔍 调试

### 启用日志

```typescript
// Facilitator 支持自定义 logger
const facilitator = new Facilitator({
  recipientAddress: "0x...",
  logger: console, // 或自定义 logger
});
```

### 缓存统计

```typescript
const stats = server.getCacheStats();
console.log("Cache size:", stats.size);
console.log("Cached tokens:", stats.keys);
```

### 清除缓存

```typescript
// 清除特定 token
await server.clearCache("0xUSDC");

// 清除所有缓存
await server.clearCache();
```

## 📖 相关资源

### 相关包

- [`@wtflabs/x402`](../x402) - 核心协议类型和工具
- [`@wtflabs/x402-detector`](../x402-detector) - Token 检测库
- [`@wtflabs/x402-facilitator`](../x402-facilitator) - 支付处理库
- [`@wtflabs/x402-fetch`](../x402-fetch) - 客户端 SDK

### 文档

- [x402 协议规范](../../specs/x402-specification.md)
- [Exact Scheme 文档](../../specs/schemes/exact/)
- [HTTP Transport](../../specs/transports/http.md)

## 📄 许可证

Apache-2.0

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Made with ❤️ by WTFLabs**
