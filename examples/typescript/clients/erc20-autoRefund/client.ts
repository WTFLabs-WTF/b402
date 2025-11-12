import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  http,
  publicActions,
  createWalletClient,
  type Hex,
  type Address,
} from "viem";
import { wrapFetchWithPayment } from "x402x-fetch";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "./.env") });

// Environment variables
let clientPrivateKey = process.env.CLIENT_PRIVATE_KEY as Hex | undefined;
if (clientPrivateKey && !clientPrivateKey.startsWith("0x")) {
  clientPrivateKey = `0x${clientPrivateKey}` as Hex;
}

const providerUrl = process.env.PROVIDER_URL;

if (!clientPrivateKey || !providerUrl) {
  console.error("Missing CLIENT_PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}

// Constants
const RESOURCE_SERVER_URL = "http://localhost:4025";

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: bsc,
  transport: http(providerUrl),
}).extend(publicActions);

// Create a fetch function with x402 payment support
const fetchWithPay = wrapFetchWithPayment(
  fetch,
  clientWallet,
  BigInt("1000000000000000000") // Max 1 USD1 (18 decimals)
);

/**
 * Make a request to a resource server endpoint using x402-fetch
 * The payment handling is automatic!
 */
async function makePaymentRequest(endpoint: string, tokenName: string) {
  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🚀 Making request to ${endpoint}...`);
    console.log(`   Token: ${tokenName}`);
    console.log(`   Client: ${clientAccount.address}`);
    console.log(`${'='.repeat(50)}`);

    // Make request - x402-fetch will automatically handle 402 responses
    const response = await fetchWithPay(
      `${RESOURCE_SERVER_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`\n✅ Success!`);
      console.log(`   Response:`, JSON.stringify(data, null, 2));
    } else {
      console.error(`\n❌ Request failed with status ${response.status}`);
      const error = await response.text();
      console.error(`   Error:`, error);
    }
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.cause) {
      console.error(`   Cause:`, error.cause);
    }
  }
}

// Run the example
console.log(`\n═══════════════════════════════════════════`);
console.log(`   BSC Mainnet x402 Hello Example`);
console.log(`═══════════════════════════════════════════`);
console.log(`\n💡 Pay with USD1 to get a personalized greeting!`);
console.log(`   - Token: 0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d (USD1)`);
console.log(`   - Payment Type: EIP-2612 Permit`);
console.log(`   - Network: BSC Mainnet`);
console.log(`   - RPC: https://rpc-bsc.48.club`);
console.log(`   - Endpoint: /hello`);
console.log(`\n   Payment handling is automatic via x402-fetch!`);

(async () => {
  // 测试 Hello 端点
  console.log(`\n\n📍 Requesting Hello with Payment`);
  await makePaymentRequest("/hello", "Hello Endpoint");

  console.log(`\n\n${'='.repeat(50)}`);
  console.log(`✅ Test completed!`);
  console.log(`${'='.repeat(50)}\n`);
})().catch(console.error);

