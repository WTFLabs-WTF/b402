#!/usr/bin/env node

/**
 * Solana 私钥提取工具
 * 
 * 功能：从 Solana keypair.json 文件提取 base58 格式的私钥
 * 用途：用于 x402 Solana 客户端的 SVM_PRIVATE_KEY 环境变量
 */

const fs = require('fs');
const path = require('path');

// 检查是否已安装 bs58
let bs58Encode, bs58Decode;
try {
  const bs58Module = require('bs58');
  // bs58 可能是默认导出或命名导出
  if (typeof bs58Module === 'function') {
    // 旧版本: bs58 本身就是 encode 函数
    bs58Encode = bs58Module;
  } else if (bs58Module.encode) {
    // 新版本: 有 encode 方法
    bs58Encode = bs58Module.encode;
    bs58Decode = bs58Module.decode;
  } else if (bs58Module.default) {
    // ES6 默认导出
    bs58Encode = bs58Module.default.encode || bs58Module.default;
  } else {
    throw new Error('无法识别 bs58 模块格式');
  }
} catch (error) {
  console.error('❌ 错误: 缺少 bs58 依赖');
  console.error('\n请先安装依赖:');
  console.error('  npm install bs58');
  console.error('或:');
  console.error('  pnpm install bs58');
  console.error('\n或者尝试使用 @noble/hashes:');
  console.error('  npm install @noble/hashes');
  process.exit(1);
}

// 获取 keypair 文件路径
const args = process.argv.slice(2);
let keypairPath;

if (args.length > 0) {
  // 使用命令行参数指定的路径
  keypairPath = args[0];
} else {
  // 使用默认路径
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  keypairPath = path.join(homeDir, '.config', 'solana', 'keypair.json');
}

// 展开路径中的 ~
if (keypairPath.startsWith('~')) {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  keypairPath = path.join(homeDir, keypairPath.slice(1));
}

console.log('🔑 Solana 私钥提取工具');
console.log('='.repeat(60));
console.log(`📂 读取文件: ${keypairPath}\n`);

// 检查文件是否存在
if (!fs.existsSync(keypairPath)) {
  console.error('❌ 错误: 文件不存在');
  console.error(`   路径: ${keypairPath}\n`);
  console.error('💡 使用方法:');
  console.error('   1. 使用默认路径: node extract-solana-key.js');
  console.error('   2. 指定路径: node extract-solana-key.js /path/to/keypair.json');
  console.error('   3. 生成新钱包: solana-keygen new --outfile keypair.json\n');
  process.exit(1);
}

try {
  // 读取 keypair 文件
  const keypairData = fs.readFileSync(keypairPath, 'utf8');
  const keypairArray = JSON.parse(keypairData);

  // 验证数据格式
  if (!Array.isArray(keypairArray)) {
    throw new Error('keypair.json 格式无效：应该是一个数组');
  }

  if (keypairArray.length !== 64) {
    throw new Error(`keypair.json 格式无效：数组长度应该是 64，实际是 ${keypairArray.length}`);
  }

  // 转换为 Buffer
  const keypairBuffer = Buffer.from(keypairArray);

  // 编码为 base58
  const privateKeyBase58 = bs58Encode(keypairBuffer);

  // 提取公钥（前 32 字节是私钥，后 32 字节是公钥）
  const publicKeyBuffer = keypairBuffer.slice(32);
  const publicKeyBase58 = bs58Encode(publicKeyBuffer);

  // 显示结果
  console.log('✅ 成功提取私钥!\n');
  console.log('='.repeat(60));
  console.log('📋 私钥信息:');
  console.log('='.repeat(60));
  console.log(`\n🔐 私钥 (base58):`);
  console.log(`${privateKeyBase58}\n`);
  console.log(`📍 公钥/地址 (base58):`);
  console.log(`${publicKeyBase58}\n`);
  console.log('='.repeat(60));
  console.log('💡 使用说明:');
  console.log('='.repeat(60));
  console.log('\n1. 将私钥添加到 .env 文件:');
  console.log(`   SVM_PRIVATE_KEY=${privateKeyBase58}\n`);
  console.log('2. 或者直接导出环境变量:');
  console.log(`   export SVM_PRIVATE_KEY="${privateKeyBase58}"\n`);
  console.log('⚠️  警告: 请妥善保管私钥，不要分享给他人！\n');

} catch (error) {
  console.error('❌ 错误:', error.message);
  console.error('\n请确保:');
  console.error('  1. 文件格式正确（JSON 数组）');
  console.error('  2. 数组包含 64 个数字（0-255）');
  console.error('  3. 文件由 solana-keygen 生成\n');
  process.exit(1);
}

