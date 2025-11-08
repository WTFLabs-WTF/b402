import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { type Hex, createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { X402Server } from "@wtflabs/x402-server";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

// Constants
const PORT = 4025;
// 代币地址
const PERMIT_TOKEN_ADDRESS = "0x25d066c4C68C8A6332DfDB4230263608305Ca991" as Hex; // permit token
const EIP3009_TOKEN_ADDRESS = "0xcea4eaef42afd4d6e12660b59018e90fa3ab28f4" as Hex; // 3009 token
const PAYMENT_AMOUNT = "1000"; // 1 USDC (1000000000000000000 wei, assuming 18 decimals)
const PROVIDER_URL = process.env.PROVIDER_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const RECIPIENT_ADDRESS =
  (process.env.RECIPIENT_ADDRESS as Hex) ||
  ("0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3" as Hex);

// ====== 使用新包创建组件 ======

// 1. 创建 Facilitator
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  // relayer: "0x...", // 可选，默认使用 recipientAddress
  waitUntil: "confirmed", // simulated | submitted | confirmed
  baseUrl: "https://facilitator.wtf.com", // 可选
  // apiKey: "your-api-key", // 可选
});

console.log(`\n✅ Facilitator 已创建`);
console.log(`   - Recipient: ${facilitator.recipientAddress}`);
console.log(`   - Relayer: ${facilitator.relayer}`);
console.log(`   - Wait Until: ${facilitator.waitUntil}`);

// 2. 创建 Viem Client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(PROVIDER_URL),
});

console.log(`\n✅ Viem Client 已创建`);
console.log(`   - Chain: ${client.chain?.name}`);
console.log(`   - Chain ID: ${client.chain?.id}`);

// 3. 为 Permit Token 创建 Schema 和 X402Server
const permitSchema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/permit`,
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 3600,
  asset: PERMIT_TOKEN_ADDRESS,
  paymentType: 'permit', // 仅支持 permit
  outputSchema: {
    input: {
      type: "http",
      method: "POST",
      discoverable: true,
      bodyFields: {},
    },
    output: {
      message: "string",
      authorizationType: "string",
      payer: "string",
    },
  },
});

const permitServer = new X402Server({
  facilitator,
  schema: permitSchema,
  client,
});

console.log(`\n✅ Permit Token X402Server 已创建`);
console.log(`   - Token: ${PERMIT_TOKEN_ADDRESS}`);
console.log(`   - Path: /permit`);

// 4. 为 EIP-3009 Token 创建 Schema 和 X402Server
const eip3009Schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/3009`,
  description: "Access to protected resource with EIP-3009",
  mimeType: "application/json",
  payTo: RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 3600,
  asset: EIP3009_TOKEN_ADDRESS,
  paymentType: 'eip3009', // 仅支持 eip3009
  outputSchema: {
    input: {
      type: "http",
      method: "POST",
      discoverable: true,
      bodyFields: {},
    },
    output: {
      message: "string",
      authorizationType: "string",
      payer: "string",
    },
  },
});

const eip3009Server = new X402Server({
  facilitator,
  schema: eip3009Schema,
  client,
});

console.log(`\n✅ EIP-3009 Token X402Server 已创建`);
console.log(`   - Token: ${EIP3009_TOKEN_ADDRESS}`);
console.log(`   - Path: /3009`);

// 5. 初始化和验证
(async () => {
  // 初始化 Permit Server
  const permitInitResult = await permitServer.initialize();
  if (!permitInitResult.success) {
    console.error(`\n❌ Permit Server 初始化失败:`, permitInitResult.error);
    process.exit(1);
  }
  console.log(`\n✅ Permit Server 初始化成功`);

  // 初始化 EIP-3009 Server
  const eip3009InitResult = await eip3009Server.initialize();
  if (!eip3009InitResult.success) {
    console.error(`\n❌ EIP-3009 Server 初始化失败:`, eip3009InitResult.error);
    process.exit(1);
  }
  console.log(`\n✅ EIP-3009 Server 初始化成功`);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ERC20 x402 Resource Server (Multi-Token)`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`  Payment Amount: ${PAYMENT_AMOUNT} wei`);
  console.log(`\n  📍 /permit endpoint:`);
  console.log(`     Token: ${PERMIT_TOKEN_ADDRESS}`);
  console.log(`     Type: EIP-2612 Permit`);
  console.log(`\n  📍 /3009 endpoint:`);
  console.log(`     Token: ${EIP3009_TOKEN_ADDRESS}`);
  console.log(`     Type: EIP-3009`);
  console.log(`═══════════════════════════════════════════\n`);
})();

// ====== Hono App ======
const app = new Hono();
app.use("*", logger());

// 创建通用的支付处理函数
async function handlePayment(
  c: any,
  x402Server: X402Server,
  schema: X402PaymentSchema,
  tokenName: string
) {
  console.log(`\n📥 Received POST request for ${tokenName}`);
  const paymentHeaderBase64 = c.req.header("X-PAYMENT");

  const decodePaymentResult = await x402Server.parsePaymentHeader(paymentHeaderBase64 as string);

  if (!decodePaymentResult.success) {
    return c.json({
      x402Version: 1,
      accepts: [decodePaymentResult.data],
      error: decodePaymentResult.error,
    }, 402);
  }

  const { paymentPayload, paymentRequirements } = decodePaymentResult.data

  // 使用 X402Server 验证支付
  try {
    console.log(`\n🔐 Verifying payment with X402Server (${tokenName})...`);
    const verifyResult = await x402Server.verifyPayment(
      paymentPayload,
      paymentRequirements,
    );

    if (!verifyResult.success) {
      console.log("❌ Payment verification failed:", verifyResult.error);
      return c.json(
        {
          x402Version: 1,
          accepts: [paymentRequirements],
          error: "Payment verification failed",
          details: verifyResult.error,
        },
        402,
      );
    }

    console.log(`✅ Payment verified! Payer: ${verifyResult}`);
  } catch (err: any) {
    console.error("❌ Error verifying payment:", err.message);
    return c.json({ error: "Payment verification failed" }, 500);
  }

  // 使用 X402Server 结算支付
  try {
    console.log(`\n💸 Settling payment with X402Server (${tokenName})...`);
    const settleResult = await x402Server.settle(
      paymentPayload,
      paymentRequirements,
    );

    if (!settleResult.success) {
      console.error("⚠️  Settlement failed:", settleResult.error);
      return c.json(
        {
          x402Version: 1,
          accepts: paymentRequirements,
          error: "Payment settlement failed",
          details: settleResult.error,
        },
        402,
      );
    }

    console.log(
      `✅ Payment settled! Transaction: ${settleResult.transactionHash}`,
    );

    // 返回成功响应
    console.log("\n✅ Responding 200 OK to client");

    return c.json({
      message: `Payment verified and settled successfully for ${tokenName}!`,
      tokenName,
      tokenAddress: schema.get("asset"),
      transactionHash: settleResult.transactionHash,
    });
  } catch (err: any) {
    console.error("❌ Error settling payment:", err.message);
    return c.json({ error: "Payment settlement failed" }, 500);
  }
}

// POST /permit - Permit Token 端点
app.post("/permit", async (c) => {
  return handlePayment(c, permitServer, permitSchema, "Permit Token");
});

// GET /permit (支付要求)
app.get("/permit", (c) => {
  return c.json({
    x402Version: 1,
    accepts: [permitSchema.toJSON()],
  });
});

// POST /3009 - EIP-3009 Token 端点
app.post("/3009", async (c) => {
  return handlePayment(c, eip3009Server, eip3009Schema, "EIP-3009 Token");
});

// GET /3009 (支付要求)
app.get("/3009", (c) => {
  return c.json({
    x402Version: 1,
    accepts: [eip3009Schema.toJSON()],
  });
});

// Start server
serve({
  port: PORT,
  fetch: app.fetch,
});

