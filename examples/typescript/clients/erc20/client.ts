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
  BigInt(50000) // Max 0.1 USDC
);

/**
 * Make a request to a resource server using x402-fetch
 * The payment handling is automatic!
 */
async function makePaymentRequest() {
  try {
    console.log(`\n🚀 Making request to resource server...`);
    console.log(`   Client: ${clientAccount.address}`);

    // Make request - x402-fetch will automatically handle 402 responses
    const response = await fetchWithPay(
      `${RESOURCE_SERVER_URL}/protected-resource`,
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
      console.log(`   Response:`, data);
    } else {
      console.error(`\n❌ Request failed with status ${response.status}`);
      const error = await response.text();
      console.error(`   Error:`, error);
    }
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
  }
}

// Run the example
console.log(`\n═══════════════════════════════════════════`);
console.log(`   ERC20 x402 Example (x402-fetch)`);
console.log(`═══════════════════════════════════════════`);
console.log(`\n💡 Payment type will be automatically detected from server response`);
console.log(`   - EIP-3009 (default)`);
console.log(`   - EIP-2612 Permit (if server specifies)`);
console.log(`   - Permit2 (if server specifies)`);

(async () => {
  await makePaymentRequest();
})().catch(console.error);

