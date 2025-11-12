import { createWalletClient, http, parseEther, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402x-fetch";
import { bsc } from "viem/chains";

const PRIVATE_KEY = ''
const SERVER_URL = 'http://localhost:3939/api/data'

async function main() {
  // 创建钱包
  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createWalletClient({
    account,
    transport: http(),
    chain: bsc,
  });

  // 创建支付 fetch
  const fetchWithPay = wrapFetchWithPayment(
    fetch,
    client.extend(publicActions),
    parseEther("0.01")
  );

  // 请求付费 API
  const response = await fetchWithPay(SERVER_URL, {
    method: "POST",
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("❌ Error:", error);
    return;
  }

  const data = await response.json();
  console.log("✅ Received:", data);
}

main().catch(console.error);