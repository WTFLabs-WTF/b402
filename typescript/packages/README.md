# X402 TypeScript 包

这个目录包含了 X402 支付协议的 TypeScript 实现包。

## 包列表

### 核心包

#### [@wtflabs/x402](./x402/)
完整的 X402 支付协议实现，包括客户端、验证、facilitator 等功能。

#### [@wtflabs/x402-fetch](./x402-fetch/)
基于 Fetch API 的 X402 客户端封装。

### 新增包（按照 todo.md 要求构建）

#### [@wtflabs/x402-schema](./x402-schema/)
X402 支付协议的 Schema 校验和配置管理包。

**特性：**
- 使用 Zod 进行严格的类型校验
- 提供 `X402PaymentSchema` 类用于管理支付配置
- 支持动态设置和验证配置项
- 支持添加额外的元数据

**安装：**
```bash
pnpm add @wtflabs/x402-schema
```

**快速开始：**
```typescript
import { X402PaymentSchema } from "@wtflabs/x402-schema";

const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: "100000",
  resource: "http://localhost:3000/protected-resource",
  description: "Access to protected resource",
  mimeType: "application/json",
  payTo: "0x1234...",
  maxTimeoutSeconds: 3600,
  asset: "0x5678...",
});

schema.verify();
```

#### [@wtflabs/x402-facilitator](./x402-facilitator/)
X402 支付协议的 Facilitator，用于处理支付验证和结算。

**特性：**
- 支持支付验证 (`verify`)
- 支持支付结算 (`settle`)
- 可配置等待策略：simulated、submitted、confirmed
- 支持自定义 Facilitator URL 和 API 密钥
- 查询支持的支付类型

**安装：**
```bash
pnpm add @wtflabs/x402-facilitator
```

**快速开始：**
```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";

const facilitator = new Facilitator({
  recipientAddress: "0x1234...",
  waitUntil: "confirmed",
});

const verifyResult = await facilitator.verify(payload, requirements);
const settleResult = await facilitator.settle(payload, requirements);
```

#### [@wtflabs/x402-server](./x402-server/)
X402 支付协议的服务端集成包，整合 facilitator、schema 和 viem client。

**特性：**
- 集成 Facilitator、Schema 和 Viem Client
- 自动初始化和配置验证
- 验证 network 和地址匹配
- 提供统一的支付处理接口
- 支持支付验证和结算

**安装：**
```bash
pnpm add @wtflabs/x402-server @wtflabs/x402-facilitator @wtflabs/x402-schema viem
```

**快速开始：**
```typescript
import { X402Server } from "@wtflabs/x402-server";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

const facilitator = new Facilitator({
  recipientAddress: "0x1234...",
  // relayer: "0x5678...", // 可选
});

const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: "100000",
  resource: "http://localhost:3000/protected-resource",
  description: "Access to protected resource",
  mimeType: "application/json",
  payTo: "0x1234...",
  maxTimeoutSeconds: 3600,
  asset: "0x5678...",
});

const client = createPublicClient({
  chain: bscTestnet,
  transport: http(),
});

const server = new X402Server({
  facilitator,
  schema,
  client,
});

await server.initialize();
await server.verify();
```

## 包之间的关系

```
@wtflabs/x402 (核心包)
    ↓
@wtflabs/x402-schema (Schema 校验)
    ↓
@wtflabs/x402-facilitator (支付处理)
    ↓
@wtflabs/x402-server (服务端集成)
```

## 完整示例

查看 [INTEGRATION_EXAMPLE.md](./INTEGRATION_EXAMPLE.md) 了解如何集成使用这些包。

## 开发

### 安装依赖

```bash
pnpm install
```

### 构建所有包

```bash
pnpm -r build
```

### 运行测试

```bash
pnpm -r test
```

### Lint 检查

```bash
pnpm -r lint:check
```

### 格式化代码

```bash
pnpm -r format
```

## 工作空间

这个项目使用 pnpm workspace 管理多个包。所有包共享依赖，减少重复安装。

配置文件：[pnpm-workspace.yaml](../pnpm-workspace.yaml)

## 发布

每个包独立发布到 npm：

```bash
# 发布 schema
cd packages/x402-schema
pnpm publish

# 发布 facilitator
cd packages/x402-facilitator
pnpm publish

# 发布 server
cd packages/x402-server
pnpm publish
```

## 许可证

Apache-2.0

## 贡献

欢迎提交 issue 和 pull request！

查看 [CONTRIBUTING.md](../../CONTRIBUTING.md) 了解贡献指南。

