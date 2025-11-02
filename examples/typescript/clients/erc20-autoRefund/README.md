# ERC20 x402 Payment Example (使用新包)

这个示例展示了如何使用新创建的 X402 包来实现支付功能：

- `@wtflabs/x402-schema` - Schema 校验和配置
- `@wtflabs/x402-facilitator` - 支付 facilitator
- `@wtflabs/x402-server` - 服务端集成

## 项目结构

```
erc20/
├── package.json          # 依赖配置（使用新的三个包）
├── client.ts            # 客户端实现（发起支付请求）
├── resource.ts          # 服务端实现（使用新包处理支付）
├── .env-local           # 环境变量模板
└── README.md            # 本文件
```

## 核心特性

### 1. 使用 @wtflabs/x402-schema

```typescript
import { X402PaymentSchema } from "@wtflabs/x402-schema";

const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: "50000",
  resource: "http://localhost:4025/protected-resource",
  description: "Access to protected resource",
  payTo: recipientAddress,
  asset: tokenAddress,
  paymentType: "permit",
  // ... 其他配置
});

// 验证 schema
schema.verify();

// 动态修改
schema.set("maxAmountRequired", "100000");

// 获取配置
const config = schema.getConfig();
```

### 2. 使用 @wtflabs/x402-facilitator

```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";

const facilitator = new Facilitator({
  recipientAddress: "0x...", // 商家地址
  relayer: "0x...",          // 可选，中继地址
  waitUntil: "confirmed",    // 等待策略
});

// 验证支付
const verifyResult = await facilitator.verify(payload, requirements);

// 结算支付
const settleResult = await facilitator.settle(payload, requirements);
```

### 3. 使用 @wtflabs/x402-server

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { createPublicClient, http } from "viem";

// 创建 viem client
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

// 创建 X402Server，集成所有组件
const server = new X402Server({
  facilitator,
  schema,
  client,
});

// 初始化（添加 relayer 到 schema extra）
await server.initialize();

// 验证配置（network 匹配、地址匹配）
await server.verify();

// 处理支付
const verifyResult = await server.verifyPayment(payload, requirements);
const settleResult = await server.settle(payload, requirements);
```

## 快速开始

### 1. 安装依赖

```bash
# 在项目根目录
cd examples/typescript/clients/erc20
pnpm install
```

### 2. 配置环境变量

复制 `.env-local` 为 `.env` 并填入你的配置：

```bash
cp .env-local .env
```

编辑 `.env` 文件：

```bash
# 客户端私钥（需要有 USDC 和少量 ETH 作为 gas）
CLIENT_PRIVATE_KEY=your_private_key_here

# Base Sepolia RPC URL
PROVIDER_URL=https://sepolia.base.org

# 收款地址（商家地址）
RECIPIENT_ADDRESS=0x...
```

### 3. 启动服务端

```bash
pnpm run resource
```

服务端会：
- ✅ 创建并初始化 Facilitator
- ✅ 创建并验证 Schema
- ✅ 创建 Viem Client
- ✅ 创建并初始化 X402Server
- ✅ 验证所有配置
- ✅ 启动 HTTP 服务器监听 4025 端口

输出示例：
```
✅ Facilitator 已创建
   - Recipient: 0x...
   - Relayer: 0x...
   - Wait Until: confirmed

✅ Schema 已创建
   - Scheme: exact
   - Network: base-sepolia
   - Amount: 50000

✅ Viem Client 已创建
   - Chain: Base Sepolia
   - Chain ID: 84532

✅ X402Server 已创建

✅ Server 初始化成功
   - Relayer (added to schema): 0x...

✅ 配置验证通过
```

### 4. 运行客户端

在新的终端窗口：

```bash
pnpm run client
```

客户端会：
1. 向服务器发起请求
2. 收到 402 Payment Required
3. 创建 EIP-2612 Permit 签名
4. 使用 X-PAYMENT header 重新请求
5. 服务端使用 X402Server 验证和结算支付
6. 返回受保护的资源

## 代码亮点

### 服务端代码结构

```typescript
// 1. 创建 Facilitator
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  waitUntil: "confirmed",
});

// 2. 创建 Schema
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "base-sepolia",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/protected-resource`,
  payTo: RECIPIENT_ADDRESS,
  asset: USDC_ADDRESS,
  paymentType: "permit",
  // ... 其他配置
});

// 3. 创建 Viem Client
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(PROVIDER_URL),
});

// 4. 创建 X402Server（集成所有组件）
const x402Server = new X402Server({
  facilitator,
  schema,
  client,
});

// 5. 初始化和验证
await x402Server.initialize();
await x402Server.verify();

// 6. 在请求处理中使用
app.post("/protected-resource", async (c) => {
  // 验证支付
  const verifyResult = await x402Server.verifyPayment(
    paymentPayload,
    schema.getConfig()
  );
  
  // 结算支付
  const settleResult = await x402Server.settle(
    paymentPayload,
    schema.getConfig()
  );
  
  // 返回结果
  return c.json({
    message: "Success!",
    transactionHash: settleResult.transactionHash,
  });
});
```

## 与 permit-erc20 的区别

| 特性 | permit-erc20 | erc20 (本示例) |
|------|--------------|----------------|
| Schema 管理 | 手动 JSON 对象 | `X402PaymentSchema` 类 + Zod 验证 |
| Facilitator | 直接调用 API | `Facilitator` 类封装 |
| 服务端集成 | 分散的验证逻辑 | `X402Server` 统一管理 |
| 配置验证 | 手动检查 | 自动验证 network 和地址匹配 |
| 类型安全 | 部分 | 完整的 TypeScript 类型 |
| 错误处理 | 手动处理 | 统一的错误响应 |

## 优势

### 1. 类型安全

所有配置都有完整的 TypeScript 类型定义，编译时即可发现错误。

### 2. 配置验证

- ✅ Schema 自动验证（Zod）
- ✅ Network 匹配验证
- ✅ Address 匹配验证

### 3. 代码简洁

使用高层抽象，减少样板代码：

```typescript
// 旧方式
const verifyResponse = await axios.post(`${FACILITATOR_URL}/verify`, {
  paymentPayload: paymentHeader,
  paymentRequirements: paymentDetails,
});
// 手动处理响应...

// 新方式
const verifyResult = await x402Server.verifyPayment(
  paymentPayload,
  schema.getConfig()
);
// 自动处理，返回统一格式
```

### 4. 易于维护

所有配置集中管理，修改 schema 只需一处：

```typescript
schema.set("maxAmountRequired", "100000");
schema.setExtra({ customField: "value" });
```

### 5. 扩展性强

- 支持自定义 Facilitator URL
- 支持自定义等待策略
- 支持添加额外元数据

## 调试技巧

### 查看 Schema 配置

```typescript
console.log(JSON.stringify(schema.getConfig(), null, 2));
```

### 查看 Extra 数据

```typescript
const extra = schema.getExtra();
console.log("Relayer:", extra?.relayer);
```

### 测试支付要求

```bash
curl http://localhost:4025/payment-requirements
```

## 常见问题

### Q: 如何修改支付金额？

```typescript
schema.set("maxAmountRequired", "新金额");
```

### Q: 如何使用自定义 Facilitator？

```typescript
const facilitator = new Facilitator({
  recipientAddress: "0x...",
  baseUrl: "https://custom-facilitator.com/v1",
  apiKey: "your-api-key",
});
```

### Q: 如何切换到其他网络？

修改 schema 和 client：

```typescript
const schema = new X402PaymentSchema({
  network: "base", // 改为主网
  // ...
});

const client = createPublicClient({
  chain: base, // 改为主网
  transport: http(),
});
```

### Q: 配置验证失败怎么办？

检查验证错误：

```typescript
const verifyResult = await server.verify();
if (!verifyResult.success) {
  verifyResult.errors?.forEach(error => {
    console.error(error);
  });
}
```

## 相关文档

- [X402 协议规范](../../../../specs/x402-specification.md)
- [@wtflabs/x402-schema 文档](../../../../typescript/packages/x402-schema/README.md)
- [@wtflabs/x402-facilitator 文档](../../../../typescript/packages/x402-facilitator/README.md)
- [@wtflabs/x402-server 文档](../../../../typescript/packages/x402-server/README.md)
- [集成示例](../../../../typescript/packages/INTEGRATION_EXAMPLE.md)

## License

Apache-2.0

