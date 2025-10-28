import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { baseSepolia } from "viem/chains";
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
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
const RESOURCE_SERVER_URL = "http://localhost:4025"; // Different port for Permit2 example
const TOKEN_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address; // Base Sepolia USDC
const PAYMENT_AMOUNT = "50000"; // 0.05 USDC (50000 wei, assuming 6 decimals)
const FACILITATOR_WALLET_ADDRESS = "0xaec0188efb73769aedd1ffcbb7c5e1fe468e64e3" as Address; // Facilitator's wallet address

// Setup client wallet
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);
const clientWallet = createWalletClient({
  account: clientAccount,
  chain: baseSepolia,
  transport: http(providerUrl),
}).extend(publicActions);

/**
 * Check if Permit2 is approved for the token
 */
async function checkPermit2Approval(): Promise<boolean> {
  try {
    const allowance = await clientWallet.readContract({
      address: TOKEN_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          name: "allowance",
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "allowance",
      args: [clientAccount.address, PERMIT2_ADDRESS],
    });

    const hasApproval = (allowance as bigint) >= BigInt(PAYMENT_AMOUNT);

    if (!hasApproval) {
      console.log(`\n⚠️  Permit2 is not approved for this token.`);
      console.log(`   Token: ${TOKEN_ADDRESS}`);
      console.log(`   Spender: ${PERMIT2_ADDRESS}`);
      console.log(`   Current allowance: ${allowance}`);
      console.log(`   Required amount: ${PAYMENT_AMOUNT}`);
    }

    return hasApproval;
  } catch (error) {
    console.error("Error checking Permit2 approval:", error);
    return false;
  }
}

/**
 * Approve Permit2 to spend tokens
 */
async function approvePermit2(): Promise<boolean> {
  try {
    console.log(`\n🔓 Approving Permit2 to spend tokens...`);
    console.log(`   Token: ${TOKEN_ADDRESS}`);
    console.log(`   Spender: ${PERMIT2_ADDRESS}`);
    console.log(`   Amount: ${PAYMENT_AMOUNT}`);

    const tx = await clientWallet.writeContract({
      address: TOKEN_ADDRESS,
      abi: [
        {
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "approve",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ],
      functionName: "approve",
      args: [PERMIT2_ADDRESS, BigInt(PAYMENT_AMOUNT)],
    });

    console.log(`   Transaction hash: ${tx}`);
    console.log(`   Waiting for confirmation...`);

    const receipt = await clientWallet.waitForTransactionReceipt({ hash: tx });

    if (receipt.status === "success") {
      console.log(`   ✅ Approval successful!`);
      console.log(`   Block: ${receipt.blockNumber}`);
      return true;
    } else {
      console.error(`   ❌ Approval transaction failed`);
      return false;
    }
  } catch (error: any) {
    console.error(`\n❌ Error approving Permit2:`, error.message);
    return false;
  }
}

/**
 * Create an x402 payment header using Permit2 WITH WITNESS
 * 
 * Witness binds the recipient address to the signature, preventing tampering
 */
async function createPermit2WitnessPaymentHeader() {
  console.log(`\n🔐 Creating Permit2 WITNESS payment header...`);
  console.log(`   Client: ${clientAccount.address}`);
  console.log(`   Token: ${TOKEN_ADDRESS}`);
  console.log(`   Amount: ${PAYMENT_AMOUNT}`);
  console.log(`   🎯 Recipient (bound to signature): ${FACILITATOR_WALLET_ADDRESS}`);

  // Generate nonce for Permit2 SignatureTransfer
  const nonce = Date.now();
  console.log(`   Nonce: ${nonce}`);

  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const spender = FACILITATOR_WALLET_ADDRESS;
  console.log(`   Spender (Facilitator): ${spender}`);

  // Sign the Permit2 authorization WITH WITNESS
  const domain = {
    name: "Permit2",
    chainId: baseSepolia.id,
    verifyingContract: PERMIT2_ADDRESS,
  };

  // Witness types - includes the recipient address
  const types = {
    PermitWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: "Witness" },
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    Witness: [
      { name: "to", type: "address" },
    ],
  };

  const message = {
    permitted: {
      token: TOKEN_ADDRESS,
      amount: BigInt(PAYMENT_AMOUNT),
    },
    spender: spender,
    nonce: BigInt(nonce.toString()),
    deadline: BigInt(deadline),
    witness: {
      to: FACILITATOR_WALLET_ADDRESS, // Bind recipient to signature
    },
  };

  console.log(`\n📝 Signing EIP-712 message:`);
  console.log(`   Type: PermitWitnessTransferFrom`);
  console.log(`   Witness.to: ${FACILITATOR_WALLET_ADDRESS}`);
  console.log(`   👉 This binds the recipient address to your signature!`);

  const signature = await clientWallet.signTypedData({
    domain,
    types,
    primaryType: "PermitWitnessTransferFrom",
    message,
  });

  console.log(`   ✅ Permit2 Witness signed!`);
  console.log(`   🔒 Security: The recipient address is now cryptographically bound to the signature`);

  // Create x402 payment payload with witness
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "base-sepolia",
    payload: {
      authorizationType: "permit2",
      signature,
      authorization: {
        owner: clientAccount.address,
        spender,
        token: TOKEN_ADDRESS,
        amount: PAYMENT_AMOUNT,
        deadline: deadline.toString(),
        nonce: nonce.toString(),
        to: FACILITATOR_WALLET_ADDRESS, // Witness field
      },
    },
  };

  console.log(`\n📦 Payment payload structure:`);
  console.log(`   - authorization.to: ${paymentPayload.payload.authorization.to}`);
  console.log(`   - This field ensures the facilitator cannot change the recipient`);

  // Encode as base64
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");
  return paymentHeader;
}

/**
 * Demonstrate witness protection by comparing with and without witness
 */
async function demonstrateWitnessProtection() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  🛡️  WITNESS PROTECTION DEMONSTRATION`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  console.log(`\n📚 What is Witness?`);
  console.log(`   Witness is additional data bound to your Permit2 signature.`);
  console.log(`   In this case, we bind the recipient address (to) to the signature.`);

  console.log(`\n🔒 Security Benefits:`);
  console.log(`   ✅ Prevents the facilitator from changing the recipient`);
  console.log(`   ✅ User sees the exact recipient when signing`);
  console.log(`   ✅ On-chain verification ensures integrity`);
  console.log(`   ✅ Zero additional gas cost`);

  console.log(`\n⚠️  Without Witness (Traditional Permit2):`);
  console.log(`   ❌ User signs: "Allow spender to transfer tokens"`);
  console.log(`   ❌ Facilitator can send tokens to ANY address`);
  console.log(`   ❌ User has no control over the final recipient`);

  console.log(`\n✅ With Witness (Enhanced Permit2):`);
  console.log(`   ✅ User signs: "Allow spender to transfer tokens TO ${FACILITATOR_WALLET_ADDRESS}"`);
  console.log(`   ✅ Facilitator MUST send tokens to this address`);
  console.log(`   ✅ Any attempt to change the recipient will fail`);
  console.log(`   ✅ Full transparency and control`);
}

/**
 * Make a request to a resource server with x402 Permit2 Witness payment
 */
async function makeWitnessPaymentRequest() {
  try {
    // First check if Permit2 is approved
    let isApproved = await checkPermit2Approval();
    if (!isApproved) {
      console.log(`\n🔄 Attempting to approve Permit2 automatically...`);
      const approved = await approvePermit2();
      if (!approved) {
        console.log(`\n❌ Failed to approve Permit2. Please approve manually.`);
        process.exit(1);
      }

      // Verify approval was successful
      isApproved = await checkPermit2Approval();
      if (!isApproved) {
        console.log(`\n❌ Approval verification failed.`);
        process.exit(1);
      }
    }

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

      // Create and attach payment header WITH WITNESS
      const paymentHeader = await createPermit2WitnessPaymentHeader();

      // Retry with payment
      console.log(`\n🔄 Retrying with Witness-protected payment...`);
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

      console.log(`\n🎉 Witness Protection Benefits Demonstrated:`);
      console.log(`   ✅ Payment was verified with witness`);
      console.log(`   ✅ Recipient address was bound to signature`);
      console.log(`   ✅ Facilitator verified the recipient matches`);
      console.log(`   ✅ Settlement executed to the correct address`);

      console.log(`\n💡 Key Features of Permit2 Witness:`);
      console.log(`   🔒 Cryptographic binding of recipient address`);
      console.log(`   👁️  Full transparency - user sees recipient when signing`);
      console.log(`   ⛽ No additional gas cost`);
      console.log(`   🔄 Backward compatible with regular Permit2`);
      console.log(`   🛡️  Protection against man-in-the-middle attacks`);

    } else if (response.status === 402 && response.data?.details === "witness_recipient_mismatch") {
      console.error(`\n❌ Payment verification failed: Witness recipient mismatch`);
      console.log(`\n🛡️  Witness Protection Activated!`);
      console.log(`   The facilitator tried to change the recipient address`);
      console.log(`   Witness verification PREVENTED this attack`);
      console.log(`   Your tokens are safe! 🎉`);

    } else if (response.status === 402 && response.data?.details === "invalid_permit2_witness_signature") {
      console.error(`\n❌ Payment verification failed: Invalid witness signature`);
      console.log(`\n⚠️  The witness signature could not be verified`);
      console.log(`   This might indicate:`);
      console.log(`   - Incorrect witness data structure`);
      console.log(`   - Signature tampering`);
      console.log(`   - Network mismatch`);

    } else if (response.status === 402 && response.data?.details === "permit2_not_approved") {
      console.error(`\n❌ Payment verification failed: Permit2 not approved`);
      console.log(`\n⚠️  Permit2 is not approved for this token.`);
      console.log(`   Please approve Permit2 first.`);

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
console.log(`\n════════════════════════════════════════════════════`);
console.log(`  🛡️  Permit2 WITNESS Protection x402 Example`);
console.log(`════════════════════════════════════════════════════`);

console.log(`\n📝 About Permit2 Witness:`);
console.log(`   Permit2 is deployed at: ${PERMIT2_ADDRESS}`);
console.log(`   Witness adds cryptographic binding of recipient address`);
console.log(`   Enhanced security with zero additional gas cost`);

console.log(`\n🔐 Security Features:`);
console.log(`   🛡️  Recipient address bound to signature`);
console.log(`   👁️  Full transparency when signing`);
console.log(`   🚫 Prevents facilitator from changing recipient`);
console.log(`   ✅ Backward compatible with regular Permit2`);

console.log(`\n✨ This Example Demonstrates:`);
console.log(`   1. Creating a Permit2 signature WITH witness`);
console.log(`   2. Binding recipient address to the signature`);
console.log(`   3. Facilitator verification of witness data`);
console.log(`   4. Protection against recipient address tampering\n`);

// First demonstrate the concept
demonstrateWitnessProtection()
  .then(() => makeWitnessPaymentRequest())
  .catch(console.error);

