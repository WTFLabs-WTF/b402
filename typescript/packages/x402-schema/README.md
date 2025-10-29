# @wtflabs/x402-schema

X402 支付协议的 Schema 校验和配置管理包。

## 安装

```bash
npm install @wtflabs/x402-schema
# 或
pnpm add @wtflabs/x402-schema
```

## 使用

```typescript
import { X402PaymentSchema } from "@wtflabs/x402-schema";

// 创建 schema 实例
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: "100000",
  resource: "http://localhost:3000/protected-resource",
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: "0x1234...",
  maxTimeoutSeconds: 3600,
  asset: "0x5678...",
  paymentType: "permit",
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

// 验证 schema
schema.verify();

// 设置配置项
schema.set("maxAmountRequired", "200000");

// 获取配置项
const amount = schema.get("maxAmountRequired");

// 设置 extra 数据
schema.setExtra({
  relayer: "0xabcd...",
});

// 获取完整配置
const config = schema.getConfig();
```

## API

### `X402PaymentSchema`

#### 构造函数

```typescript
new X402PaymentSchema(config: X402PaymentSchemaConfig)
```

#### 方法

- `verify()`: 验证 schema 配置
- `set(key, value)`: 设置配置项
- `get(key)`: 获取配置项
- `getConfig()`: 获取完整配置
- `setExtra(extra)`: 设置 extra 数据
- `getExtra()`: 获取 extra 数据
- `toJSON()`: 转换为 JSON 对象

## License

Apache-2.0

