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

1. **自动检测 token 支持的支付方式** - 检测 token 是否支持 permit、eip3009 或 permit2
2. **验证 facilitator 支持** - 检查 facilitator 的 `/supported` 接口是否包含该代币和链
3. **验证链支持** - 检查当前配置的链是否在 facilitator 支持列表中
4. 检查 client network 是否和 schema 的 network 匹配
5. 检查 facilitator recipientAddress 是否和 schema payTo 一致

该方法会自动检测代币合约的字节码，判断是否支持以下支付方式：
- **EIP-2612 Permit** - 通过检查 `permit(address,address,uint256,uint256,uint8,bytes32,bytes32)` 方法
- **EIP-3009** - 通过检查 `transferWithAuthorization` 方法
- **Permit2** - 通过检查 Permit2 合约是否部署在当前链上

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

### Token 检测工具

#### `detectTokenPaymentMethods(tokenAddress, client)`

独立的 token 支付方式检测工具函数，可以在不创建完整 server 实例的情况下使用。

```typescript
import { detectTokenPaymentMethods } from "@wtflabs/x402-server";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const capabilities = await detectTokenPaymentMethods(
  "0x25d066c4C68C8A6332DfDB4230263608305Ca991",
  client
);

console.log("支持的支付方式:", capabilities.supportedMethods);
// 输出: ['permit'] 或 ['eip3009'] 或 ['permit2', 'permit2-witness']

console.log("检测详情:", capabilities.details);
// {
//   hasEIP3009: false,
//   hasPermit: true,
//   hasPermit2Approval: true
// }
```

- **参数:**
  - `tokenAddress`: token 合约地址
  - `client`: Viem PublicClient 实例
- **返回:** `Promise<TokenPaymentCapabilities>`

#### `getRecommendedPaymentMethod(capabilities)`

根据检测结果获取推荐的支付方式（按优先级：permit2 > eip3009 > permit）。

```typescript
import { getRecommendedPaymentMethod } from "@wtflabs/x402-server";

const recommended = getRecommendedPaymentMethod(capabilities);
console.log("推荐使用:", recommended); // 'permit2' | 'eip3009' | 'permit' | null
```

- **参数:**
  - `capabilities`: 从 `detectTokenPaymentMethods` 返回的检测结果
- **返回:** `PaymentMethod | null`

#### 类型定义

```typescript
type PaymentMethod = "eip3009" | "permit" | "permit2" | "permit2-witness";

interface TokenPaymentCapabilities {
  address: string;
  supportedMethods: PaymentMethod[];
  details: {
    hasEIP3009: boolean;
    hasPermit: boolean;
    hasPermit2Approval: boolean;
  };
}
```

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

