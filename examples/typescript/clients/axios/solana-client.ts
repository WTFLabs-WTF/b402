import axios from "axios";
import { config } from "dotenv";
import {
  withPaymentInterceptor,
  decodeXPaymentResponse,
  createSigner,
} from "@wtflabs/x402-axios";

config();

const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL as string; // e.g. https://example.com
const endpointPath = process.env.ENDPOINT_PATH as string; // e.g. /weather

if (!baseURL || !svmPrivateKey || !endpointPath) {
  console.error("缺少必需的环境变量:");
  if (!svmPrivateKey) console.error("  - SVM_PRIVATE_KEY: Solana 私钥");
  if (!baseURL) console.error("  - RESOURCE_SERVER_URL: 资源服务器 URL");
  if (!endpointPath) console.error("  - ENDPOINT_PATH: 端点路径");
  process.exit(1);
}

/**
 * Solana (SVM) x402 客户端示例 - 使用 Axios
 * 
 * 环境变量:
 * - SVM_PRIVATE_KEY: Solana 私钥 (base58 格式)
 * - RESOURCE_SERVER_URL: 资源服务器 URL
 * - ENDPOINT_PATH: 端点路径
 * 
 * 支持的网络:
 * - solana (主网)
 * - solana-devnet (开发网)
 */
async function main(): Promise<void> {
  console.log("🚀 Solana x402 客户端启动 (Axios)");
  console.log("=".repeat(50));
  console.log(`📍 基础 URL: ${baseURL}`);
  console.log(`📍 端点路径: ${endpointPath}`);

  // 创建 Solana 签名器 (默认使用 solana-devnet)
  console.log("\n🔑 创建 Solana 签名器...");
  const svmSigner = await createSigner("solana-devnet", svmPrivateKey);
  console.log(`   地址: ${svmSigner.address}`);

  // 创建带有支付拦截器的 axios 实例
  console.log("\n🔧 配置 Axios 实例...");
  const api = withPaymentInterceptor(
    axios.create({
      baseURL,
    }),
    svmSigner,
  );

  console.log("\n📤 发送请求...");
  try {
    const response = await api.get(endpointPath);

    console.log("\n✅ 请求成功!");
    console.log("=".repeat(50));
    console.log("📦 响应数据:");
    console.log(JSON.stringify(response.data, null, 2));

    // 解码支付响应
    const paymentResponseHeader = response.headers["x-payment-response"];
    if (paymentResponseHeader) {
      const paymentResponse = decodeXPaymentResponse(paymentResponseHeader);
      console.log("\n💰 支付信息:");
      console.log(JSON.stringify(paymentResponse, null, 2));
    } else {
      console.log("\n💰 无需支付或未返回支付响应");
    }

  } catch (error: any) {
    console.error("\n❌ 请求失败!");
    console.error("=".repeat(50));

    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error(`状态码: ${error.response.status}`);
        console.error(`错误信息: ${JSON.stringify(error.response.data, null, 2)}`);

        if (error.response.status === 402) {
          console.error("\n⚠️  支付失败！可能的原因:");
          console.error("    1. Solana 钱包余额不足");
          console.error("    2. SPL Token 余额不足");
          console.error("    3. 网络错误或签名失败");
        }
      } else {
        console.error(`错误: ${error.message}`);
      }
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

main().catch(error => {
  console.error("\n💥 未预期的错误:", error);
  process.exit(1);
});

