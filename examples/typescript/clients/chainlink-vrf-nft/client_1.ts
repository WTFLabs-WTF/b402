import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex } from "viem";
import axios from "axios";
import { withPaymentInterceptor } from "@wtflabs/x402-axios";

// --- Load .env ---
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const envPath = path.resolve(__dirname_env, "./.env");
dotenv.config({ path: envPath });
// ---------------------------

// --- Environment Variable Checks ---
let clientPrivateKey = process.env.CLIENT_PRIVATE_KEY as Hex | undefined;
// if not prefixed, add 0x as prefix
if (clientPrivateKey && !clientPrivateKey.startsWith("0x")) {
  clientPrivateKey = "0x" + clientPrivateKey;
}

const providerUrl = process.env.PROVIDER_URL;

if (!clientPrivateKey || !providerUrl) {
  console.error("Missing PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}
// ----------------------------------------

// --- Viem Client Setup ---
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: base,
  transport: http(providerUrl),
}).extend(publicActions);

// --- Axios Setup with x402 Interceptor ---
const proxyUrl = `https://www.x402pepe.xyz/api/mint`;
const targetUrl = `https://www.x402pepe.xyz/api/mint`;

let axiosInstance = axios.create();

// Apply the x402 interceptor to handle payments
axiosInstance = withPaymentInterceptor(axiosInstance, clientWallet);

// --- Helper function to sleep ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Main Execution ---
async function makeMintRequest(requestNumber: number) {
  console.log(
    `\n[请求 #${requestNumber}] 正在请求 NFT mint from ${proxyUrl} using wallet ${clientAccount.address}`,
  );

  try {
    // Make the GET request with x-proxy-target header. The x402 interceptor handles the 402 payment flow.
    const response = await axiosInstance.get(proxyUrl, {
      headers: {
        'x-proxy-target': targetUrl,
      }
    });

    console.log(`[请求 #${requestNumber}] ✅ 成功！响应:`);
    console.log(" Status:", response.status);
    console.log(" Data:", JSON.stringify(response.data, null, 2));
  } catch (error: any) {
    console.error(`[请求 #${requestNumber}] ❌ 失败！`);
    if (axios.isAxiosError(error)) {
      console.error(` Error: ${error.message}`);
      if (error.response) {
        console.error(` Status: ${error.response.status}`);
        console.error(` Data: ${JSON.stringify(error.response.data, null, 2)}`);
        if (error.response.status === 402) {
          console.error(" ⚠️  支付失败！可能的原因:");
          console.error("    1. 钱包余额不足（需要 1 USDC = 1000000 最小单位）");
          console.error("    2. USDC 未授权给支付合约");
          console.error("    3. 网络错误或签名失败");
        }
      } else {
        console.error(" (No response received from server)");
      }
    } else {
      console.error(" 💥 非 Axios 错误:", error);
      console.error(" Stack:", error.stack);
    }
    // 不退出，继续下一次请求
  }
}

// 循环发送请求
async function startRequestLoop() {
  console.log("🚀 开始疯狂发送请求，每次间隔 1 秒...");
  console.log("按 Ctrl+C 停止");

  let requestNumber = 1;

  while (true) {
    await makeMintRequest(requestNumber);
    requestNumber++;

    // 等待 1 秒
    await sleep(500);
  }
}

startRequestLoop();
