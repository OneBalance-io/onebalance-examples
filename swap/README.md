# Aggregated Asset Swap Example

This example demonstrates how to perform a simple swap from 1 USDC to USDT using OneBalance's aggregated assets feature.

## What This Example Does

1. **Checks USDC Balance**: Uses the V3 aggregated balance endpoint to check available USDC across all chains
2. **Creates Swap Quote**: Requests a quote to swap 1 USDC to USDT using aggregated asset IDs (`ob:usdc` → `ob:usdt`)
3. **Signs Operations**: Signs all required chain operations for the swap
4. **Executes Swap**: Submits the signed quote for execution
5. **Monitors Completion**: Tracks the transaction until completion

## Key Features

- **Aggregated Assets**: Uses `ob:usdc` and `ob:usdt` for unified cross-chain token representation
- **Chain Abstraction**: OneBalance automatically selects the best chains for execution
- **Smart Account**: Uses role-based account with session and admin addresses
- **Gas Abstraction**: No need to worry about gas tokens on different chains

## How to Run

1. Make sure you have USDC in your account
2. Ensure you have the necessary keys set up (session key)
3. Run the swap:

```bash
pnpm swap:role-based
```

## Prerequisites

- Account with sufficient USDC balance (at least 1 USDC)
- Session key configured in `helpers/keys/session-key.json`
- Admin key configured in `helpers/keys/admin-key.json`
- Environment variable `ONEBALANCE_API_KEY` set in `.env`

## Account Setup

The example uses a role-based smart contract account:

```typescript
const account = {
  sessionAddress: sessionKey.address,
  adminAddress: adminKey.address,
  accountAddress: predictedAddress,
};
```

The account address is predicted using the session and admin addresses:
- **Session Address**: Used for normal operations and signing transactions
- **Admin Address**: Backup admin that can perform emergency operations
- **Account Address**: The predicted smart contract account address where funds are stored

## Aggregated Assets

This example showcases OneBalance's aggregated asset system:

- `ob:usdc` - Represents USDC across all supported chains
- `ob:usdt` - Represents USDT across all supported chains

The system automatically:
- Finds the best chain to execute from
- Handles any necessary cross-chain operations
- Optimizes for fees and execution time

## Error Handling

The example includes error handling for:
- Insufficient balance checks
- Quote generation failures
- Signing errors
- Execution failures
- Transaction monitoring timeouts
