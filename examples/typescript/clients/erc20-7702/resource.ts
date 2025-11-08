import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { type Hex, createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402Server } from "@wtflabs/x402-server";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

// Constants
const PORT = 4025;
// 代币地址
const PERMIT_TOKEN_ADDRESS = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as Hex; // permit token
const PAYMENT_AMOUNT = "1000"; // 1 USDC (1000000000000000000 wei, assuming 18 decimals)
const PROVIDER_URL = process.env.PROVIDER_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
// 收款地址 - 7702合约地址（用户的EIP-7702授权地址）
const RECIPIENT_ADDRESS =
  (process.env.RECIPIENT_ADDRESS as Hex) ||
  ("0x0000000011025134e0f8a417b37e27d90b70678b" as Hex);

// ====== 使用新 API 创建组件 ======

// 1. 创建 Viem Client
const client = createPublicClient({
  chain: bsc,
  transport: http(PROVIDER_URL),
});

console.log(`\n✅ Viem Client 已创建`);
console.log(`   - Chain: ${client.chain?.name}`);
console.log(`   - Chain ID: ${client.chain?.id}`);

// 2. 创建 Facilitator
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  waitUntil: "confirmed", // simulated | submitted | confirmed
  baseUrl: "http://127.0.0.1:3000",
});

console.log(`\n✅ Facilitator 已创建`);
console.log(`   - EIP-7702 Contract: ${facilitator.recipientAddress}`);
console.log(`   - Wait Until: ${facilitator.waitUntil}`);

// 3. 创建 X402Server（新 API）
const server = new X402Server({
  client,
  facilitator,
  network: "bsc", // 可选，自动从 client 检测
});

console.log(`\n✅ X402Server 已创建`);
console.log(`   - Token: ${PERMIT_TOKEN_ADDRESS}`);
console.log(`   - Path: /permit`);

// 4. 初始化和预热缓存（可选）
(async () => {
  const initResult = await server.initialize([PERMIT_TOKEN_ADDRESS]);
  if (!initResult.success) {
    console.error(`\n❌ Server 初始化失败:`, initResult.error);
    process.exit(1);
  }
  console.log(`\n✅ Server 初始化成功，缓存已预热`);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  ERC20 x402 Resource Server (7702)`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Port: ${PORT}`);
  console.log(`  EIP-7702 Contract: ${RECIPIENT_ADDRESS}`);
  console.log(`  Payment Amount: ${PAYMENT_AMOUNT} wei`);
  console.log(`\n  📍 /permit endpoint:`);
  console.log(`     Token: ${PERMIT_TOKEN_ADDRESS}`);
  console.log(`     Type: EIP-2612 Permit → 7702`);
  console.log(`═══════════════════════════════════════════\n`);
})();

// ====== Hono App ======
const app = new Hono();
app.use("*", logger());

// POST /permit - Permit Token 端点
app.post("/permit", async (c) => {
  console.log(`\n📥 Received POST request for Permit Token`);

  try {
    // 1. 创建支付要求
    const requirements = await server.createRequirements({
      asset: PERMIT_TOKEN_ADDRESS,
      maxAmountRequired: PAYMENT_AMOUNT,
      description: "Access to protected resource with EIP-2612 Permit (7702)",
      resource: `http://localhost:${PORT}/permit`,
      mimeType: "application/json",
      maxTimeoutSeconds: 3600,
      paymentType: "permit", // 指定 permit 类型
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
          transactionHash: "string",
        },
      },
    });

    console.log(`\n💳 Payment requirements created`);

    // 2. 处理支付（parse → verify → settle）
    const paymentHeader = c.req.header("X-PAYMENT");
    const result = await server.process(paymentHeader, requirements);

    if (!result.success) {
      console.log("❌ Payment processing failed:", result.response.error);
      return c.json(result.response, 402);
    }

    // 3. 支付成功
    console.log(`✅ Payment verified and settled!`);
    console.log(`   - Payer: ${result.data.payer}`);
    console.log(`   - TxHash: ${result.data.txHash}`);
    console.log("\n✅ Responding 200 OK to client");

    return c.json({
      message: "Payment verified and settled successfully for Permit Token!",
      authorizationType: "permit",
      payer: result.data.payer,
      transactionHash: result.data.txHash,
    });
  } catch (err: any) {
    console.error("❌ Error processing payment:", err.message);
    return c.json({ error: "Payment processing failed", details: err.message }, 500);
  }
});

// GET /permit (支付要求)
app.get("/permit", async (c) => {
  try {
    // 创建支付要求并返回
    const requirements = await server.createRequirements({
      asset: PERMIT_TOKEN_ADDRESS,
      maxAmountRequired: PAYMENT_AMOUNT,
      description: "Access to protected resource with EIP-2612 Permit (7702)",
      resource: `http://localhost:${PORT}/permit`,
      mimeType: "application/json",
      maxTimeoutSeconds: 3600,
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
          transactionHash: "string",
        },
      },
    });

    return c.json({
      x402Version: 1,
      accepts: [requirements],
    });
  } catch (err: any) {
    console.error("❌ Error creating requirements:", err.message);
    return c.json({ error: "Failed to create payment requirements" }, 500);
  }
});

// Start server
serve({
  port: PORT,
  fetch: app.fetch,
});

