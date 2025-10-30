"use client";

import { useState } from "react";
import {
  createWalletClient,
  http,
  type Address,
  type Hex,
  parseUnits,
  createPublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");

  const fetchProtectedResource = async () => {
    setLoading(true);
    setError("");
    setResult("");

    try {
      if (!privateKey || !privateKey.startsWith("0x")) {
        throw new Error("请输入有效的私钥（以 0x 开头）");
      }

      const account = privateKeyToAccount(privateKey as Hex);
      const walletClient = createWalletClient({
        account,
        chain: bscTestnet,
        transport: http(),
      });

      const publicClient = createPublicClient({
        chain: bscTestnet,
        transport: http(),
      });

      // 从服务器获取支付要求
      const requirementsResponse = await fetch("/api/protected", {
        method: "GET",
      });

      if (requirementsResponse.status !== 402) {
        const data = await requirementsResponse.json();
        setResult(JSON.stringify(data, null, 2));
        return;
      }

      const x402Header = requirementsResponse.headers.get("X-402");
      if (!x402Header) {
        throw new Error("服务器未返回 X-402 支付要求");
      }

      const paymentSchema = JSON.parse(x402Header);
      console.log("支付要求:", paymentSchema);

      // 准备支付参数
      const tokenAddress = paymentSchema.asset as Address;
      const amount = BigInt(paymentSchema.maxAmountRequired);
      const recipientAddress = paymentSchema.extra?.recipientAddress as Address;
      const relayer = paymentSchema.extra?.relayer as Address;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // 获取 nonce
      const nonce = await publicClient.readContract({
        address: tokenAddress,
        abi: [
          {
            inputs: [{ name: "owner", type: "address" }],
            name: "nonces",
            outputs: [{ name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "nonces",
        args: [account.address],
      });

      // 获取代币名称和版本
      const [tokenName, tokenVersion] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress,
          abi: [
            {
              inputs: [],
              name: "name",
              outputs: [{ name: "", type: "string" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "name",
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: [
            {
              inputs: [],
              name: "version",
              outputs: [{ name: "", type: "string" }],
              stateMutability: "view",
              type: "function",
            },
          ],
          functionName: "version",
        }).catch(() => "1"),
      ]);

      // 签名 Permit
      const domain = {
        name: tokenName as string,
        version: tokenVersion as string,
        chainId: bscTestnet.id,
        verifyingContract: tokenAddress,
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };

      const message = {
        owner: account.address,
        spender: relayer,
        value: amount,
        nonce: nonce as bigint,
        deadline,
      };

      const signature = await walletClient.signTypedData({
        account,
        domain,
        types,
        primaryType: "Permit",
        message,
      });

      // 构造支付载荷
      const paymentPayload = {
        x402Version: 1,
        scheme: "exact",
        network: "bsc-testnet",
        payload: {
          authorizationType: "permit",
          signature,
          authorization: {
            owner: account.address,
            spender: relayer,
            value: amount.toString(),
            deadline: deadline.toString(),
            nonce: nonce.toString(),
          },
        },
      };

      // 发送支付并获取资源
      const resourceResponse = await fetch("/api/protected", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-402-Payment": JSON.stringify(paymentPayload),
        },
      });

      if (!resourceResponse.ok) {
        const errorData = await resourceResponse.json();
        throw new Error(errorData.error || "支付失败");
      }

      const data = await resourceResponse.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err: any) {
      console.error("错误:", err);
      setError(err.message || "未知错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">
          X402 Next.js Demo
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">支付访问受保护资源</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            这个演示展示了如何使用 X402 协议通过 ERC-20 Permit 签名支付来访问受保护的 API 资源。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                私钥 (用于签名)
              </label>
              <input
                type="password"
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600"
              />
              <p className="text-sm text-gray-500 mt-1">
                请确保该账户在 BSC Testnet 上有足够的 USDC
              </p>
            </div>

            <button
              onClick={fetchProtectedResource}
              disabled={loading || !privateKey}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? "处理中..." : "支付并获取资源"}
            </button>
          </div>

          {result && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2 text-green-600">
                成功响应:
              </h3>
              <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-auto text-sm">
                {result}
              </pre>
            </div>
          )}

          {error && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2 text-red-600">
                错误:
              </h3>
              <pre className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg overflow-auto text-sm text-red-700 dark:text-red-300">
                {error}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4">配置信息</h3>
          <ul className="space-y-2 text-sm">
            <li><strong>网络:</strong> BSC Testnet</li>
            <li><strong>代币:</strong> USDC (0x03db069489e2caa4e51ed149e83d732ef3931670)</li>
            <li><strong>支付金额:</strong> 0.05 USDC</li>
            <li><strong>接收者:</strong> {process.env.NEXT_PUBLIC_RECIPIENT_ADDRESS || "未配置"}</li>
            <li><strong>中继器:</strong> 0x877D0A51a37178b5F34Ffb68a5c2beD0ff46D432</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

