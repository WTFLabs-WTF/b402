import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  http,
  publicActions,
  createWalletClient,
  type Hex,
  type Address,
} from "viem";
import { wrapFetchWithPayment } from "@wtflabs/x402-fetch";

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
const RESOURCE_SERVER_URL = "http://localhost:4025"; // Different port for this example

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: bscTestnet,
  transport: http(providerUrl),
}).extend(publicActions);

// Create a fetch function with x402 payment support
const fetchWithPay = wrapFetchWithPayment(
  fetch,
  clientWallet,
  BigInt(50000) // Max 0.05 USDC (50000 wei)
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
console.log(`   ERC20 x402 Example (Multi-Token)`);
console.log(`═══════════════════════════════════════════`);
console.log(`\n💡 Testing two different tokens with different payment types:`);
console.log(`   1. /permit  - Permit Token (0x25d0...a991) using EIP-2612`);
console.log(`   2. /3009    - EIP-3009 Token (0xcea4...28f4) using EIP-3009`);
console.log(`\n   Payment handling is automatic via x402-fetch!`);

(async () => {
  // 测试 Permit Token 端点
  console.log(`\n\n📍 Test 1: Permit Token Endpoint`);
  await makePaymentRequest("/permit", "Permit Token (EIP-2612)");

  // 等待一小段时间
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 测试 EIP-3009 Token 端点
  console.log(`\n\n📍 Test 2: EIP-3009 Token Endpoint`);
  await makePaymentRequest("/3009", "EIP-3009 Token");

  console.log(`\n\n${'='.repeat(50)}`);
  console.log(`✅ All tests completed!`);
  console.log(`${'='.repeat(50)}\n`);
})().catch(console.error);

