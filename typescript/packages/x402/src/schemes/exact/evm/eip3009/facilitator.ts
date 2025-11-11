import {
  Account,
  Address,
  Chain,
  getAddress,
  Hex,
  parseErc6492Signature,
  Transport,
  hexToSignature,
} from "viem";
import { getNetworkId } from "../../../../shared";
import { getVersion, getERC20Balance } from "../../../../shared/evm";
import {
  authorizationTypes,
  config,
  ConnectedClient,
  SignerWallet,
  EIP7702SellerWalletMinimalAbi,
} from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
  ExactEvmPayload,
  Eip3009PaymentPayload,
} from "../../../../types/verify";
import { SCHEME } from "../../../exact";

// ERC165 ABI for supportsInterface
const ERC165_ABI = [
  {
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Interface ID for settleWithERC3009
// bytes4(keccak256("settleWithERC3009(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)"))
const SETTLE_WITH_ERC3009_INTERFACE_ID = "0x1fe200d9" as const;

// Native EIP-3009 transferWithAuthorization ABI
// Function selector: 0xe3ee160e
const TRANSFER_WITH_AUTHORIZATION_ABI = [
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "validAfter", type: "uint256" },
      { internalType: "uint256", name: "validBefore", type: "uint256" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "transferWithAuthorization",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * Verifies an EIP-3009 payment payload against the required payment details
 *
 * This function performs several verification steps:
 * - Verifies protocol version compatibility
 * - Validates the permit signature
 * - Confirms USDC contract address is correct for the chain
 * - Checks permit deadline is sufficiently in the future
 * - Verifies client has sufficient USDC balance
 * - Ensures payment amount meets required minimum
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing transfer parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A ValidPaymentRequest indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: Eip3009PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  const exactEvmPayload = payload.payload as ExactEvmPayload;

  // Verify this is EIP-3009
  if (exactEvmPayload.authorizationType !== "eip3009") {
    return {
      isValid: false,
      invalidReason: "unsupported_authorization_type",
      payer: "",
    };
  }

  /* TODO: work with security team on brainstorming more verification steps
  verification steps for EIP-3009:
    - ✅ verify payload version
    - ✅ verify usdc address is correct for the chain
    - ✅ verify permit signature
    - ✅ verify deadline
    - verify nonce is current
    - ✅ verify client has enough funds to cover paymentRequirements.maxAmountRequired
    - ✅ verify value in payload is enough to cover paymentRequirements.maxAmountRequired
    - check min amount is above some threshold we think is reasonable for covering gas
    - verify resource is not already paid for (next version)
    */

  // Verify payload version
  if (payload.scheme !== SCHEME || paymentRequirements.scheme !== SCHEME) {
    return {
      isValid: false,
      invalidReason: `unsupported_scheme`,
      payer: exactEvmPayload.authorization.from,
    };
  }

  let name: string;
  let chainId: number;
  let erc20Address: Address;
  let version: string;
  try {
    chainId = getNetworkId(payload.network);
    name = paymentRequirements.extra?.name ?? config[chainId.toString()].usdcName;
    erc20Address = paymentRequirements.asset as Address;
    version = paymentRequirements.extra?.version ?? (await getVersion(client, erc20Address));
  } catch {
    return {
      isValid: false,
      invalidReason: `invalid_network`,
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify permit signature is recoverable for the owner address
  const permitTypedData = {
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    domain: {
      name,
      version,
      chainId,
      verifyingContract: erc20Address,
    },
    message: {
      from: exactEvmPayload.authorization.from,
      to: exactEvmPayload.authorization.to,
      value: exactEvmPayload.authorization.value,
      validAfter: exactEvmPayload.authorization.validAfter,
      validBefore: exactEvmPayload.authorization.validBefore,
      nonce: exactEvmPayload.authorization.nonce,
    },
  };
  const recoveredAddress = await client.verifyTypedData({
    address: exactEvmPayload.authorization.from as Address,
    ...permitTypedData,
    signature: exactEvmPayload.signature as Hex,
  });
  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_signature", //"Invalid permit signature",
      payer: exactEvmPayload.authorization.from,
    };
  }

  // Verify that payment was made to the correct address (7702 contract)
  if (getAddress(exactEvmPayload.authorization.to) !== getAddress(paymentRequirements.payTo)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_recipient_mismatch",
      payer: exactEvmPayload.authorization.from,
    };
  }

  // Verify deadline is not yet expired
  // Pad 3 block to account for round tripping
  if (
    BigInt(exactEvmPayload.authorization.validBefore) < BigInt(Math.floor(Date.now() / 1000) + 6)
  ) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_before", //"Deadline on permit isn't far enough in the future",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify deadline is not yet valid
  if (BigInt(exactEvmPayload.authorization.validAfter) > BigInt(Math.floor(Date.now() / 1000))) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_valid_after", //"Deadline on permit is in the future",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify client has enough funds to cover paymentRequirements.maxAmountRequired
  const balance = await getERC20Balance(
    client,
    erc20Address,
    exactEvmPayload.authorization.from as Address,
  );
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds", //"Client does not have enough funds",
      payer: exactEvmPayload.authorization.from,
    };
  }
  // Verify value in payload is enough to cover paymentRequirements.maxAmountRequired
  if (BigInt(exactEvmPayload.authorization.value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value", //"Value in payload is not enough to cover paymentRequirements.maxAmountRequired",
      payer: exactEvmPayload.authorization.from,
    };
  }
  return {
    isValid: true,
    invalidReason: undefined,
    payer: exactEvmPayload.authorization.from,
  };
}

/**
 * Settles an EIP-3009 payment by executing a USDC transferWithAuthorization transaction
 *
 * This function executes the actual USDC transfer using the signed authorization from the user.
 * The facilitator wallet submits the transaction but does not need to hold or transfer any tokens itself.
 *
 * @param wallet - The facilitator wallet that will submit the transaction
 * @param paymentPayload - The signed payment payload containing the transfer parameters and signature
 * @param paymentRequirements - The original payment details that were used to create the payload
 * @param gasPrice - Optional gas price in wei (defaults to 0.05 gwei)
 * @returns A PaymentExecutionResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: Eip3009PaymentPayload,
  paymentRequirements: PaymentRequirements,
  gasPrice: bigint = 50000000n, // 0.05 gwei
): Promise<SettleResponse> {
  const payload = paymentPayload.payload as ExactEvmPayload;

  // Verify this is EIP-3009
  if (payload.authorizationType !== "eip3009") {
    return {
      success: false,
      errorReason: "unsupported_authorization_type",
      transaction: "",
      network: paymentPayload.network,
      payer: "",
    };
  }

  // re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_scheme", //`Payment is no longer valid: ${valid.invalidReason}`,
      payer: payload.authorization.from,
    };
  }

  // Returns the original signature (no-op) if the signature is not a 6492 signature
  const { signature } = parseErc6492Signature(payload.signature as Hex);

  // Check if payTo address supports settleWithERC3009 interface (ERC165)
  let supportsSettleWithERC3009 = false;
  try {
    supportsSettleWithERC3009 = await wallet.readContract({
      address: paymentRequirements.payTo as Address,
      abi: ERC165_ABI,
      functionName: "supportsInterface",
      args: [SETTLE_WITH_ERC3009_INTERFACE_ID],
    });
  } catch {
    // If ERC165 check fails, assume it doesn't support the interface
    supportsSettleWithERC3009 = false;
  }

  // 拆分签名为 v, r, s（两种调用方式都需要）
  const sig = hexToSignature(signature);
  const v = Number(sig.v); // 确保 v 是 number 类型 (uint8)
  const r = sig.r;
  const s = sig.s;

  let tx: Hex;

  if (supportsSettleWithERC3009) {
    // console.log("走了合约");
    // Use 7702 contract call with settleWithERC3009
    // 调用 7702 合约的 settleWithERC3009 方法
    // 7702 合约会处理 transferWithAuthorization，并自动收取手续费
    tx = await wallet.writeContract({
      address: paymentRequirements.payTo as Address,
      abi: EIP7702SellerWalletMinimalAbi,
      functionName: "settleWithERC3009",
      args: [
        paymentRequirements.asset as Address, // token
        payload.authorization.from as Address, // payer
        BigInt(payload.authorization.value), // amount
        BigInt(payload.authorization.validAfter), // validAfter
        BigInt(payload.authorization.validBefore), // validBefore
        payload.authorization.nonce as Hex, // nonce
        v, // v (uint8)
        r, // r (bytes32)
        s, // s (bytes32)
      ],
      chain: wallet.chain as Chain,
      gasPrice,
    });
  } else {
    // console.log("没走合约");
    // Use native EIP-3009 transferWithAuthorization
    // Call transferWithAuthorization on the token contract directly
    tx = await wallet.writeContract({
      address: paymentRequirements.asset as Address,
      abi: TRANSFER_WITH_AUTHORIZATION_ABI,
      functionName: "transferWithAuthorization",
      args: [
        payload.authorization.from as Address, // from
        paymentRequirements.payTo as Address, // to (payment recipient)
        BigInt(payload.authorization.value), // value
        BigInt(payload.authorization.validAfter), // validAfter
        BigInt(payload.authorization.validBefore), // validBefore
        payload.authorization.nonce as Hex, // nonce
        v, // v (uint8)
        r, // r (bytes32)
        s, // s (bytes32)
      ],
      chain: wallet.chain as Chain,
      gasPrice,
    });
  }

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "invalid_transaction_state", //`Transaction failed`,
      transaction: tx,
      network: paymentPayload.network,
      payer: payload.authorization.from,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: payload.authorization.from,
  };
}
