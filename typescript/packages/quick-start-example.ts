/**
 * X402 快速启动示例
 * 
 * 这个文件展示了如何快速使用新创建的三个包
 * 
 * 运行前请确保：
 * 1. 已安装所有依赖：pnpm install
 * 2. 已构建所有包：pnpm -r build
 * 3. 配置了环境变量或直接在代码中设置地址
 */

import { Facilitator } from "@wtflabs/x402-facilitator";
import { X402PaymentSchema } from "@wtflabs/x402-schema";
import { X402Server } from "@wtflabs/x402-server";
import { createPublicClient, http } from "viem";
import { bscTestnet } from "viem/chains";

// ====== 配置部分 ======
const RECIPIENT_ADDRESS = "0x1234567890123456789012345678901234567890"; // 替换为你的商家地址
const TOKEN_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"; // 替换为 token 地址
const RESOURCE_URL = "http://localhost:3000/protected-resource";

// ====== 1. 创建 Facilitator ======
console.log("\n=== 1. 创建 Facilitator ===");
const facilitator = new Facilitator({
  recipientAddress: RECIPIENT_ADDRESS,
  // relayer: "0x...", // 可选
  waitUntil: "confirmed", // simulated | submitted | confirmed
});

console.log(`✓ Facilitator 已创建`);
console.log(`  - Recipient Address: ${facilitator.recipientAddress}`);
console.log(`  - Relayer: ${facilitator.relayer}`);
console.log(`  - Wait Until: ${facilitator.waitUntil}`);

// ====== 2. 创建 Schema ======
console.log("\n=== 2. 创建 Payment Schema ===");
const schema = new X402PaymentSchema({
  scheme: "exact",
  network: "bsc-testnet",
  maxAmountRequired: "100000", // 0.0001 token (假设 6 位小数)
  resource: RESOURCE_URL,
  description: "Access to protected resource with EIP-2612 Permit",
  mimeType: "application/json",
  payTo: RECIPIENT_ADDRESS,
  maxTimeoutSeconds: 3600,
  asset: TOKEN_ADDRESS,
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

console.log(`✓ Schema 已创建`);
console.log(`  - Scheme: ${schema.get("scheme")}`);
console.log(`  - Network: ${schema.get("network")}`);
console.log(`  - Max Amount: ${schema.get("maxAmountRequired")}`);
console.log(`  - Pay To: ${schema.get("payTo")}`);

// 验证 schema
try {
  schema.verify();
  console.log(`✓ Schema 验证通过`);
} catch (error) {
  console.error(`✗ Schema 验证失败:`, error);
}

// ====== 3. 创建 Viem Client ======
console.log("\n=== 3. 创建 Viem Public Client ===");
const client = createPublicClient({
  chain: bscTestnet,
  transport: http(), // 或使用自定义 RPC: http("https://...")
});

console.log(`✓ Public Client 已创建`);
console.log(`  - Chain: ${client.chain?.name}`);
console.log(`  - Chain ID: ${client.chain?.id}`);

// ====== 4. 创建 X402Server ======
console.log("\n=== 4. 创建 X402 Server ===");
const server = new X402Server({
  facilitator,
  schema,
  client,
});

console.log(`✓ Server 已创建`);

// ====== 5. 初始化 Server ======
console.log("\n=== 5. 初始化 Server ===");
const initResult = await server.initialize();

if (initResult.success) {
  console.log(`✓ Server 初始化成功`);

  // 检查 schema 的 extra 数据
  const extra = schema.getExtra();
  console.log(`  - Relayer (added to schema): ${extra?.relayer}`);
} else {
  console.error(`✗ Server 初始化失败:`, initResult.error);
  process.exit(1);
}

// ====== 6. 验证配置 ======
console.log("\n=== 6. 验证配置 ===");
const verifyResult = await server.verify();

if (verifyResult.success) {
  console.log(`✓ 配置验证通过`);
  console.log(`  - Network 匹配: ✓`);
  console.log(`  - Address 匹配: ✓`);
} else {
  console.error(`✗ 配置验证失败:`);
  verifyResult.errors?.forEach((error) => {
    console.error(`  - ${error}`);
  });
}

// ====== 7. 演示 Schema 操作 ======
console.log("\n=== 7. Schema 操作演示 ===");

// 修改配置
console.log(`修改 maxAmountRequired...`);
schema.set("maxAmountRequired", "200000");
console.log(`✓ 新的 maxAmountRequired: ${schema.get("maxAmountRequired")}`);

// 添加额外数据
console.log(`添加额外元数据...`);
schema.setExtra({
  ...schema.getExtra(),
  customField: "custom value",
  metadata: {
    version: "1.0.0",
    createdAt: new Date().toISOString(),
  },
});
console.log(`✓ Extra 数据:`, JSON.stringify(schema.getExtra(), null, 2));

// 获取完整配置
const fullConfig = schema.getConfig();
console.log(`\n完整 Schema 配置:`);
console.log(JSON.stringify(fullConfig, null, 2));

// ====== 8. 演示 Facilitator 操作 ======
console.log("\n=== 8. Facilitator 操作演示 ===");

// 查询支持的支付类型
console.log(`查询支持的支付类型...`);
try {
  const supported = await facilitator.supported();
  console.log(`✓ 支持的支付类型数量: ${supported.kinds.length}`);

  // 带过滤条件查询
  const filteredSupported = await facilitator.supported({
    chainId: 97, // BSC Testnet
  });
  console.log(`✓ BSC Testnet 支持的支付类型: ${filteredSupported.kinds.length}`);
} catch (error) {
  console.log(`⚠ 无法连接到 Facilitator 服务 (这是正常的，如果还没有部署)`);
}

// ====== 9. 总结 ======
console.log("\n=== 总结 ===");
console.log(`✓ 所有组件已成功初始化和验证`);
console.log(`\n下一步：`);
console.log(`  1. 在服务端使用 server.verifyPayment() 验证支付`);
console.log(`  2. 使用 server.settle() 结算支付`);
console.log(`  3. 查看 INTEGRATION_EXAMPLE.md 了解完整的集成示例`);
console.log(`\n运行服务器示例：`);
console.log(`  cd packages`);
console.log(`  查看 INTEGRATION_EXAMPLE.md 中的完整服务器示例`);

// ====== 10. 导出配置（用于其他地方使用）======
console.log("\n=== 10. 导出配置 ===");

export const config = {
  facilitator,
  schema,
  server,
  client,
};

console.log(`✓ 配置已导出，可以在其他文件中导入使用`);
console.log(`\n示例使用完成！\n`);

