import { NextRequest, NextResponse } from "next/server";
import { X402Server } from "@wtflabs/x402-server";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { createPublicClient, http, type Address } from "viem";
import { bscTestnet } from "viem/chains";
import { parseUnits } from "viem";

// 配置常量
const PROVIDER_URL = process.env.PROVIDER_URL || "https://bsc-testnet-rpc.publicnode.com";
const USDC_ADDRESS = "0x03db069489e2caa4e51ed149e83d732ef3931670" as Address;
const PAYMENT_AMOUNT = parseUnits("0.05", 6); // 0.05 USDC

// 延迟初始化
let x402Server: X402Server | null = null;
let initialized = false;

function getRecipientAddress(): Address {
  const address = process.env.RECIPIENT_ADDRESS;
  if (!address) {
    throw new Error("RECIPIENT_ADDRESS environment variable is required");
  }
  return address as Address;
}

function getX402Server(): X402Server {
  if (!x402Server) {
    const recipientAddress = getRecipientAddress();

    const schema = new X402PaymentSchema({
      scheme: "exact",
      network: "bsc-testnet",
      asset: USDC_ADDRESS,
      payTo: recipientAddress,
      maxAmountRequired: PAYMENT_AMOUNT.toString(),
      resource: "http://localhost:4030/api/protected",
      description: "Access to protected resource with EIP-2612 Permit",
      mimeType: "application/json",
      maxTimeoutSeconds: 3600,
      paymentType: "permit",
      outputSchema: {
        input: {
          type: "http" as const,
          method: "POST" as const,
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

    const facilitator = new Facilitator({
      recipientAddress,
      relayer: "0xe4bb3CB99F7C9c876544d7b0DB481036Baf4aBcD",
      waitUntil: "confirmed",
      baseUrl: process.env.FACILITATOR_URL,
      apiKey: process.env.FACILITATOR_API_KEY,
    });

    const client = createPublicClient({
      chain: bscTestnet,
      transport: http(PROVIDER_URL),
    });

    x402Server = new X402Server({
      facilitator,
      schema,
      client,
    });
  }
  return x402Server;
}

async function ensureInitialized() {
  if (!initialized) {
    const server = getX402Server();
    const result = await server.initialize();
    if (!result.success) {
      throw new Error(result.error || "Failed to initialize X402 server");
    }
    initialized = true;
  }
}

export async function GET() {
  try {
    await ensureInitialized();
    const server = getX402Server();

    // 返回支付要求
    const paymentSchema = server.getSchema().toJSON();

    return new NextResponse(
      JSON.stringify({
        message: "Payment required to access this resource",
        schema: paymentSchema,
      }),
      {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-402": JSON.stringify(paymentSchema),
        },
      }
    );
  } catch (error: any) {
    console.error("GET /api/protected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized();
    const server = getX402Server();

    // 从请求头获取支付信息
    const paymentHeader = request.headers.get("X-402-Payment");

    if (!paymentHeader) {
      return NextResponse.json(
        { error: "Missing X-402-Payment header" },
        { status: 400 }
      );
    }

    const paymentPayload = JSON.parse(paymentHeader);

    // 获取完整的支付要求（schema）
    const paymentRequirements = server.getSchema().toJSON();

    // 验证支付
    const verifyResult = await server.verifyPayment(paymentPayload, paymentRequirements);

    if (!verifyResult.success) {
      return NextResponse.json(
        {
          error: "Payment verification failed",
          details: verifyResult.error,
        },
        { status: 402 }
      );
    }

    // 结算支付
    const settleResult = await server.settle(paymentPayload, paymentRequirements);

    if (!settleResult.success) {
      return NextResponse.json(
        {
          error: "Payment settlement failed",
          details: settleResult.error,
        },
        { status: 402 }
      );
    }

    // 返回受保护的资源
    return NextResponse.json({
      success: true,
      message: "支付成功！这是您请求的受保护资源。",
      data: {
        secret: "这是一个秘密信息",
        timestamp: new Date().toISOString(),
        payer: verifyResult.payer,
        transactionHash: settleResult.transactionHash,
      },
    });
  } catch (error: any) {
    console.error("POST /api/protected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

