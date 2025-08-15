# EIP-7702 Atomic Cross-Chain Example

This example demonstrates atomic cross-chain execution using EIP-7702 delegation with OneBalance.

## What is EIP-7702?

EIP-7702 enables EOAs (Externally Owned Accounts) to gain smart account capabilities through delegation. This allows atomic bundling of delegation, cross-chain bridging, and contract execution into a single user operation.

### Key Benefits

- **No address prediction needed** - EOA addresses remain unchanged
- **Atomic execution** - delegation + bridging + execution in one transaction  
- **No intermediate states** - eliminates stuck funds scenarios

## How This Example Works

The example performs an atomic USDC transfer that:

1. **Prepares** a call quote with OneBalance
2. **Signs** EIP-7702 delegation objects (if needed)
3. **Fetches** an executable quote with signed delegations
4. **Executes** the atomic operation (delegation + bridge + transfer)

## Prerequisites

- USDC balance on any supported chain
- The example will automatically generate an EOA address and cache the keys in `helpers/keys/`

## Running the Example

From the root directory:

```bash
# Install dependencies (run once)
pnpm install

# Run the EIP-7702 example
pnpm run eip-7702
```

## Expected Output

```
🚀 Starting EIP-7702 Atomic Cross-Chain Example
Session EOA Address: 0x...
EIP-7702 Account Configuration: { type: 'kernel-v3.3-ecdsa', deploymentType: 'EIP7702', ... }

Checking USDC balances...
USDC Balances found: { total: '1000000', chains: [...] }

=== Starting EIP-7702 Atomic Transfer ===

1. Preparing call quote...
Quote prepared successfully

2. Signing delegation and operation...
Signing delegation for chain 42161...
Delegation signed successfully
Operation signed successfully

3. Fetching executable quote...
Executable quote received: quote_xyz...

4. Executing atomic operation...
✅ Bundle executed successfully!
Atomic operation completed: {
  delegation: 'Completed atomically',
  bridging: 'Completed atomically',
  execution: 'Completed atomically'
}

5. Monitoring transaction completion...
Transaction status: COMPLETED
🎉 Transaction completed successfully!

✅ EIP-7702 example completed successfully!
```

## Key Features Demonstrated

### 1. No Address Prediction
Unlike regular calldata examples, EIP-7702 uses the same address for both signer and account:

```typescript
const account: EvmAccount = {
  type: 'kernel-v3.3-ecdsa',
  deploymentType: 'EIP7702',
  accountAddress: sessionKey.address, // EOA address
  signerAddress: sessionKey.address,  // Same address!
};
```

### 2. Delegation Signing
Signs EIP-7702 authorization tuples using `signAuthorization`:

```typescript
const authTuple = {
  contractAddress: operation.delegation.contractAddress,
  nonce: operation.delegation.nonce,
  chainId: chainId,
};

const signedTuple = await signerAccount.signAuthorization(authTuple);
```

### 3. Atomic Execution
All operations bundled in a single transaction - no intermediate states.

## File Structure

```
eip-7702/
├── index.ts           # Main example implementation
└── README.md          # This file

# Shared configuration in root:
# - package.json (dependencies and scripts)
# - tsconfig.json (TypeScript configuration)
```

## Common Issues

1. **No USDC balance**: Add USDC to the generated EOA address
2. **Delegation errors**: Ensure you have the latest viem version (2.21+)
3. **Network issues**: Check your internet connection for API calls

## Atomic Execution Constraints

- Works with destination chain + ≤1 additional source chain
- For complex multi-chain scenarios (>1 additional source), falls back to 3-step manual flow

## Related Documentation

- [EIP-7702 Overview](../context/7702/overview.mdx)
- [Implementation Details](../context/7702/implementation.mdx)
- [OneBalance API Documentation](https://docs.onebalance.io)

## TODO

✅ What's Working:

- Signature is valid locally - Both for sender and signer addresses
- Delegation signature format - Matches Linear ticket TOOLKIT-702 exactly
- In-place modifications - Confirmed necessary for tamper-proof signature
- Data structures - Match API documentation and Linear ticket examples

❌ The Core Issue:

The API returns "Invalid sender signature" despite the signature being cryptographically valid. This suggests a backend validation issue.

🔬 Evidence Gathered:

- When we remove the delegation, we get "Invalid tamper proof signature" instead
- The signature validates correctly using viem's verifyTypedData
- The account configuration matches what's documented for EIP-7702
- All data formats match the Linear ticket examples
