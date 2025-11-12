import express from "express";
import { createExpressMiddleware, X402Server } from "x402x-server";
import { Facilitator } from "x402x-facilitator";
import { createPublicClient, http, parseEther } from "viem";
import { bsc } from "viem/chains";

const app = express();
app.use(express.json());

const SELLER_EIP7702_RECIPIENT_ADDRESS = '';
const ASSET_ADDRESS = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const MAX_AMOUNT_REQUIRED = parseEther("0.01").toString();
const PORT = 3939;

async function main() {
  const client = createPublicClient({
    chain: bsc,
    transport: http('https://bsc-dataseed1.bnbchain.org'),
  });

  const facilitator = new Facilitator({
    recipientAddress: SELLER_EIP7702_RECIPIENT_ADDRESS,
  });

  const server = new X402Server({ client, facilitator });
  await server.initialize([ASSET_ADDRESS]);

  const paymentMiddleware = createExpressMiddleware({
    server,
    getToken: () => ASSET_ADDRESS,
    getAmount: () => MAX_AMOUNT_REQUIRED,
    getConfig: () => ({
      description: "Premium API access",
      mimeType: "application/json",
    }),
  });

  app.post("/api/data", paymentMiddleware, (req, res) => {
    const { payer, txHash } = req.x402!;
    res.json({
      success: true,
      data: "Premium content",
      payer,
      txHash,
    });
  });

  app.listen(PORT, () => {
    console.log(`  Server: http://localhost:${PORT}`);
  });
}

main();