# Permit2 Universal Token Approvals Example

This example demonstrates how to use the x402 protocol with **Uniswap Permit2**, which provides universal token approvals for **any ERC20 token**.

## What is Permit2?

Permit2 is a token approval contract deployed by Uniswap at a canonical address on all chains:
```
0x000000000022D473030F116dDEE9F6B43aC78BA3
```

### Key Features

✅ **Universal Support** - Works with ANY ERC20 token, even without native permit support  
✅ **Single Approval** - Users approve Permit2 once, then use signatures for transfers  
✅ **Batch Operations** - Can transfer multiple tokens in one transaction  
✅ **Expiring Approvals** - Built-in expiration for better security  
✅ **No Token Modifications** - Works with existing ERC20 contracts  

## Comparison

| Feature | EIP-3009 | EIP-2612 | **Permit2** |
|---------|----------|----------|-------------|
| **Token Support** | USDC only | Modern ERC20 | **ANY ERC20** |
| **Setup Required** | None | None | **One-time approval** |
| **Transactions** | 1 | 2 | **1** (after approval) |
| **Security** | ✅ High | ✅ High | **✅✅ Highest** |
| **Gas Cost** | Lowest | Medium | **Medium** |

## Architecture

```
┌─────────┐                   ┌──────────────┐
│  User   │──approve once────>│   Permit2    │
│         │                   │   Contract   │
└─────────┘                   └──────────────┘
     │                                │
     │ Sign Permit                    │
     │ (off-chain)                    │
     ▼                                │
┌─────────────┐                       │
│ x402 Client │                       │
└─────────────┘                       │
     │                                │
     │ X-PAYMENT header               │
     ▼                                ▼
┌──────────────┐          ┌────────────────────┐
│ Facilitator  │─────────>│  ERC20 Token       │
│              │ transfer │  (any token!)      │
└──────────────┘          └────────────────────┘
```

## Setup

### 1. One-Time Approval (Required First Time)

Before using Permit2, users must approve the Permit2 contract to spend their tokens:

```typescript
// Approve Permit2 to spend your tokens
await token.approve(
  "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  MaxUint256
);
```

This only needs to be done **once per token**.

### 2. Install Dependencies

```bash
cd examples/typescript
pnpm install
pnpm build
```

### 3. Configure Environment

```bash
cp .env-local .env
```

Edit `.env`:
```
CLIENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
PROVIDER_URL=
```

### 4. Run Facilitator

```bash
cd ../facilitator
pnpm dev
```

## Running the Examples

### Basic Permit2 Example
```bash
pnpm run client
```

### Permit2 WITH WITNESS Example 🛡️
```bash
pnpm run client:witness
```

The witness example demonstrates enhanced security by binding the recipient address to the signature.

## How It Works

### 1. Sign Permit2 Authorization (Off-chain)

```typescript
const signature = await wallet.signTypedData({
  domain: {
    name: "Permit2",
    chainId,
    verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  },
  types: {
    PermitTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  },
  message: {
    permitted: {
      token: tokenAddress,
      amount: paymentAmount,
    },
    spender: facilitatorAddress,
    nonce: currentNonce,
    deadline: expirationTime,
  },
});
```

### 2. Create x402 Payment Header

```typescript
const paymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base",
  payload: {
    authorizationType: "permit2",
    signature,
    authorization: {
      owner: clientAddress,
      spender: facilitatorAddress,
      token: tokenAddress,
      amount: paymentAmount,
      deadline: expirationTime,
      nonce: currentNonce,
    },
  },
};
```

### 3. Facilitator Settles Payment

The facilitator calls Permit2's `permitTransferFrom`:

```solidity
function permitTransferFrom(
  PermitTransferFrom memory permit,
  SignatureTransferDetails calldata transferDetails,
  address owner,
  bytes calldata signature
)
```

This transfers tokens directly from the user to the payee in **one transaction**.

## Supported Tokens

Permit2 works with **ANY ERC20 token**, including:
- USDC, USDT, DAI
- WETH, WBTC
- UNI, AAVE, COMP
- Custom tokens
- **Even tokens without native permit support!**

## Advantages

✅ **Universal** - Works with any ERC20  
✅ **Efficient** - One transaction after initial approval  
✅ **Secure** - Expiring approvals reduce risk  
✅ **Future-proof** - Standard adopted by major protocols  
✅ **Batch Support** - Can transfer multiple tokens at once  

## Disadvantages

⚠️ **Initial Approval** - Requires one-time on-chain approval  
⚠️ **Complexity** - More complex than simple permit  
⚠️ **Gas** - Slightly higher gas than EIP-3009  

## Security Considerations

1. **Expiring Approvals** - Set reasonable deadlines
2. **Nonce Management** - Permit2 tracks nonces to prevent replays
3. **Signature Validation** - Always verify signatures match expected owner
4. **Amount Limits** - Request only what's needed

## Resources

- [Permit2 Documentation](https://github.com/Uniswap/permit2)
- [Permit2 Contract Address](https://etherscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3)
- [Integration Guide](https://docs.uniswap.org/contracts/permit2/overview)

## Permit2 Witness Protection 🛡️

### What is Witness?

Witness is an enhanced security feature in Permit2 that allows you to bind additional data (like the recipient address) to your signature. This prevents the facilitator from changing where your tokens are sent.

### How It Works

**Without Witness (Traditional):**
```typescript
// User signs: "Allow facilitator to transfer my tokens"
// ❌ Facilitator can send tokens to ANY address
```

**With Witness (Enhanced):**
```typescript
// User signs: "Allow facilitator to transfer my tokens TO 0xRecipient..."
// ✅ Facilitator MUST send tokens to this specific address
// ✅ Any attempt to change recipient will fail
```

### Security Benefits

🔒 **Cryptographic Binding** - Recipient address is bound to signature  
👁️ **Full Transparency** - User sees exact recipient when signing  
🚫 **Prevents Tampering** - Facilitator cannot change the recipient  
⛽ **Zero Gas Cost** - No additional gas compared to regular Permit2  
🔄 **Backward Compatible** - Works alongside regular Permit2  

### Witness Example Code

```typescript
// Sign with witness
const signature = await wallet.signTypedData({
  domain: {
    name: "Permit2",
    chainId,
    verifyingContract: PERMIT2_ADDRESS,
  },
  types: {
    PermitWitnessTransferFrom: [
      { name: "permitted", type: "TokenPermissions" },
      { name: "spender", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "witness", type: "Witness" },  // ← Witness field
    ],
    TokenPermissions: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    Witness: [
      { name: "to", type: "address" },  // ← Recipient address
    ],
  },
  message: {
    permitted: { token, amount },
    spender: facilitatorAddress,
    nonce,
    deadline,
    witness: {
      to: recipientAddress,  // ← Bound to signature
    },
  },
});

// Create payment payload with witness
const paymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "base-sepolia",
  payload: {
    authorizationType: "permit2",
    signature,
    authorization: {
      owner: clientAddress,
      spender: facilitatorAddress,
      token: tokenAddress,
      amount: paymentAmount,
      deadline: expirationTime,
      nonce: currentNonce,
      to: recipientAddress,  // ← Witness field in payload
    },
  },
};
```

### Try the Witness Demo

Run the witness example to see the protection in action:

```bash
pnpm run client:witness
```

The demo will:
1. ✅ Explain witness protection concept
2. ✅ Create a witness-protected signature
3. ✅ Show the recipient address binding
4. ✅ Demonstrate protection against tampering
5. ✅ Verify successful settlement to correct address

## Next Steps

- ✅ Try the witness protection example (`pnpm run client:witness`)
- Integrate batch transfers (multiple tokens in one payment)
- Use with any ERC20 token
- Combine witness with custom data structures

