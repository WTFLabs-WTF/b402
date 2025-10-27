import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { http, publicActions, createPublicClient, createWalletClient, Hex, formatUnits } from "viem";

// --- Load .env ---
const __filename_env = fileURLToPath(import.meta.url);
const __dirname_env = path.dirname(__filename_env);
const envPath = path.resolve(__dirname_env, "./.env");
dotenv.config({ path: envPath });

// --- Environment Variable Checks ---
let clientPrivateKey = process.env.CLIENT_PRIVATE_KEY as Hex | undefined;
if (clientPrivateKey && !clientPrivateKey.startsWith("0x")) {
  clientPrivateKey = "0x" + clientPrivateKey;
}

const providerUrl = process.env.PROVIDER_URL;

if (!clientPrivateKey || !providerUrl) {
  console.error("Missing PRIVATE_KEY or PROVIDER_URL in .env file");
  process.exit(1);
}

// --- USDC 合约地址 (Base 主网) ---
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Hex;
const PAY_TO_ADDRESS = "0xE25b1B2a8328f07D93F7d436F3375bE4F4DeF8Cf" as Hex;

// ERC20 ABI (只需要需要的函数)
const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
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
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// --- Viem Client Setup ---
const clientAccount = privateKeyToAccount(clientPrivateKey as Hex);

const publicClient = createPublicClient({
  chain: base,
  transport: http(providerUrl),
});

async function checkWallet() {
  console.log("\n🔍 钱包诊断工具");
  console.log("=".repeat(50));
  console.log(`\n钱包地址: ${clientAccount.address}`);
  console.log(`USDC 合约: ${USDC_ADDRESS}`);
  console.log(`支付接收方: ${PAY_TO_ADDRESS}`);
  console.log(`\n检查中...\n`);

  try {
    // 1. 检查 ETH 余额
    const ethBalance = await publicClient.getBalance({
      address: clientAccount.address,
    });
    console.log(`💰 ETH 余额: ${formatUnits(ethBalance, 18)} ETH`);

    if (ethBalance === 0n) {
      console.log("   ⚠️  警告: ETH 余额为 0，无法支付 gas 费！");
    } else if (ethBalance < 10000000000000000n) { // < 0.01 ETH
      console.log("   ⚠️  警告: ETH 余额较低，可能不足以支付 gas 费");
    } else {
      console.log("   ✅ ETH 余额充足");
    }

    // 2. 检查 USDC 余额
    const usdcBalance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [clientAccount.address],
    });

    const decimals = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "decimals",
    });

    console.log(`\n💵 USDC 余额: ${formatUnits(usdcBalance as bigint, decimals)} USDC`);
    console.log(`   原始值: ${usdcBalance} (最小单位)`);

    const requiredAmount = 1000000n; // 1 USDC
    if ((usdcBalance as bigint) < requiredAmount) {
      console.log(`   ❌ 不足！需要至少 ${formatUnits(requiredAmount, decimals)} USDC`);
      console.log(`   缺少: ${formatUnits(requiredAmount - (usdcBalance as bigint), decimals)} USDC`);
    } else {
      console.log(`   ✅ 余额充足（需要 ${formatUnits(requiredAmount, decimals)} USDC）`);
    }

    // 3. 检查 USDC 授权额度
    const allowance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [clientAccount.address, PAY_TO_ADDRESS],
    });

    console.log(`\n🔐 USDC 授权额度: ${formatUnits(allowance as bigint, decimals)} USDC`);
    console.log(`   原始值: ${allowance} (最小单位)`);

    if ((allowance as bigint) < requiredAmount) {
      console.log(`   ❌ 授权不足！需要授权至少 ${formatUnits(requiredAmount, decimals)} USDC 给 ${PAY_TO_ADDRESS}`);
      console.log(`\n   💡 解决方法: 需要先调用 approve 函数授权 USDC`);
    } else {
      console.log(`   ✅ 授权充足`);
    }

    // 总结
    console.log("\n" + "=".repeat(50));
    console.log("📋 诊断总结:");
    console.log("=".repeat(50));

    const hasEth = ethBalance > 0n;
    const hasUsdc = (usdcBalance as bigint) >= requiredAmount;
    const hasAllowance = (allowance as bigint) >= requiredAmount;

    if (hasEth && hasUsdc && hasAllowance) {
      console.log("✅ 所有检查通过！钱包可以正常支付");
    } else {
      console.log("❌ 发现问题:");
      if (!hasEth) console.log("   - ETH 余额不足");
      if (!hasUsdc) console.log("   - USDC 余额不足");
      if (!hasAllowance) console.log("   - USDC 授权不足");

      console.log("\n💡 建议:");
      if (!hasEth) {
        console.log("   1. 向钱包充值 ETH（用于支付 gas）");
      }
      if (!hasUsdc) {
        console.log(`   2. 向钱包充值至少 1 USDC`);
      }
      if (!hasAllowance) {
        console.log(`   3. 授权 USDC 给支付合约 ${PAY_TO_ADDRESS}`);
      }
    }

  } catch (error) {
    console.error("\n❌ 检查过程中出错:", error);
    process.exit(1);
  }
}

checkWallet();

