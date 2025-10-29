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
const USDC_ADDRESS = "0x03db069489e2caa4e51ed149e83d732ef3931670" as Hex; // USDC on Base Sepolia
const PAYMENT_AMOUNT = "50000"; // 0.05 USDC (50000 wei, assuming 6 decimals)
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
  baseUrl: "http://localhost:3000", // 可选
  // apiKey: "your-api-key", // 可选
});

console.log(`\n✅ Facilitator 已创建`);
console.log(`   - Recipient: ${facilitator.recipientAddress}`);
console.log(`   - Relayer: ${facilitator.relayer}`);
console.log(`   - Wait Until: ${facilitator.waitUntil}`);

// 2. 创建 Schema
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/protected-resource`,
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 3600,
  asset: USDC_ADDRESS,
  paymentType: "permit",
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

console.log(`\n✅ Schema 已创建`);
console.log(`   - Scheme: ${schema.get("scheme")}`);
console.log(`   - Network: ${schema.get("network")}`);
console.log(`   - Amount: ${schema.get("maxAmountRequired")}`);

// 3. 创建 Viem Client
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(PROVIDER_URL),
});

console.log(`\n✅ Viem Client 已创建`);
console.log(`   - Chain: ${client.chain?.name}`);
console.log(`   - Chain ID: ${client.chain?.id}`);

// 4. 创建 X402Server
const x402Server = new X402Server({
  facilitator,
  schema,
  client,
});

console.log(`\n✅ X402Server 已创建`);

// 5. 初始化和验证
(async () => {
  // 初始化
  const initResult = await x402Server.initialize();
  if (!initResult.success) {
    console.error(`\n❌ Server 初始化失败:`, initResult.error);
    process.exit(1);
  }
  console.log(`\n✅ Server 初始化成功`);
  const extra = schema.getExtra();
  console.log(`   - Relayer (added to schema): ${extra?.relayer}`);

  // 验证配置
  const verifyResult = await x402Server.verify();
  if (!verifyResult.success) {
    console.error(`\n⚠️  配置验证警告:`);
    verifyResult.errors?.forEach((error) => {
      console.error(`   - ${error}`);
    });
  } else {
    console.log(`\n✅ 配置验证通过`);
  }

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ERC20 x402 Resource Server (New Packages)`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Token: ${USDC_ADDRESS} (USDC)`);
  console.log(`  Payment: ${PAYMENT_AMOUNT} wei`);
  console.log(`  Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`═══════════════════════════════════════════\n`);
})();

// ====== Hono App ======
const app = new Hono();
app.use("*", logger());

// POST /protected-resource
app.post("/protected-resource", async (c) => {
  console.log("\n📥 Received POST /protected-resource");
  const paymentHeaderBase64 = c.req.header("X-PAYMENT");

  // Return 402 if no payment header
  if (!paymentHeaderBase64) {
    console.log("💰 No X-PAYMENT header, responding 402 Payment Required");
    return c.json(
      {
        x402Version: 1,
        accepts: [schema.getConfig()],
        error: "Payment required",
      },
      402,
    );
  }

  // Decode payment header
  let paymentPayload;
  try {
    const paymentHeaderJson = Buffer.from(
      paymentHeaderBase64,
      "base64",
    ).toString("utf-8");
    paymentPayload = JSON.parse(paymentHeaderJson);
    console.log(
      "🔍 Decoded X-PAYMENT header:",
      JSON.stringify(paymentPayload, null, 2),
    );
  } catch (err) {
    console.error("❌ Error decoding X-PAYMENT header:", err);
    return c.json({ error: "Invalid payment header format" }, 400);
  }

  // 使用 X402Server 验证支付
  try {
    console.log(`\n🔐 Verifying payment with X402Server...`);
    const verifyResult = await x402Server.verifyPayment(
      paymentPayload,
      schema.getConfig(),
    );

    if (!verifyResult.success) {
      console.log("❌ Payment verification failed:", verifyResult.error);
      return c.json(
        {
          x402Version: 1,
          accepts: [schema.getConfig()],
          error: "Payment verification failed",
          details: verifyResult.error,
        },
        402,
      );
    }

    console.log(`✅ Payment verified! Payer: ${verifyResult.payer}`);
  } catch (err: any) {
    console.error("❌ Error verifying payment:", err.message);
    return c.json({ error: "Payment verification failed" }, 500);
  }

  // 使用 X402Server 结算支付
  try {
    console.log(`\n💸 Settling payment with X402Server...`);
    const settleResult = await x402Server.settle(
      paymentPayload,
      schema.getConfig(),
    );

    if (!settleResult.success) {
      console.error("⚠️  Settlement failed:", settleResult.error);
      return c.json(
        {
          x402Version: 1,
          accepts: [schema.getConfig()],
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
      message:
        "Payment verified and settled successfully with new X402 packages!",
      authorizationType: "permit",
      payer: paymentPayload.payload?.authorization?.owner,
      transactionHash: settleResult.transactionHash,
    });
  } catch (err: any) {
    console.error("❌ Error settling payment:", err.message);
    return c.json({ error: "Payment settlement failed" }, 500);
  }
});

// GET /payment-requirements - 获取支付要求
app.get("/payment-requirements", (c) => {
  return c.json({
    x402Version: 1,
    accepts: [schema.getConfig()],
  });
});

// Start server
serve({
  port: PORT,
  fetch: app.fetch,
});

