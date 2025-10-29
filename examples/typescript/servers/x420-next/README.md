# X402 Next.js Demo

这是一个使用 X402 支付协议的 Next.js 完整示例，展示了如何构建一个需要支付才能访问的受保护资源。

## 功能特性

- ✅ 使用 `@wtflabs/x402-server` 保护 API 路由
- ✅ 使用 `@wtflabs/x402-schema` 定义支付要求
- ✅ 使用 `@wtflabs/x402-facilitator` 处理支付验证和结算
- ✅ 前端页面演示如何创建和发送 X402 支付
- ✅ 支持 ERC-20 Permit (EIP-2612) 无需预先授权
- ✅ 现代化的 UI 界面（使用 Tailwind CSS）

## 架构

```
┌─────────────┐         ┌──────────────┐         ┌────────────────┐
│   浏览器     │  HTTP   │  Next.js API │   RPC   │  BSC Testnet   │
│   (客户端)   │ ◄─────► │  (服务器)    │ ◄─────► │  (区块链)      │
└─────────────┘         └──────────────┘         └────────────────┘
      │                        │
      │                        │
      └────────────────────────┴─────────────────────┐
                                                      │
                                          ┌───────────▼────────────┐
                                          │  Facilitator Service   │
                                          │  (支付验证和结算)       │
                                          └────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd /Users/glacierluo/work/wtf/wtflabs/b402/examples/typescript/servers/x420-next
pnpm install
```

### 2. 配置环境变量

复制 `.env.example` 到 `.env.local` 并填写配置：

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```env
RECIPIENT_ADDRESS=0xYourRecipientAddressHere
PROVIDER_URL=https://bsc-testnet-rpc.publicnode.com
NEXT_PUBLIC_RECIPIENT_ADDRESS=0xYourRecipientAddressHere
```

### 3. 启动开发服务器

```bash
pnpm run dev
```

服务器将在 http://localhost:4030 启动。

### 4. 测试流程

1. 打开浏览器访问 http://localhost:4030
2. 输入你的私钥（确保该账户在 BSC Testnet 上有足够的 USDC）
3. 点击"支付并获取资源"按钮
4. 系统会自动：
   - 获取支付要求
   - 创建 Permit 签名
   - 发送支付载荷
   - 验证和结算支付
   - 返回受保护的资源

## 项目结构

```
x420-next/
├── app/
│   ├── api/
│   │   └── protected/
│   │       └── route.ts       # 受保护的 API 路由
│   ├── globals.css            # 全局样式
│   ├── layout.tsx             # 根布局
│   └── page.tsx               # 主页（客户端）
├── .env.example               # 环境变量示例
├── next.config.ts             # Next.js 配置
├── package.json               # 依赖配置
├── postcss.config.mjs         # PostCSS 配置
├── tailwind.config.ts         # Tailwind 配置
├── tsconfig.json              # TypeScript 配置
└── README.md                  # 本文件
```

## 核心代码说明

### API 路由 (`app/api/protected/route.ts`)

```typescript
import { X402Server } from "@wtflabs/x402-server";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { Facilitator } from "@wtflabs/x402-facilitator";

// 创建支付模式
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  token: USDC_ADDRESS,
  amount: PAYMENT_AMOUNT.toString(),
});

// 创建 Facilitator
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  relayer: "0xe4bb3CB99F7C9c876544d7b0DB481036Baf4aBcD",
});

// 创建 X402 服务器
const x402Server = new X402Server({
  facilitator,
  schema,
  viemClient: client,
});

// GET: 返回支付要求
export async function GET() {
  return new NextResponse(..., {
    status: 402,
    headers: { "X-402": JSON.stringify(paymentSchema) },
  });
}

// POST: 验证支付并返回资源
export async function POST(request: NextRequest) {
  const paymentPayload = JSON.parse(
    request.headers.get("X-402-Payment")
  );
  
  const verifyResult = await x402Server.verifyPayment(paymentPayload);
  const settleResult = await x402Server.settlePayment(paymentPayload);
  
  return NextResponse.json({ success: true, data: ... });
}
```

### 客户端页面 (`app/page.tsx`)

```typescript
// 1. 获取支付要求
const requirementsResponse = await fetch("/api/protected");
const x402Header = requirementsResponse.headers.get("X-402");

// 2. 创建 Permit 签名
const signature = await walletClient.signTypedData({
  domain,
  types,
  primaryType: "Permit",
  message,
});

// 3. 构造支付载荷
const paymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "bsc-testnet",
  payload: {
    authorizationType: "permit",
    signature,
    authorization: { ... },
  },
};

// 4. 发送支付并获取资源
const resourceResponse = await fetch("/api/protected", {
  method: "POST",
  headers: {
    "X-402-Payment": JSON.stringify(paymentPayload),
  },
});
```

## 配置说明

### 网络配置

- **网络**: BSC Testnet
- **Chain ID**: 97
- **RPC URL**: https://bsc-testnet-rpc.publicnode.com

### 代币配置

- **代币**: USDC
- **地址**: 0x03db069489e2caa4e51ed149e83d732ef3931670
- **小数位**: 6
- **支付金额**: 0.05 USDC

### Facilitator 配置

- **中继器地址**: 0xe4bb3CB99F7C9c876544d7b0DB481036Baf4aBcD
- **等待确认**: confirmed
- **基础 URL**: https://facilitator.wtf.com/v1

## 开发

### 构建生产版本

```bash
pnpm run build
```

### 启动生产服务器

```bash
pnpm run start
```

### 代码检查

```bash
pnpm run lint
```

## 故障排除

### 1. "Payment verification failed"

- 确保私钥对应的账户有足够的 USDC
- 检查代币地址是否正确
- 验证网络配置是否匹配

### 2. "invalid_permit_signature"

- 确保 `chainId` 与网络匹配（BSC Testnet = 97）
- 检查代币的小数位数（USDC = 6）
- 验证 Permit 参数（nonce, deadline, spender）

### 3. 模块未找到错误

```bash
# 重新安装依赖
pnpm install

# 清除 Next.js 缓存
rm -rf .next
pnpm run dev
```

## 相关资源

- [X402 协议规范](../../../../specs/x402-specification.md)
- [Exact Scheme 规范](../../../../specs/schemes/exact/scheme_exact.md)
- [EIP-2612: Permit Extension](https://eips.ethereum.org/EIPS/eip-2612)
- [Next.js 文档](https://nextjs.org/docs)

## 许可证

与主项目相同

