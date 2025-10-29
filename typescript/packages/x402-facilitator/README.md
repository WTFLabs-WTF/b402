# @wtflabs/x402-facilitator

X402 支付协议的 Facilitator，用于处理支付验证和结算。

## 安装

```bash
npm install @wtflabs/x402-facilitator
# 或
pnpm add @wtflabs/x402-facilitator
```

## 使用

```typescript
import { Facilitator } from "@wtflabs/x402-facilitator";

// 创建 Facilitator 实例
const facilitator = new Facilitator({
  recipientAddress: "0x1234...", // 商家地址 (EIP 7702)
  relayer: "0x5678...", // 可选，内置 WTF Facilitator
  waitUntil: "confirmed", // 可选: "simulated" | "submitted" | "confirmed"
});

// 验证支付
const verifyResult = await facilitator.verify(
  paymentPayload,
  paymentRequirements
);

if (verifyResult.success) {
  console.log("支付验证成功！支付者:", verifyResult.payer);
}

// 结算支付
const settleResult = await facilitator.settle(
  paymentPayload,
  paymentRequirements
);

if (settleResult.success) {
  console.log("支付结算成功！交易哈希:", settleResult.transactionHash);
}

// 获取支持的支付类型
const supported = await facilitator.supported();
console.log("支持的支付类型:", supported.kinds);

// 带过滤条件查询
const filteredSupported = await facilitator.supported({
  chainId: 97,
  tokenAddress: "0xabc...",
});
```

## API

### `Facilitator`

#### 构造函数

```typescript
new Facilitator(config: FacilitatorConfig)
```

**配置选项 (`FacilitatorConfig`):**

- `recipientAddress` (必需): 商家地址，支持 EIP 7702
- `relayer` (可选): 中继地址，默认使用内置 WTF Facilitator
- `waitUntil` (可选): 等待策略
  - `"simulated"`: 仅模拟交易 (最快)
  - `"submitted"`: 等待交易提交
  - `"confirmed"`: 等待链上确认 (最安全，默认)
- `baseUrl` (可选): Facilitator API 基础 URL
- `apiKey` (可选): API 密钥

#### 属性

- `relayer`: 获取 relayer 地址
- `recipientAddress`: 获取 recipient 地址
- `waitUntil`: 获取等待策略

#### 方法

##### `verify(payload, requirements)`

验证支付。

- **参数:**
  - `payload`: 支付负载
  - `requirements`: 支付要求
- **返回:** `Promise<VerifyResponse>`

##### `settle(payload, requirements, waitUntil?)`

结算支付。

- **参数:**
  - `payload`: 支付负载
  - `requirements`: 支付要求
  - `waitUntil` (可选): 等待策略，覆盖配置中的默认值
- **返回:** `Promise<SettleResponse>`

##### `supported(filters?)`

获取支持的支付类型。

- **参数:**
  - `filters` (可选): 过滤条件
    - `chainId`: 链 ID
    - `tokenAddress`: 代币地址
- **返回:** `Promise<SupportedResponse>`

##### `getConfig()`

获取完整配置。

- **返回:** `Required<FacilitatorConfig>`

## License

Apache-2.0

