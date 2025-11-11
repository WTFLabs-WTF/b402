import { Account, Address, Chain, getAddress, Hex, Transport } from "viem";
import { getNetworkId } from "../../../../shared";
import { getERC20Balance, getVersion } from "../../../../shared/evm";
import {
  permitTypes,
  erc20PermitABI,
  ConnectedClient,
  SignerWallet,
} from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  PermitPaymentPayload,
  SettleResponse,
  VerifyResponse,
} from "../../../../types/verify";
import { SCHEME } from "../../../exact";
import { splitSignature } from "./sign";
import { EIP7702SellerWalletMinimalAbi } from "../../../../types/shared/evm";

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

// Interface ID for settleWithPermit
// bytes4(keccak256("settleWithPermit(address,address,uint256,uint256,uint8,bytes32,bytes32)"))
const SETTLE_WITH_PERMIT_INTERFACE_ID = "0x02ccc23e" as const;

/**
 * Verifies an EIP-2612 Permit payment payload
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing permit parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: PermitPaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Validate payload has correct authorizationType
  if (
    payload.payload.authorizationType !== "permit" ||
    payload.scheme !== SCHEME ||
    paymentRequirements.scheme !== SCHEME
  ) {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
    };
  }

  const permitPayload = payload.payload;
  const { owner, spender, value, deadline, nonce } = permitPayload.authorization;

  // Get token name for EIP-712 domain
  let name: string;
  let version: string;
  let erc20Address: Address;
  let chainId: number;

  try {
    chainId = getNetworkId(payload.network);
    erc20Address = paymentRequirements.asset as Address;
    name =
      paymentRequirements.extra?.name ??
      ((await client.readContract({
        address: erc20Address,
        abi: erc20PermitABI,
        functionName: "name",
      })) as string);
    version = paymentRequirements.extra?.version ?? (await getVersion(client, erc20Address));
  } catch {
    return {
      isValid: false,
      invalidReason: "invalid_network",
      payer: owner,
    };
  }

  // Verify permit signature
  const permitTypedData = {
    types: permitTypes,
    domain: {
      name: name,
      version: version,
      chainId,
      verifyingContract: erc20Address,
    },
    primaryType: "Permit" as const,
    message: {
      owner: getAddress(owner),
      spender: getAddress(spender),
      value: value,
      nonce: nonce,
      deadline: deadline,
    },
  };

  const recoveredAddress = await client.verifyTypedData({
    address: owner as Address,
    ...permitTypedData,
    signature: permitPayload.signature as Hex,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: "invalid_permit_signature",
      payer: owner,
    };
  }

  // Verify deadline hasn't passed
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(deadline) < now) {
    return {
      isValid: false,
      invalidReason: "permit_expired",
      payer: owner,
    };
  }

  // Verify spender matches the payTo address (7702 contract)
  // The client must authorize the 7702 contract (payTo address) as the spender
  if (getAddress(spender) !== getAddress(paymentRequirements.payTo as string)) {
    return {
      isValid: false,
      invalidReason: "invalid_spender_address",
      payer: owner,
    };
  }

  // Verify seller address supports settleWithPermit interface (ERC165)
  try {
    const supportsInterface = await client.readContract({
      address: paymentRequirements.payTo as Address,
      abi: ERC165_ABI,
      functionName: "supportsInterface",
      args: [SETTLE_WITH_PERMIT_INTERFACE_ID],
    });

    if (!supportsInterface) {
      return {
        isValid: false,
        invalidReason: "seller_does_not_support_settle_with_permit",
        payer: owner,
      };
    }
  } catch {
    return {
      isValid: false,
      invalidReason: "seller_interface_check_failed",
      payer: owner,
    };
  }

  // Verify owner has sufficient balance
  const balance = await getERC20Balance(client, erc20Address, owner as Address);
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: owner,
    };
  }

  // Verify value meets the required amount
  if (BigInt(value) < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "invalid_exact_evm_payload_authorization_value",
      payer: owner,
    };
  }

  return {
    isValid: true,
    payer: owner,
  };
}

/**
 * Settles an EIP-2612 Permit payment by calling permit() then transferFrom()
 *
 * @param wallet - The facilitator wallet that will execute the permit and transfer
 * @param paymentPayload - The signed payment payload containing permit parameters and signature
 * @param paymentRequirements - The payment requirements
 * @param gasPrice - Optional gas price in wei (defaults to 0.05 gwei)
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: PermitPaymentPayload,
  paymentRequirements: PaymentRequirements,
  gasPrice: bigint = 50000000n, // 0.05 gwei
): Promise<SettleResponse> {
  const permitPayload = paymentPayload.payload;

  if (permitPayload.authorizationType !== "permit") {
    return {
      success: false,
      errorReason: "invalid_authorization_type",
      transaction: "",
      network: paymentPayload.network,
      payer: "",
    };
  }

  // Re-verify to ensure the payment is still valid
  const valid = await verify(wallet, paymentPayload, paymentRequirements);

  if (!valid.isValid) {
    return {
      success: false,
      network: paymentPayload.network,
      transaction: "",
      errorReason: valid.invalidReason ?? "invalid_payment",
      payer: permitPayload.authorization.owner,
    };
  }

  const { owner, value, deadline } = permitPayload.authorization;
  const { v, r, s } = splitSignature(permitPayload.signature as Hex);
  const tokenAddress = paymentRequirements.asset as Address;

  // 调用 7702 合约的 settleWithPermit 方法
  // 7702 合约会处理 permit 和 transfer，并自动收取手续费
  const transactionHash = await wallet.writeContract({
    address: paymentRequirements.payTo as Address,
    abi: EIP7702SellerWalletMinimalAbi,
    functionName: "settleWithPermit",
    args: [
      tokenAddress, // token
      owner as Address, // payer
      BigInt(value), // amount
      BigInt(deadline), // deadline
      v, // v
      r, // r
      s, // s
    ],
    chain: wallet.chain as Chain,
    gasPrice,
  });

  // 等待交易确认
  const receipt = await wallet.waitForTransactionReceipt({ hash: transactionHash });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "transaction_failed",
      transaction: transactionHash,
      network: paymentPayload.network,
      payer: owner,
    };
  }

  return {
    success: true,
    transaction: transactionHash,
    network: paymentPayload.network,
    payer: owner,
  };
}
