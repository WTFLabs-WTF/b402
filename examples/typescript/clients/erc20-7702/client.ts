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
console.log(`   ERC20 x402 Example (7702)`);
console.log(`═══════════════════════════════════════════`);
console.log(`\n💡 Testing EIP-7702 contract with Permit payment:`);
console.log(`   /permit  - Permit Token using EIP-2612 → 7702`);
console.log(`\n   Payment automatically settles to 7702 contract!`);
console.log(`   Fees are handled by the 7702 contract logic.`);

(async () => {
  // 测试 Permit Token 端点
  console.log(`\n\n📍 Testing Permit Token Endpoint`);
  await makePaymentRequest("/permit", "Permit Token (EIP-2612)");

  console.log(`\n\n${'='.repeat(50)}`);
  console.log(`✅ Test completed!`);
  console.log(`${'='.repeat(50)}\n`);
})().catch(console.error);

