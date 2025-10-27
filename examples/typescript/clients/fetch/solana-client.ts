import { config } from "dotenv";
import { decodeXPaymentResponse, wrapFetchWithPayment, createSigner } from "x402-fetch";

config();

const svmPrivateKey =
  "5SemJ6Wn7bnrEj8wrt582VbRbRUNP1egLyNm6r6iE6Da6HHUdatDTpuax42RNoK5jyWpNdaz4YEewsJP9Yd5GA9";
const baseURL = "http://localhost:4021";
const endpointPath = "/weather";
const url = `${baseURL}${endpointPath}`; // e.g. https://example.com/weather

if (!baseURL || !svmPrivateKey || !endpointPath) {
  console.error("缺少必需的环境变量:");
  if (!svmPrivateKey) console.error("  - SVM_PRIVATE_KEY: Solana 私钥");
  if (!baseURL) console.error("  - RESOURCE_SERVER_URL: 资源服务器 URL");
  if (!endpointPath) console.error("  - ENDPOINT_PATH: 端点路径");
  process.exit(1);
}

/**
 * Solana (SVM) x402 客户端示例
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
  console.log("🚀 Solana x402 客户端启动");
  console.log("=".repeat(50));
  console.log(`📍 目标 URL: ${url}`);

  // 创建 Solana 签名器 (默认使用 solana-devnet)
  console.log("\n🔑 创建 Solana 签名器...");
  const svmSigner = await createSigner("solana-devnet", svmPrivateKey);
  console.log(`   地址: ${svmSigner.address}`);

  // 包装 fetch 函数以支持 x402 支付
  const fetchWithPayment = wrapFetchWithPayment(fetch, svmSigner);

  console.log("\n📤 发送请求...");
  try {
    // const response = await fetchWithPayment(url, { method: "GET" });

    // POST 示例
    const response = await fetchWithPayment(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ wallet: "DbhcxRnV1Xjb9PyMHBp1jFahF4WZ56oFMZeZZASqoKqv" }),
    });

    if (!response.ok) {
      throw new Error(`请求失败: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();

    console.log("\n✅ 请求成功!");
    console.log("=".repeat(50));
    console.log("📦 响应数据:");
    console.log(JSON.stringify(body, null, 2));

    // 解码支付响应
    const paymentResponseHeader = response.headers.get("x-payment-response");
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

    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`错误信息: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.message) {
      console.error(`错误: ${error.message}`);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

main().catch(error => {
  console.error("\n💥 未预期的错误:", error?.response?.data?.error ?? error);
  process.exit(1);
});
