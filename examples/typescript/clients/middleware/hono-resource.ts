import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createHonoMiddleware, X402Server } from "x402x-server";
import { Facilitator } from "x402x-facilitator";
import { createPublicClient, http, parseEther } from "viem";
import { bsc } from "viem/chains";

// 定义 Hono 环境类型
type Env = {
  Variables: {
    x402: {
      payer: string;
      txHash: string;
    };
  };
};

const SELLER_EIP7702_RECIPIENT_ADDRESS = '0x9b2407D5d02b00A612084543CaFd9D8E5564941A';
const ASSET_ADDRESS = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const MAX_AMOUNT_REQUIRED = parseEther("0.01").toString();
const PORT = 3939;

async function main() {
  const app = new Hono<Env>();

  const client = createPublicClient({
    chain: bsc,
    transport: http('https://bsc-dataseed1.bnbchain.org'),
  });

  const facilitator = new Facilitator({
    recipientAddress: SELLER_EIP7702_RECIPIENT_ADDRESS,
  });

  const server = new X402Server({ client, facilitator });

  await server.initialize([ASSET_ADDRESS]);

  const paymentMiddleware = createHonoMiddleware({
    server,
    getToken: () => ASSET_ADDRESS,
    getAmount: () => MAX_AMOUNT_REQUIRED,
    getConfig: () => ({
      description: "Premium API access",
      mimeType: "application/json",
    }),
  });

  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  app.post("/api/data", paymentMiddleware, (c) => {
    const { payer, txHash } = c.get("x402");
    return c.json({
      success: true,
      data: "Premium content",
      payer,
      txHash,
    });
  });

  serve({
    fetch: app.fetch,
    port: PORT,
  });

  console.log(`Server running on port ${PORT}`);
}

main();