# ERC20 x402 Payment Example (EIP-7702 架构)

这个示例展示了如何使用 EIP-7702 合约架构实现 X402 支付功能：

- `@wtflabs/x402-schema` - Schema 校验和配置
- `@wtflabs/x402-facilitator` - 支付 facilitator
- `@wtflabs/x402-server` - 服务端集成
- **EIP-7702 合约** - 直接结算到用户的7702授权合约，自动处理手续费分配

## 项目结构

```
erc20-7702/
├── package.json          # 依赖配置（使用新的三个包）
├── client.ts            # 客户端实现（发起支付请求）
├── resource.ts          # 服务端实现（7702合约集成）
├── .env-local           # 环境变量模板
└── README.md            # 本文件
```

## EIP-7702 架构说明

在新的架构中：

1. **移除了 Relayer 合约** - 不再需要单独的中继合约
2. **直接使用 7702 合约** - `payTo` 地址直接指向用户的 EIP-7702 授权合约
3. **自动手续费处理** - 7702 合约内部自动处理 beneficiary 和 fee recipient 的资金分配
4. **简化的授权流程** - 客户端直接授权给 7702 合约地址

### 架构对比

| 特性 | 旧架构 (Relayer) | 新架构 (7702) |
|------|-----------------|--------------|
| 授权对象 | Relayer 合约 | 7702 合约 (payTo) |
| 手续费处理 | Relayer 内部逻辑 | 7702 合约内部逻辑 |
| schema 中的 `payTo` | Beneficiary 地址 | 7702 合约地址 |
| schema 中的 `extra.relayer` | Relayer 合约地址 | ❌ 不再使用 |
| Permit `spender` | Relayer 地址 | 7702 合约地址 |
| EIP-3009 `to` | Relayer 地址 | 7702 合约地址 |

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

### 2. 使用 @wtflabs/x402-facilitator (7702 模式)

```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";

const facilitator = new Facilitator({
  recipientAddress: "0x...", // 7702 合约地址
  waitUntil: "confirmed",    // 等待策略
  // 注意：不再需要 relayer 参数
});

// 验证支付
const verifyResult = await facilitator.verify(payload, requirements);

// 结算支付（直接调用 7702 合约）
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
cd examples/typescript/clients/erc20-7702
pnpm install
```

### 2. 配置环境变量

复制 `.env-local` 为 `.env` 并填入你的配置：

```bash
cp .env-local .env
```

编辑 `.env` 文件：

```bash
# 客户端私钥（需要有 ERC20 代币和少量 BNB 作为 gas）
CLIENT_PRIVATE_KEY=your_private_key_here

# BSC Testnet RPC URL
PROVIDER_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545

# Recipient Address - 7702合约地址（用户的 EIP-7702 授权地址）
RECIPIENT_ADDRESS=0x...
```

**重要说明：**
- `RECIPIENT_ADDRESS` 是用户通过 EIP-7702 授权的合约地址
- 这个地址将作为 `payTo` 参数，客户端会直接授权给这个地址
- 7702 合约会自动处理资金分配（beneficiary + fee recipient）

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
   - EIP-7702 Contract: 0x...
   - Wait Until: confirmed

✅ Permit Token X402Server 已创建
   - Token: 0x25d0...
   - Path: /permit

✅ EIP-3009 Token X402Server 已创建
   - Token: 0xcea4...
   - Path: /3009

✅ Permit Server 初始化成功
✅ EIP-3009 Server 初始化成功

═══════════════════════════════════════════
  ERC20 x402 Resource Server (7702)
═══════════════════════════════════════════
  Port: 4025
  EIP-7702 Contract: 0x...
  Payment Amount: 1000 wei

  📍 /permit endpoint:
     Token: 0x25d0...
     Type: EIP-2612 Permit → 7702

  📍 /3009 endpoint:
     Token: 0xcea4...
     Type: EIP-3009 → 7702
═══════════════════════════════════════════
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

### 服务端代码结构 (7702 架构)

```typescript
// 1. 创建 Facilitator（指向 7702 合约）
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS, // 7702 合约地址
  waitUntil: "confirmed",
  // 注意：不再需要 relayer 参数
});

// 2. 创建 Schema（payTo 直接指向 7702 合约）
const permitSchema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/permit`,
  payTo: RECIPIENT_ADDRESS, // 7702 合约地址
  asset: PERMIT_TOKEN_ADDRESS,
  paymentType: "permit",
  // 不需要 extra.relayer 字段
});

// 3. 创建 Viem Client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(PROVIDER_URL),
});

// 4. 创建 X402Server（集成所有组件）
const permitServer = new X402Server({
  facilitator,
  schema: permitSchema,
  client,
});

// 5. 初始化
await permitServer.initialize();

// 6. 在请求处理中使用
app.post("/permit", async (c) => {
  // 验证支付
  const verifyResult = await permitServer.verifyPayment(
    paymentPayload,
    paymentRequirements
  );
  
  // 结算支付（直接调用 7702 合约的 settleWithPermit）
  const settleResult = await permitServer.settle(
    paymentPayload,
    paymentRequirements
  );
  
  // 返回结果
  return c.json({
    message: "Success!",
    transactionHash: settleResult.transaction,
  });
});
```

### 关键变化

1. **`recipientAddress`** → 7702 合约地址（不再是 beneficiary）
2. **`payTo`** → 7702 合约地址（客户端授权目标）
3. **移除 `relayer`** → 不再需要单独的 relayer 配置
4. **Facilitator 逻辑** → 直接调用 7702 合约的 `settleWithPermit` / `settleWithERC3009`

## 与旧版本的对比

| 特性 | Relayer 架构 | 7702 架构 (本示例) |
|------|-------------|-------------------|
| 合约结构 | 需要单独的 Relayer 合约 | 直接使用 7702 合约 |
| Schema `payTo` | Beneficiary 地址 | 7702 合约地址 |
| Schema `extra.relayer` | ✅ 需要配置 | ❌ 不再需要 |
| 客户端授权对象 | Relayer 合约 | 7702 合约 |
| 手续费处理 | Relayer 内部分配 | 7702 合约内部分配 |
| Facilitator 调用 | 调用 Relayer 的 settle 方法 | 调用 7702 的 settle 方法 |
| 代码复杂度 | 较高（需要管理 relayer） | 较低（直接使用 payTo） |

## 7702 架构的优势

### 1. 简化架构

- ❌ **不再需要** 单独部署和维护 Relayer 合约
- ✅ **直接使用** 用户的 7702 授权合约
- ✅ **减少配置** 不需要在 schema 中配置 relayer

### 2. 降低复杂度

```typescript
// 旧架构（Relayer）
const schema = new X402PaymentSchema({
  payTo: BENEFICIARY_ADDRESS,  // 受益人地址
  extra: {
    relayer: RELAYER_CONTRACT,  // 需要配置 relayer
  }
});
// 客户端授权给 relayer 地址

// 7702 架构
const schema = new X402PaymentSchema({
  payTo: RECIPIENT_ADDRESS,     // 7702 合约地址
  // extra 中不需要 relayer
});
// 客户端直接授权给 7702 合约
```

### 3. 更好的用户体验

- 授权对象清晰（直接授权给 7702 合约）
- 资金流向透明（7702 合约自动分配）
- 手续费处理内置（合约内部逻辑）

### 4. 灵活的手续费配置

7702 合约可以：
- 自定义 beneficiary 地址
- 配置 fee recipient 和 fee BPS
- 支持不同的手续费策略

### 5. 易于升级

- 用户可以更新 7702 合约配置
- 不需要修改 facilitator 代码
- Schema 配置保持简洁

## 调试技巧

### 查看 Schema 配置

```typescript
console.log(JSON.stringify(schema.getConfig(), null, 2));
```

### 查看 7702 合约配置

```typescript
// 查看 7702 合约地址
console.log("7702 Contract:", schema.get("payTo"));

// 查看 extra 数据（7702 架构中不再需要 relayer）
const extra = schema.getExtra();
console.log("Extra data:", extra);
```

### 测试支付要求

```bash
curl http://localhost:4025/payment-requirements
```

## 常见问题

### Q: 什么是 EIP-7702 合约？

EIP-7702 是一个提案，允许 EOA（外部拥有账户）临时授权合约代码到其地址。在我们的架构中，用户的 EOA 地址被授权为一个智能合约，该合约可以：
- 接收代币支付
- 自动分配给 beneficiary
- 处理手续费分配

### Q: 如何获取 7702 合约地址？

7702 合约地址是用户通过 EIP-7702 授权流程创建的。通常：
1. 用户签署 EIP-7702 授权交易
2. 用户的 EOA 地址临时变为合约地址
3. 该地址即为 `RECIPIENT_ADDRESS`

### Q: 7702 合约和 Relayer 有什么区别？

| | Relayer | 7702 合约 |
|---|---------|----------|
| 部署 | 需要单独部署 | 用户授权即可 |
| 配置 | 在 extra.relayer | 直接作为 payTo |
| 授权对象 | Relayer 地址 | 7702 地址 |
| 手续费 | Relayer 内部逻辑 | 7702 合约逻辑 |

### Q: 如何修改支付金额？

```typescript
schema.set("maxAmountRequired", "2000"); // 修改为 2000 wei
```

### Q: 如何切换到其他网络？

修改 schema 和 client，并确保 7702 合约在目标网络上可用：

```typescript
const schema = new X402PaymentSchema({
  network: "ethereum", // 切换网络
  payTo: RECIPIENT_ADDRESS, // 确保该地址在目标网络上有效
  // ...
});

const client = createPublicClient({
  chain: mainnet, // 切换 chain
  transport: http(),
});
```

### Q: 如何验证 7702 合约配置？

可以调用 7702 合约的 `getEffectiveConfig` 方法：

```typescript
const config = await client.readContract({
  address: RECIPIENT_ADDRESS,
  abi: EIP7702SellerWalletMinimalAbi,
  functionName: "getEffectiveConfig",
});
console.log("Beneficiary:", config.beneficiary);
console.log("Fee Recipient:", config.feeRecipient);
console.log("Fee BPS:", config.feeBps);
```

## 相关文档

- [X402 协议规范](../../../../specs/x402-specification.md)
- [@wtflabs/x402-schema 文档](../../../../typescript/packages/x402-schema/README.md)
- [@wtflabs/x402-facilitator 文档](../../../../typescript/packages/x402-facilitator/README.md)
- [@wtflabs/x402-server 文档](../../../../typescript/packages/x402-server/README.md)
- [集成示例](../../../../typescript/packages/INTEGRATION_EXAMPLE.md)

## License

Apache-2.0

