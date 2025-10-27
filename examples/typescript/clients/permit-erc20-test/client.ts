import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseSepolia, bscTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createWalletClient, Hex, Address, parseEther } from "viem";
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
const USDC_ADDRESS = "0x03dB069489e2cAA4e51ED149E83D732EF3931670" as Address; // USDC
const PAYMENT_AMOUNT = parseEther("0.05").toString(); // 0.05 USDC (50000 wei, assuming 6 decimals
const FACILITATOR_WALLET_ADDRESS = "0xe4bb3CB99F7C9c876544d7b0DB481036Baf4aBcD" as Address;

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: bscTestnet,
  transport: http(providerUrl),
}).extend(publicActions);
console.log('address: ', clientAccount.address);
/**
 * Create an x402 payment header using EIP-2612 Permit
 */
async function createPermitPaymentHeader() {
  console.log(`\n🔐 Creating Permit payment header...`);
  console.log(`   Client: ${clientAccount.address}`);
  console.log(`   Token: ${USDC_ADDRESS}`);
  console.log(`   Amount: ${PAYMENT_AMOUNT}`);

  // Get current nonce from token contract
  const nonce = await clientWallet.readContract({
    address: USDC_ADDRESS,
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
    address: USDC_ADDRESS,
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

  // Get token version for EIP-712 domain
  // Try eip712Domain() first (EIP-5267, OpenZeppelin v5+), then fallback to version() (v4)
  let tokenVersion = "1";
  try {
    // Try EIP-5267 eip712Domain() first
    const domainResult = await clientWallet.readContract({
      address: USDC_ADDRESS,
      abi: [
        {
          inputs: [],
          name: "eip712Domain",
          outputs: [
            { name: "fields", type: "bytes1" },
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
            { name: "salt", type: "bytes32" },
            { name: "extensions", type: "uint256[]" },
          ],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "eip712Domain",
    });
    tokenVersion = domainResult[2]; // version is the 3rd element
  } catch {
    // Fallback to version() function
    try {
      tokenVersion = await clientWallet.readContract({
        address: USDC_ADDRESS,
        abi: [
          {
            inputs: [],
            name: "version",
            outputs: [{ name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "version",
      });
    } catch {
      console.log(`   ⚠️  Neither eip712Domain() nor version() available, using default: ${tokenVersion}`);
    }
  }

  console.log(`   Token: ${tokenName} v${tokenVersion}`);

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  // IMPORTANT: spender must be the facilitator's wallet address, not URL
  // This should match the address derived from EVM_PRIVATE_KEY in facilitator
  const spender = FACILITATOR_WALLET_ADDRESS;

  // Sign the permit
  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: bscTestnet.id,
    verifyingContract: USDC_ADDRESS,
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
    network: "bsc-testnet",
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

