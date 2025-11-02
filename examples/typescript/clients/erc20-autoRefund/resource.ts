import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { type Hex, createPublicClient, createWalletClient, http, decodeEventLog, parseAbiItem } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { X402Server } from "@wtflabs/x402-server";
import Database from "better-sqlite3";

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "./.env");
dotenv.config({ path: envPath });

// ====== SQLite 数据库初始化 ======
// 支持通过环境变量配置数据库路径，方便 Docker 部署
const DB_DIR = process.env.DB_DIR || path.resolve(__dirname, "./data");
const dbPath = path.resolve(DB_DIR, "payments.db");

// 确保数据目录存在
import fs from "node:fs";
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(dbPath);

// 创建支付记录表
db.exec(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payer_address TEXT NOT NULL,
    amount TEXT NOT NULL,
    transaction_hash TEXT NOT NULL,
    actual_received_amount TEXT,
    verified_at TEXT,
    refund_status TEXT DEFAULT 'pending',
    refund_transaction_hash TEXT,
    refunded_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

console.log(`\n✅ SQLite Database initialized at ${dbPath}`);

// Constants
const PORT = 4025;
// BSC 主网 USD1 代币地址
const USD1_TOKEN_ADDRESS = "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d" as Hex; // USD1 on BSC Mainnet
const PAYMENT_AMOUNT = "1000000000000000000"; // 1 USD1 (18 decimals)
const PROVIDER_URL = process.env.PROVIDER_URL || "https://rpc-bsc.48.club";
const RECIPIENT_ADDRESS =
  (process.env.RECIPIENT_ADDRESS as Hex) ||
  ("0x5D06b8145D908DDb7ca116664Fcf113ddaA4d6F3" as Hex);
const RECIPIENT_PRIVATE_KEY = process.env.RECIPIENT_ADDRESS_PRIVATE_KEY as Hex;

if (!RECIPIENT_PRIVATE_KEY) {
  console.error("❌ RECIPIENT_ADDRESS_PRIVATE_KEY is required in .env file");
  process.exit(1);
}

// ====== 使用新包创建组件 ======

// 1. 创建 Facilitator
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  relayer: process.env.RELAYER_ADDRESS as Hex, // 可选，默认使用 recipientAddress
  waitUntil: "confirmed", // simulated | submitted | confirmed
  baseUrl: process.env.FACILITATOR_URL || "http://127.0.0.1:3000", // 可选
  // apiKey: process.env.FACILITATOR_API_KEY, // 可选
});

console.log(`\n✅ Facilitator 已创建`);
console.log(`   - Recipient: ${facilitator.recipientAddress}`);
console.log(`   - Relayer: ${facilitator.relayer}`);
console.log(`   - Wait Until: ${facilitator.waitUntil}`);

// 2. 创建 Viem Client
const client = createPublicClient({
  chain: bsc,
  transport: http(PROVIDER_URL),
});

console.log(`\n✅ Viem Client 已创建`);
console.log(`   - Chain: ${client.chain?.name}`);
console.log(`   - Chain ID: ${client.chain?.id}`);

// 3. 创建 Wallet Client（用于退款）
const account = privateKeyToAccount(RECIPIENT_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: bsc,
  transport: http(PROVIDER_URL),
});

console.log(`\n✅ Wallet Client 已创建`);
console.log(`   - Account: ${account.address}`);

// 3. 为 USD1 Token 创建 Schema 和 X402Server (仅支持 Permit)
const usd1Schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc",
  maxAmountRequired: PAYMENT_AMOUNT,
  resource: `http://localhost:${PORT}/hello`,
  description: "Say hello with USD1 payment using EIP-2612 Permit",
  mimeType: "application/json",
  payTo: RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 3600,
  asset: USD1_TOKEN_ADDRESS,
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
      payer: "string",
    },
  },
});

const usd1Server = new X402Server({
  facilitator,
  schema: usd1Schema,
  client,
});

console.log(`\n✅ USD1 Token X402Server 已创建`);
console.log(`   - Token: ${USD1_TOKEN_ADDRESS}`);
console.log(`   - Network: BSC Mainnet`);
console.log(`   - Path: /hello`);

// 4. 初始化和验证
(async () => {
  // 初始化 USD1 Server
  const usd1InitResult = await usd1Server.initialize();
  if (!usd1InitResult.success) {
    console.error(`\n❌ USD1 Server 初始化失败:`, usd1InitResult.error);
    process.exit(1);
  }
  console.log(`\n✅ USD1 Server 初始化成功`);

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  BSC Mainnet x402 Hello Server`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Network: BSC Mainnet`);
  console.log(`  RPC: ${PROVIDER_URL}`);
  console.log(`  Recipient: ${RECIPIENT_ADDRESS}`);
  console.log(`  Payment Amount: ${PAYMENT_AMOUNT} wei (1 USD1)`);
  console.log(`\n  📍 /hello endpoint:`);
  console.log(`     Token: ${USD1_TOKEN_ADDRESS} (USD1)`);
  console.log(`     Type: EIP-2612 Permit`);
  console.log(`     Response: Hello! {user_address}`);
  console.log(`═══════════════════════════════════════════\n`);
})();

// ====== 数据库辅助函数 ======
interface PaymentRecord {
  payerAddress: string;
  amount: string;
  transactionHash: string;
}

function insertPaymentRecord(record: PaymentRecord): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO payments (payer_address, amount, transaction_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    record.payerAddress,
    record.amount,
    record.transactionHash,
    now,
    now
  );

  console.log(`💾 Payment record saved to database:`);
  console.log(`   - Payer: ${record.payerAddress}`);
  console.log(`   - Amount: ${record.amount}`);
  console.log(`   - TX: ${record.transactionHash}`);
  console.log(`   - Time: ${now}`);
}

// ====== 定时查询交易实际转账金额 ======

// ERC20 Transfer 事件 ABI
const TRANSFER_EVENT_ABI = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

// ERC20 Transfer 函数 ABI
const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' }
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
] as const;

interface PaymentRecordWithId {
  id: number;
  payer_address: string;
  amount: string;
  transaction_hash: string;
  actual_received_amount: string | null;
  verified_at: string | null;
  refund_status: string;
  refund_transaction_hash: string | null;
  refunded_at: string | null;
}

/**
 * 查询指定交易中转给 RECIPIENT_ADDRESS 的实际金额
 */
async function verifyTransactionAmount(txHash: string): Promise<string | null> {
  try {
    // 获取交易收据
    const receipt = await client.getTransactionReceipt({
      hash: txHash as Hex,
    });

    if (!receipt) {
      console.log(`⚠️  Transaction not found: ${txHash}`);
      return null;
    }

    // 解析所有 Transfer 事件
    let totalReceived = 0n;

    for (const log of receipt.logs) {
      try {
        // 尝试解码为 Transfer 事件
        const decoded = decodeEventLog({
          abi: [TRANSFER_EVENT_ABI],
          data: log.data,
          topics: log.topics,
        });

        // 检查是否转给了 RECIPIENT_ADDRESS
        if (
          decoded.eventName === 'Transfer' &&
          decoded.args.to?.toLowerCase() === RECIPIENT_ADDRESS.toLowerCase()
        ) {
          totalReceived += decoded.args.value as bigint;
          console.log(`   📥 Found transfer: ${decoded.args.value} wei from ${decoded.args.from}`);
        }
      } catch (e) {
        // 不是 Transfer 事件，跳过
        continue;
      }
    }

    if (totalReceived > 0n) {
      return totalReceived.toString();
    }

    return null;
  } catch (error: any) {
    console.error(`❌ Error verifying transaction ${txHash}:`, error.message);
    return null;
  }
}

/**
 * 更新支付记录的实际收到金额
 */
function updatePaymentVerification(id: number, actualAmount: string): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE payments 
    SET actual_received_amount = ?, verified_at = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(actualAmount, now, now, id);
  console.log(`✅ Updated payment record #${id} with actual amount: ${actualAmount}`);
}

/**
 * 更新退款状态
 */
function updateRefundStatus(
  id: number,
  status: string,
  txHash?: string
): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE payments 
    SET refund_status = ?, 
        refund_transaction_hash = ?, 
        refunded_at = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const refundedAt = status === 'completed' ? now : null;
  stmt.run(status, txHash || null, refundedAt, now, id);
  console.log(`✅ Updated refund status for payment #${id}: ${status}`);
}

/**
 * 执行退款交易
 */
async function refundPayment(
  paymentId: number,
  payerAddress: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    console.log(`\n💸 Initiating refund for payment #${paymentId}:`);
    console.log(`   - To: ${payerAddress}`);
    console.log(`   - Amount: ${amount} wei`);
    console.log(`   - Token: ${USD1_TOKEN_ADDRESS}`);

    // 发送 ERC20 Transfer 交易
    const hash = await walletClient.writeContract({
      address: USD1_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [payerAddress as Hex, BigInt(amount)],
    });

    console.log(`   📤 Refund transaction sent: ${hash}`);
    console.log(`   ⏳ Waiting for confirmation...`);

    // 更新状态为处理中
    updateRefundStatus(paymentId, 'processing', hash);

    // 等待交易确认
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: 1,
    });

    if (receipt.status === 'success') {
      console.log(`   ✅ Refund confirmed! Block: ${receipt.blockNumber}`);
      updateRefundStatus(paymentId, 'completed', hash);

      return { success: true, txHash: hash };
    } else {
      console.log(`   ❌ Refund transaction failed`);
      updateRefundStatus(paymentId, 'failed', hash);

      return { success: false, error: 'Transaction reverted' };
    }
  } catch (error: any) {
    console.error(`   ❌ Error during refund:`, error.message);
    updateRefundStatus(paymentId, 'failed');

    return { success: false, error: error.message };
  }
}

/**
 * 定时任务：验证数据库中未验证的交易并自动退款
 */
async function verifyPendingPayments() {
  console.log(`\n🔍 Starting payment verification and refund task...`);

  try {
    // 查询所有未验证的支付记录
    const verifyStmt = db.prepare(`
      SELECT * FROM payments 
      WHERE actual_received_amount IS NULL OR verified_at IS NULL
      ORDER BY created_at ASC
      LIMIT 50
    `);
    const pendingPayments = verifyStmt.all() as PaymentRecordWithId[];

    if (pendingPayments.length > 0) {
      console.log(`📋 Found ${pendingPayments.length} pending payment(s) to verify`);

      // 逐个验证
      for (const payment of pendingPayments) {
        console.log(`\n🔎 Verifying payment #${payment.id}:`);
        console.log(`   - TX: ${payment.transaction_hash}`);
        console.log(`   - Expected: ${payment.amount} wei`);

        const actualAmount = await verifyTransactionAmount(payment.transaction_hash);

        if (actualAmount) {
          updatePaymentVerification(payment.id, actualAmount);

          // 比对金额是否匹配
          if (actualAmount === payment.amount) {
            console.log(`   ✅ Amount matches! (${actualAmount} wei)`);
          } else {
            console.log(`   ⚠️  Amount mismatch!`);
            console.log(`      Expected: ${payment.amount} wei`);
            console.log(`      Received: ${actualAmount} wei`);
          }
        } else {
          console.log(`   ⚠️  Could not verify transaction amount`);
        }
      }
    }

    // 查询所有已验证但未退款的支付记录
    const refundStmt = db.prepare(`
      SELECT * FROM payments 
      WHERE actual_received_amount IS NOT NULL 
        AND verified_at IS NOT NULL
        AND refund_status = 'pending'
      ORDER BY verified_at ASC
      LIMIT 10
    `);
    const paymentsToRefund = refundStmt.all() as PaymentRecordWithId[];

    if (paymentsToRefund.length === 0) {
      console.log(`✅ No payments to refund`);
      console.log(`\n✅ Task completed\n`);
      return;
    }

    console.log(`\n💰 Found ${paymentsToRefund.length} payment(s) to refund`);

    // 逐个退款
    for (const payment of paymentsToRefund) {
      const refundResult = await refundPayment(
        payment.id,
        payment.payer_address,
        payment.actual_received_amount || payment.amount
      );

      if (refundResult.success) {
        console.log(`   ✅ Refund successful for payment #${payment.id}`);
        console.log(`   📤 Refund TX: ${refundResult.txHash}`);
      } else {
        console.log(`   ❌ Refund failed for payment #${payment.id}: ${refundResult.error}`);
      }

      // 添加延迟避免 RPC 限流
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Payment verification and refund task completed\n`);
  } catch (error: any) {
    console.error(`❌ Error in payment verification and refund task:`, error.message);
  }
}

// 启动定时任务 - 每 60 秒执行一次
const VERIFICATION_INTERVAL_MS = 5 * 1000; // 60 秒
const verificationTimer = setInterval(verifyPendingPayments, VERIFICATION_INTERVAL_MS);

console.log(`\n⏰ Payment verification task scheduled (every ${VERIFICATION_INTERVAL_MS / 1000} seconds)`);

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

  // 用户地址变量
  let userAddress: string = "";

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

    // 获取用户地址（verifyPayment 返回的 payer 在 data 字段中）
    userAddress = verifyResult.data || "";
    console.log(`✅ Payment verified! Payer: ${userAddress}`);
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

    console.log(settleResult);
    console.log(
      `✅ Payment settled! Transaction: ${settleResult.transaction}`,
    );

    // 保存支付记录到数据库
    try {
      insertPaymentRecord({
        payerAddress: userAddress,
        amount: schema.get("maxAmountRequired") as string,
        transactionHash: settleResult.transaction || "",
      });
    } catch (dbError: any) {
      console.error("⚠️  Failed to save payment record to database:", dbError.message);
      // 继续执行，不因数据库错误中断响应
    }

    // 返回成功响应
    console.log("\n✅ Responding 200 OK to client");

    return c.json({
      message: `Hello! ${userAddress}`,
      payer: userAddress,
    });
  } catch (err: any) {
    console.error("❌ Error settling payment:", err.message);
    return c.json({ error: "Payment settlement failed" }, 500);
  }
}

// POST /hello - Hello 端点（需要 USD1 支付）
app.post("/hello", async (c) => {
  return handlePayment(c, usd1Server, usd1Schema, "USD1 Token");
});

// GET /hello (支付要求)
app.get("/hello", (c) => {
  return c.json({
    x402Version: 1,
    accepts: [usd1Schema.toJSON()],
  });
});

// GET /payments - 查询所有支付记录
app.get("/payments", (c) => {
  try {
    const stmt = db.prepare(`
      SELECT * FROM payments 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    const payments = stmt.all();

    return c.json({
      success: true,
      count: payments.length,
      payments: payments,
    });
  } catch (error: any) {
    console.error("Error querying payments:", error.message);
    return c.json({
      success: false,
      error: "Failed to query payments",
    }, 500);
  }
});

// Start server
serve({
  port: PORT,
  fetch: app.fetch,
});

// 优雅关闭数据库和定时器
process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down server...");
  clearInterval(verificationTimer);
  console.log("✅ Verification timer stopped");
  db.close();
  console.log("✅ Database connection closed");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\n🛑 Shutting down server...");
  clearInterval(verificationTimer);
  console.log("✅ Verification timer stopped");
  db.close();
  console.log("✅ Database connection closed");
  process.exit(0);
});

