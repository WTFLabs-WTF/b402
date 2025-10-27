import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "dotenv";

config();

const svmPrivateKey = "5SemJ6Wn7bnrEj8wrt582VbRbRUNP1egLyNm6r6iE6Da6HHUdatDTpuax42RNoK5jyWpNdaz4YEewsJP9Yd5GA9";

/**
 * 检查 Solana 钱包余额
 */
async function checkBalance() {
  console.log("🔍 检查 Solana 钱包余额\n");
  console.log("=".repeat(60));

  // 从私钥提取公钥（简化版，实际需要解码）
  // 这里先用硬编码的地址进行演示
  const address = "7xK8..."; // 你需要从私钥提取实际地址

  // 连接到 Solana Devnet
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  try {
    // 获取 SOL 余额
    const balance = await connection.getBalance(new PublicKey(address));
    const balanceInSol = balance / LAMPORTS_PER_SOL;

    console.log(`📍 地址: ${address}`);
    console.log(`💰 SOL 余额: ${balanceInSol} SOL`);
    console.log(`   原始值: ${balance} lamports`);

    if (balance === 0) {
      console.log("\n❌ 余额为 0！");
      console.log("\n💡 获取测试 SOL:");
      console.log("   solana airdrop 1 " + address + " --url devnet");
      console.log("   或访问: https://faucet.solana.com/");
    } else if (balance < 0.01 * LAMPORTS_PER_SOL) {
      console.log("\n⚠️  余额较低，可能不足以支付交易费用");
    } else {
      console.log("\n✅ 余额充足");
    }

    console.log("\n" + "=".repeat(60));
  } catch (error) {
    console.error("❌ 检查余额失败:", error);
    process.exit(1);
  }
}

checkBalance();

