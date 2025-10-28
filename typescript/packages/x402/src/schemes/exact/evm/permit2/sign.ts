import { Chain, getAddress, Hex, keccak256, LocalAccount, toHex, Transport } from "viem";
import { getNetworkId } from "../../../../shared";
import {
  permit2Types,
  permit2WitnessTypes,
  permit2ABI,
  PERMIT2_ADDRESS,
  WITNESS_TYPE_STRING,
  isSignerWallet,
  SignerWallet,
} from "../../../../types/shared/evm";
import { Permit2EvmPayloadAuthorization, PaymentRequirements } from "../../../../types/verify";

/**
 * Signs a Permit2 authorization (PermitTransferFrom or PermitWitnessTransferFrom)
 *
 * Automatically detects witness mode based on the presence of the `to` field.
 * - If `to` is provided: Uses PermitWitnessTransferFrom (binds recipient to signature)
 * - If `to` is omitted: Uses PermitTransferFrom (legacy mode)
 *
 * @param walletClient - The wallet client that will sign the permit
 * @param params - The permit2 parameters
 * @param params.owner - The address of the token owner
 * @param params.spender - The address authorized to transfer tokens
 * @param params.token - The address of the token to transfer
 * @param params.amount - The amount of tokens to transfer (in base units)
 * @param params.deadline - Unix timestamp after which the permit is no longer valid
 * @param params.to - Optional recipient address for witness mode
 * @param paymentRequirements - The payment requirements containing network information
 * @param paymentRequirements.network - The network where the token exists
 * @returns The signature and nonce for the permit2
 */
export async function signPermit2<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  { owner, spender, token, amount, deadline, to }: Omit<Permit2EvmPayloadAuthorization, "nonce">,
  { network }: PaymentRequirements,
): Promise<{ signature: Hex; nonce: string }> {
  const chainId = getNetworkId(network);
  const tokenAddress = getAddress(token);
  const ownerAddress = getAddress(owner);
  const spenderAddress = getAddress(spender);

  // Generate a unique nonce for Permit2 SignatureTransfer
  const nonce = await createPermit2Nonce(walletClient, ownerAddress);

  // Detect witness mode based on the presence of the `to` field
  const hasWitness = !!to;

  const data = hasWitness
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
          amount: BigInt(amount),
        },
        spender: spenderAddress,
        nonce,
        deadline: BigInt(deadline),
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
          amount: BigInt(amount),
        },
        spender: spenderAddress,
        nonce,
        deadline: BigInt(deadline),
      },
    };

  if (isSignerWallet(walletClient)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signature = await walletClient.signTypedData(data as any);
    return {
      signature,
      nonce: nonce.toString(),
    };
  }

  // LocalAccount with signTypedData
  const account = walletClient as LocalAccount;
  if (account.signTypedData) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signature = await account.signTypedData(data as any);
    return {
      signature,
      nonce: nonce.toString(),
    };
  }

  throw new Error("Invalid wallet client provided does not support signTypedData");
}

/**
 * Generates a unique nonce for Permit2 SignatureTransfer
 * Uses timestamp-based approach with nonceBitmap verification
 *
 * @param walletClient - The wallet client used to check nonce bitmap
 * @param ownerAddress - The address of the token owner
 * @returns A unique nonce for the permit2 authorization
 */
export async function createPermit2Nonce<transport extends Transport, chain extends Chain>(
  walletClient: SignerWallet<chain, transport> | LocalAccount,
  ownerAddress: `0x${string}`,
): Promise<bigint> {
  if (!isSignerWallet(walletClient)) {
    throw new Error("Local account signing for permit2 requires a connected client");
  }

  // Generate a timestamp-based nonce for uniqueness
  // This ensures each permit has a unique nonce without requiring sequential ordering
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const randomOffset = BigInt(Math.floor(Math.random() * 1000)); // Add some randomness
  let nonce = timestamp * 1000n + randomOffset;

  // Optional: Check if this nonce is already used (though unlikely with timestamp-based approach)
  // This is more for demonstration - in practice, timestamp-based nonces are very unlikely to collide
  try {
    const wordPos = nonce / 256n;
    const bitIndex = nonce % 256n;
    const bitmap = await walletClient.readContract({
      address: PERMIT2_ADDRESS,
      abi: permit2ABI,
      functionName: "nonceBitmap",
      args: [ownerAddress, wordPos],
    });

    // Check if the specific bit is set (nonce is used)
    const used = ((bitmap as bigint) >> bitIndex) & 1n;
    if (used === 1n) {
      // If nonce is used, add a small increment to make it unique
      nonce += 1n;
    }
  } catch (error) {
    // If we can't check the bitmap, continue with the timestamp-based nonce
    // This is acceptable since timestamp-based nonces are very unlikely to collide
    console.warn("Could not check nonce bitmap, using timestamp-based nonce:", error);
  }

  return nonce;
}
