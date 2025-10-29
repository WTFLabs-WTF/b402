# @wtflabs/x402-server

X402 支付协议的服务端集成包，整合 facilitator、schema 和 viem client。

## 安装

```bash
npm install @wtflabs/x402-server @wtflabs/x402-facilitator @wtflabs/x402-schema viem
# 或
pnpm add @wtflabs/x402-server @wtflabs/x402-facilitator @wtflabs/x402-schema viem
```

## 使用

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

// 创建 facilitator
const facilitator = new Facilitator({
  recipientAddress: "0x1234...", // 商家地址 (EIP 7702)
  relayer: "0x5678...", // 可选，内置 WTF Facilitator
  waitUntil: "confirmed", // 可选
});

// 创建 schema
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: "100000",
  resource: "http://localhost:3000/protected-resource",
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: "0x1234...", // 商家地址
  maxTimeoutSeconds: 3600,
  asset: "0x5678...", // token address
  paymentType: "permit", // optional
  outputSchema: {
    input: {
      type: "http",
      method: "POST",
      discoverable: true,
      bodyFields: {},
    },
    output: {
      message: "string",
      authorizationType: "string",
      payer: "string",
    },
  },
});

// 创建 viem public client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

// 创建 X402Server
const server = new X402Server({
  facilitator,
  schema,
  client,
});

// 初始化服务器
const initResult = await server.initialize();
if (!initResult.success) {
  console.error("初始化失败:", initResult.error);
}

// 验证配置
const verifyResult = await server.verify();
if (!verifyResult.success) {
  console.error("验证失败:", verifyResult.errors);
}

// 验证支付
const paymentVerifyResult = await server.verifyPayment(
  paymentPayload,
  paymentRequirements
);

if (paymentVerifyResult.success) {
  console.log("支付验证成功！支付者:", paymentVerifyResult.payer);
}

// 结算支付
const settleResult = await server.settle(paymentPayload, paymentRequirements);

if (settleResult.success) {
  console.log("支付结算成功！交易哈希:", settleResult.transactionHash);
}
```

## API

### `X402Server`

#### 构造函数

```typescript
new X402Server(config: X402ServerConfig)
```

**配置选项 (`X402ServerConfig`):**

- `facilitator`: Facilitator 实例
- `schema`: X402PaymentSchema 实例
- `client`: Viem PublicClient 实例

#### 方法

##### `initialize()`

初始化服务器，验证 schema 并添加 facilitator 数据到 schema 的 extra 字段。

- **返回:** `Promise<InitializeResult>`

##### `verify()`

验证配置是否正确：

1. 检查 client network 是否和 schema 的 network 匹配
2. 检查 facilitator recipientAddress 是否和 schema payTo 一致

- **返回:** `Promise<VerifyResult>`

##### `verifyPayment(paymentPayload, paymentRequirements)`

验证支付负载。

- **参数:**
  - `paymentPayload`: 支付负载
  - `paymentRequirements`: 支付要求
- **返回:** `Promise<{ success: boolean; payer?: string; error?: string }>`

##### `settle(paymentPayload, paymentRequirements)`

结算支付。

- **参数:**
  - `paymentPayload`: 支付负载
  - `paymentRequirements`: 支付要求
- **返回:** `Promise<SettleResult>`

##### `getFacilitator()`

获取 facilitator 实例。

- **返回:** `Facilitator`

##### `getSchema()`

获取 schema 实例。

- **返回:** `X402PaymentSchema`

##### `getClient()`

获取 viem client 实例。

- **返回:** `PublicClient`

##### `isInitialized()`

检查服务器是否已初始化。

- **返回:** `boolean`

## 完整示例

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

async function main() {
  // 1. 创建 facilitator
  const facilitator = new Facilitator({
    recipientAddress: "0x1234567890123456789012345678901234567890",
    waitUntil: "confirmed",
  });

  // 2. 创建 schema
  const schema = new X402PaymentSchema({
    scheme: "exact",
    network: "bsc-testnet",
    maxAmountRequired: "100000",
    resource: "http://localhost:3000/protected-resource",
    description: "Access to protected resource",
    mimeType: "application/json",
    payTo: "0x1234567890123456789012345678901234567890",
    maxTimeoutSeconds: 3600,
    asset: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    paymentType: "permit",
  });

  // 3. 创建 viem client
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(),
  });

  // 4. 创建服务器
  const server = new X402Server({
    facilitator,
    schema,
    client,
  });

  // 5. 初始化
  await server.initialize();

  // 6. 验证配置
  const verifyResult = await server.verify();
  console.log("验证结果:", verifyResult);

  // 7. 处理支付
  // const settleResult = await server.settle(
  //   paymentPayload,
  //   paymentRequirements
  // );
}

main();
```

## License

Apache-2.0

