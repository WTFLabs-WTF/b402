import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex, Address } from "viem";
import axios from "axios";

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
const RESOURCE_SERVER_URL = "http://localhost:4024"; // Different port for Permit example
const DAI_ADDRESS = "0x1111111111166b7fe7bd91427724b487980afc69" as Address; // Base DAI (example)
const PAYMENT_AMOUNT = "1000000000000000000"; // 1 DAI (18 decimals)
const FACILITATOR_WALLET_ADDRESS = "0xaec0188efb73769aedd1ffcbb7c5e1fe468e64e3" as Address;

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: base,
  transport: http(providerUrl),
}).extend(publicActions);

/**
 * Create an x402 payment header using EIP-2612 Permit
 */
async function createPermitPaymentHeader() {
  console.log(`\n🔐 Creating Permit payment header...`);
  console.log(`   Client: ${clientAccount.address}`);
  console.log(`   Token: ${DAI_ADDRESS}`);
  console.log(`   Amount: ${PAYMENT_AMOUNT}`);

  // Get current nonce from token contract
  const nonce = await clientWallet.readContract({
    address: DAI_ADDRESS,
    abi: [
      {
        inputs: [{ name: "owner", type: "address" }],
        name: "nonces",
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "nonces",
    args: [clientAccount.address],
  });

  console.log(`   Current nonce: ${nonce}`);

  // Get token name for EIP-712 domain
  const tokenName = await clientWallet.readContract({
    address: DAI_ADDRESS,
    abi: [
      {
        inputs: [],
        name: "name",
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "name",
  });

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  // IMPORTANT: spender must be the facilitator's wallet address, not URL
  // This should match the address derived from EVM_PRIVATE_KEY in facilitator
  const spender = FACILITATOR_WALLET_ADDRESS;

  // Sign the permit
  const domain = {
    name: tokenName,
    version: "1",
    chainId: base.id,
    verifyingContract: DAI_ADDRESS,
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const message = {
    owner: clientAccount.address,
    spender: spender,
    value: BigInt(PAYMENT_AMOUNT),
    nonce: nonce as bigint,
    deadline: BigInt(deadline),
  };

  const signature = await clientWallet.signTypedData({
    domain,
    types,
    primaryType: "Permit",
    message,
  });

  console.log(`   ✅ Permit signed!`);

  // Create x402 payment payload
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: {
      authorizationType: "permit",
      signature,
      authorization: {
        owner: clientAccount.address,
        spender,
        value: PAYMENT_AMOUNT,
        deadline: deadline.toString(),
        nonce: nonce.toString(),
      },
    },
  };

  // Encode as base64
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
  return paymentHeader;
}

/**
 * Make a request to a resource server with x402 Permit payment
 */
async function makePaymentRequest() {
  try {
    console.log(`\n🚀 Making request to resource server...`);

    // First request - should get 402 Payment Required
    let response = await axios.post(
      `${RESOURCE_SERVER_URL}/protected-resource`,
      {},
      { validateStatus: () => true }
    );

    if (response.status === 402) {
      console.log(`\n💰 402 Payment Required`);
      console.log(`   Payment details:`, response.data.accepts[0]);

      // Create and attach payment header
      const paymentHeader = await createPermitPaymentHeader();

      // Retry with payment
      console.log(`\n🔄 Retrying with payment...`);
      response = await axios.post(
        `${RESOURCE_SERVER_URL}/protected-resource`,
        {},
        {
          headers: {
            "X-PAYMENT": paymentHeader,
          },
        }
      );
    }

    if (response.status === 200) {
      console.log(`\n✅ Success!`);
      console.log(`   Response:`, response.data);
    } else {
      console.error(`\n❌ Request failed with status ${response.status}`);
      console.error(`   Error:`, response.data);
    }
  } catch (error: any) {
    console.error(`\n❌ Error:`, error.message);
    if (error.response) {
      console.error(`   Status:`, error.response.status);
      console.error(`   Data:`, error.response.data);
    }
  }
}

// Run the example
console.log(`\n═══════════════════════════════════════════`);
console.log(`   EIP-2612 Permit x402 Example`);
console.log(`═══════════════════════════════════════════`);

makePaymentRequest().catch(console.error);

