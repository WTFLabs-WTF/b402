# Solana x402 客户端示例 (Axios)

这是一个纯 Solana 的 x402 客户端示例，展示如何使用 `x402-axios` 包在 Solana 网络上进行支付请求。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd examples/typescript/clients/axios
pnpm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# Solana 私钥 (base58 格式)
SVM_PRIVATE_KEY=your_solana_private_key_here

# 资源服务器配置
RESOURCE_SERVER_URL=http://localhost:4021
ENDPOINT_PATH=/weather
```

### 3. 运行客户端

```bash
# 方式 1: 使用 tsx 直接运行
npx tsx solana-client.ts

# 方式 2: 使用 bun
bun solana-client.ts
```

## 📋 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `SVM_PRIVATE_KEY` | Solana 钱包私钥（base58 格式）| `5J6T...` |
| `RESOURCE_SERVER_URL` | x402 资源服务器 URL | `http://localhost:4021` |
| `ENDPOINT_PATH` | API 端点路径 | `/weather` |

## 🔑 获取 Solana 私钥

### 使用 Solana CLI

```bash
# 生成新钱包
solana-keygen new --outfile ~/.config/solana/keypair.json

# 查看公钥（地址）
solana-keygen pubkey ~/.config/solana/keypair.json

# 查看私钥 (需要读取 keypair 文件)
# 方法 1: 使用 solana-keygen 恢复助记词
solana-keygen recover prompt:// --outfile /dev/stdout

# 方法 2: 直接读取并转换 keypair 文件
# keypair.json 是一个字节数组，需要转换为 base58
cat ~/.config/solana/keypair.json
# 然后使用在线工具或脚本将字节数组转为 base58 格式

# 方法 3: 使用提供的辅助脚本（最简单，推荐！）
# 先安装 bs58 依赖
npm install bs58
# 或 pnpm install bs58

# 使用默认路径
node extract-solana-key.js

# 或指定自定义路径
node extract-solana-key.js /path/to/your/keypair.json
```

**⚠️ 注意**: 
- `solana-keygen pubkey` 显示的是**公钥/地址**，不是私钥
- 私钥存储在 `keypair.json` 文件中，是一个 64 字节的密钥对
- 需要将其转换为 base58 格式才能用作 `SVM_PRIVATE_KEY`

### 使用 Phantom 钱包

1. 打开 Phantom 钱包
2. 点击设置 → 显示私钥
3. 复制私钥（已经是 base58 格式）

## 🌐 网络选择

代码中默认使用 `solana-devnet`，如需更改为主网：

```typescript
// 开发网 (默认)
const svmSigner = await createSigner("solana-devnet", svmPrivateKey);

// 主网
const svmSigner = await createSigner("solana", svmPrivateKey);
```

## 💰 获取测试代币 (Devnet)

### 获取 SOL

```bash
solana airdrop 1 YOUR_ADDRESS --url devnet
```

或访问: https://faucet.solana.com/

### 获取 USDC (Devnet)

1. 访问 Circle 的测试 USDC 水龙头
2. 或使用 SPL Token Faucet: https://spl-token-faucet.com/

## 📦 功能特性

- ✅ 纯 Solana 实现，无 EVM 依赖
- ✅ 使用 Axios 的熟悉 API
- ✅ 自动处理 x402 支付流程
- ✅ 支持 402 响应自动重试
- ✅ 完整的请求/响应拦截
- ✅ 解码支付响应信息
- ✅ 完整的错误处理
- ✅ 中文提示信息

## 🔍 调试

脚本会输出详细的执行日志：

```
🚀 Solana x402 客户端启动 (Axios)
==================================================
📍 基础 URL: http://localhost:4021
📍 端点路径: /weather

🔑 创建 Solana 签名器...
   地址: 7xK8...

🔧 配置 Axios 实例...

📤 发送请求...

✅ 请求成功!
==================================================
📦 响应数据:
{
  "temperature": 72,
  "conditions": "sunny"
}

💰 支付信息:
{
  "scheme": "exact",
  "network": "solana-devnet",
  ...
}
```

## 🆚 Fetch vs Axios

### Fetch 版本 (solana-client.ts)
- 更轻量
- 使用原生 fetch API
- 适合简单场景

### Axios 版本 (当前)
- 更强大的功能
- 熟悉的 API
- 更好的拦截器支持
- 自动转换 JSON

## 🐛 常见问题

### 1. 私钥格式错误

确保私钥是 base58 格式，不是 hex 格式：
- ✅ 正确: `5J6T...` (base58)
- ❌ 错误: `0x123...` (hex)

### 2. 402 支付失败

可能原因：
- SOL 余额不足（无法支付交易费）
- SPL Token 余额不足
- 网络连接问题
- 签名失败

检查余额：
```bash
solana balance YOUR_ADDRESS --url devnet
```

### 3. 连接超时

检查资源服务器是否运行：

```bash
curl http://localhost:4021/weather
```

## 📚 相关资源

- [x402 协议文档](../../../README.md)
- [Solana 开发文档](https://docs.solana.com/)
- [x402-axios 包文档](../../../typescript/packages/x402-axios/README.md)
- [Axios 文档](https://axios-http.com/)

