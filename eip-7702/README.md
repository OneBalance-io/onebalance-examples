# EIP-7702 USDC Transfer Example

Demonstrates atomic cross-chain USDC transfer using EIP-7702 delegation with OneBalance.

## What is EIP-7702?

EIP-7702 enables EOAs to gain smart account capabilities through delegation. Your wallet address stays the same while gaining features like gas abstraction and atomic cross-chain execution.

**Key Benefits:**

- ✅ No address changes - use your existing EOA
- ✅ Atomic execution - delegation + bridging + contract calls in one transaction
- ✅ Gas abstraction - sponsored transactions

## Running the Example

```bash
# From root directory
pnpm install
pnpm run eip-7702
```

**Prerequisites:**

- USDC balance on any supported chain (example generates EOA keys automatically)

## What It Does

1. **Generates/loads** an EOA key (cached in `helpers/keys/`)
2. **Checks** USDC balances across chains
3. **Prepares** a 1 USDC transfer quote
4. **Signs** EIP-7702 delegation (if needed) and UserOperation
5. **Executes** the atomic transfer
6. **Monitors** transaction completion

## Key Code Concepts

### EIP-7702 Account Configuration

```typescript
const account: EvmAccount = {
  type: 'kernel-v3.3-ecdsa',
  deploymentType: 'EIP7702',
  accountAddress: eoaAddress,  // Same as EOA
  signerAddress: eoaAddress,   // No prediction needed
};
```

### Unified Signing

Uses `signOperation()` from helpers that handles both delegation and UserOperation signing for Kernel V3.3 accounts.

### Real-time Monitoring

Monitors execution status using `/api/status/get-execution-status` endpoint with live status updates.

## Atomic Execution Constraint

Works when you have assets on **destination chain + ≤1 additional source chain**. For multi-chain scenarios, requires manual delegation workaround.

## Files

- `index.ts` - Main example implementation
- `../helpers/` - Shared OneBalance API functions and types
