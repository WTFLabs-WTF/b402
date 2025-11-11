import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex, parseUnits } from "viem";
import { wrapFetchWithPayment } from "@wtflabs/x402-fetch";

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


// Apply the x402 interceptor to handle payments
const fetchWithPayment = wrapFetchWithPayment(fetch, clientWallet as any, parseUnits("1", 6));

// --- Helper function to sleep ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Main Execution ---
async function makeMintRequest(requestNumber: number) {
  console.log(
    `\n[请求 #${requestNumber}] 正在请求 NFT mint from ${proxyUrl} using wallet ${clientAccount.address}`,
  );

  try {
    // Make the GET request with x-proxy-target header. The x402 interceptor handles the 402 payment flow.
    const response = await fetchWithPayment(proxyUrl);
    const result = await response.json();

    console.log(`[请求 #${requestNumber}] ✅ 成功！响应:`);
    console.log(" Status:", response.status);
    console.log(" Data:", JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error(`[请求 #${requestNumber}] ❌ 失败！: ${error.message}`);
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
