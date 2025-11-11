import {
  Account,
  Address,
  Chain,
  encodeAbiParameters,
  getAddress,
  Hex,
  keccak256,
  Transport,
} from "viem";
import { getNetworkId } from "../../../../shared";
import { getERC20Balance, getERC20Allowance } from "../../../../shared/evm";
import {
  permit2Types,
  permit2WitnessTypes,
  permit2ABI,
  PERMIT2_ADDRESS,
  WITNESS_TYPE_STRING,
  ConnectedClient,
  SignerWallet,
} from "../../../../types/shared/evm";
import {
  PaymentRequirements,
  Permit2PaymentPayload,
  SettleResponse,
  VerifyResponse,
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

// Interface ID for settleWithPermit2
// bytes4(keccak256("settleWithPermit2(((address,uint256),uint256,uint256),address,bytes)"))
const SETTLE_WITH_PERMIT2_INTERFACE_ID = "0xa7fcafbb" as const;

/**
 * Verifies a Permit2 payment payload (with or without witness)
 *
 * Supports both witness and non-witness modes:
 * - Witness mode: Verifies that the recipient address is bound to the signature
 * - Non-witness mode: Uses standard PermitTransferFrom verification
 *
 * @param client - The public client used for blockchain interactions
 * @param payload - The signed payment payload containing permit2 parameters and signature
 * @param paymentRequirements - The payment requirements that the payload must satisfy
 * @returns A VerifyResponse indicating if the payment is valid and any invalidation reason
 */
export async function verify<
  transport extends Transport,
  chain extends Chain,
  account extends Account | undefined,
>(
  client: ConnectedClient<transport, chain, account>,
  payload: Permit2PaymentPayload,
  paymentRequirements: PaymentRequirements,
): Promise<VerifyResponse> {
  // Validate payload has correct authorizationType
  if (
    payload.payload.authorizationType !== "permit2" ||
    payload.scheme !== SCHEME ||
    paymentRequirements.scheme !== SCHEME
  ) {
    return {
      isValid: false,
      invalidReason: "unsupported_scheme",
    };
  }

  const permit2Payload = payload.payload;
  const { owner, spender, token, amount, deadline, nonce, to } = permit2Payload.authorization;

  const chainId = getNetworkId(payload.network);
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);

  // Detect witness mode based on the presence of the `to` field
  const hasWitness = !!to;

  // If witness mode is enabled, verify that `to` matches `payTo`
  if (hasWitness) {
    if (getAddress(to!) !== getAddress(paymentRequirements.payTo as string)) {
      return {
        isValid: false,
        invalidReason: "witness_recipient_mismatch",
        payer: owner,
      };
    }
  }

  // Verify permit2 signature (witness or non-witness)
  const permit2TypedData = hasWitness
    ? {
      types: permit2WitnessTypes,
      domain: {
        name: "Permit2",
        chainId,
        verifyingContract: PERMIT2_ADDRESS,
      },
      primaryType: "PermitWitnessTransferFrom" as const,
      message: {
        permitted: {
          token: tokenAddress,
          amount,
        },
        spender: getAddress(spender),
        nonce,
        deadline,
        witness: {
          to: getAddress(to!),
        },
      },
    }
    : {
      types: permit2Types,
      domain: {
        name: "Permit2",
        chainId,
        verifyingContract: PERMIT2_ADDRESS,
      },
      primaryType: "PermitTransferFrom" as const,
      message: {
        permitted: {
          token: tokenAddress,
          amount,
        },
        spender: getAddress(spender),
        nonce,
        deadline,
      },
    };

  const recoveredAddress = await client.verifyTypedData({
    address: ownerAddress,
    ...permit2TypedData,
    signature: permit2Payload.signature as Hex,
  });

  if (!recoveredAddress) {
    return {
      isValid: false,
      invalidReason: hasWitness ? "invalid_permit2_witness_signature" : "invalid_permit2_signature",
      payer: owner,
    };
  }

  // Verify deadline hasn't passed
  const now = Math.floor(Date.now() / 1000);
  if (BigInt(deadline) < now) {
    return {
      isValid: false,
      invalidReason: "permit2_expired",
      payer: owner,
    };
  }

  // Verify spender matches the facilitator's wallet address
  // In x402, the facilitator acts as the spender to execute permitTransferFrom
  // The client must authorize the facilitator's wallet address as the spender
  if (client.account && getAddress(spender) !== getAddress(client.account.address)) {
    return {
      isValid: false,
      invalidReason: "invalid_spender_address",
      payer: owner,
    };
  }

  // Verify token address matches payment requirements
  if (tokenAddress.toLowerCase() !== (paymentRequirements.asset as string).toLowerCase()) {
    return {
      isValid: false,
      invalidReason: "token_mismatch",
      payer: owner,
    };
  }

  // Verify seller address supports settleWithPermit2 interface (ERC165)
  try {
    const supportsInterface = await client.readContract({
      address: paymentRequirements.payTo as Address,
      abi: ERC165_ABI,
      functionName: "supportsInterface",
      args: [SETTLE_WITH_PERMIT2_INTERFACE_ID],
    });

    if (!supportsInterface) {
      return {
        isValid: false,
        invalidReason: "seller_does_not_support_settle_with_permit2",
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

  // Verify owner has approved Permit2 contract
  // This is a critical check - users must approve Uniswap Permit2 once before using it
  const allowance = await getERC20Allowance(client, tokenAddress, ownerAddress, PERMIT2_ADDRESS);
  if (allowance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "permit2_not_approved",
      payer: owner,
    };
  }

  // Verify owner has sufficient token balance
  const balance = await getERC20Balance(client, tokenAddress, ownerAddress);
  if (balance < BigInt(paymentRequirements.maxAmountRequired)) {
    return {
      isValid: false,
      invalidReason: "insufficient_funds",
      payer: owner,
    };
  }

  // Verify amount meets the required amount
  if (BigInt(amount) < BigInt(paymentRequirements.maxAmountRequired)) {
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
 * Settles a Permit2 payment by calling permitTransferFrom() or permitWitnessTransferFrom()
 *
 * Automatically selects the appropriate function based on whether the payment includes
 * a witness (recipient address binding).
 *
 * @param wallet - The facilitator wallet that will execute the permit transfer
 * @param paymentPayload - The signed payment payload containing permit2 parameters and signature
 * @param paymentRequirements - The payment requirements
 * @param gasPrice - Optional gas price in wei (defaults to 0.05 gwei)
 * @returns A SettleResponse containing the transaction status and hash
 */
export async function settle<transport extends Transport, chain extends Chain>(
  wallet: SignerWallet<chain, transport>,
  paymentPayload: Permit2PaymentPayload,
  paymentRequirements: PaymentRequirements,
  gasPrice: bigint = 50000000n, // 0.05 gwei
): Promise<SettleResponse> {
  const permit2Payload = paymentPayload.payload;

  if (permit2Payload.authorizationType !== "permit2") {
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
      payer: permit2Payload.authorization.owner,
    };
  }

  const { owner, token, amount, deadline, nonce, to } = permit2Payload.authorization;
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);

  // Detect witness mode
  const hasWitness = !!to;

  // Call permitTransferFrom or permitWitnessTransferFrom on Permit2 contract
  const tx = hasWitness
    ? await wallet.writeContract({
      address: PERMIT2_ADDRESS,
      abi: permit2ABI,
      functionName: "permitWitnessTransferFrom",
      args: [
        {
          permitted: {
            token: tokenAddress,
            amount: BigInt(amount),
          },
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        },
        {
          to: paymentRequirements.payTo as Address,
          requestedAmount: BigInt(amount),
        },
        ownerAddress,
        keccak256(encodeAbiParameters([{ type: "address", name: "to" }], [getAddress(to!)])),
        WITNESS_TYPE_STRING,
        permit2Payload.signature as Hex,
      ],
      chain: wallet.chain as Chain,
      gasPrice,
    })
    : await wallet.writeContract({
      address: PERMIT2_ADDRESS,
      abi: permit2ABI,
      functionName: "permitTransferFrom",
      args: [
        {
          permitted: {
            token: tokenAddress,
            amount: BigInt(amount),
          },
          nonce: BigInt(nonce),
          deadline: BigInt(deadline),
        },
        {
          to: paymentRequirements.payTo as Address,
          requestedAmount: BigInt(amount),
        },
        ownerAddress,
        permit2Payload.signature as Hex,
      ],
      chain: wallet.chain as Chain,
      gasPrice,
    });

  const receipt = await wallet.waitForTransactionReceipt({ hash: tx });

  if (receipt.status !== "success") {
    return {
      success: false,
      errorReason: "transaction_failed",
      transaction: tx,
      network: paymentPayload.network,
      payer: owner,
    };
  }

  return {
    success: true,
    transaction: tx,
    network: paymentPayload.network,
    payer: owner,
  };
}
