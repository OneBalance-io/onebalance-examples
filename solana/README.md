# Solana Examples

examples showing how to use OneBalance with Solana

## swap.ts

flexible Solana swap from any asset to any asset with multi-chain support

### What it does

- uses `loadMultiChainAccounts` to load both EVM and Solana accounts
- fetches and displays balances for ob:usdc, ob:usdt, ob:sol across EVM and Solana
- shows balance breakdown by chain
- checks balance for source asset
- swaps any Solana asset to any other asset
- supports cross-chain operations if needed
- monitors transaction until completion

### How to run

```bash
pnpm run solana-swap
```

### Requirements

- sufficient balance of source asset
- EVM account (EIP-7702) with session key
- Solana account with keypair
- OneBalance API key in your environment

### Usage

```typescript
import { swapSolanaAssets } from './solana/swap';
import { parseUnits } from 'viem';

// Example 1: SOL to USDC using specific asset IDs
await swapSolanaAssets({
  fromAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
  toAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  amount: parseUnits('0.0015', 9).toString(),
  fromDecimals: 9,
  slippageTolerance: 50,
});

// Example 2: Using aggregated asset IDs
await swapSolanaAssets({
  fromAssetId: 'ob:sol',
  toAssetId: 'ob:usdc',
  amount: parseUnits('0.001', 9).toString(),
  fromDecimals: 9,
  slippageTolerance: 50,
});
```

### Parameters

- `fromAssetId`: source asset ID (aggregated or chain-specific)
- `toAssetId`: destination asset ID (aggregated or chain-specific)
- `amount`: amount to swap in smallest unit (string)
- `fromDecimals`: decimals of source asset
- `slippageTolerance`: slippage tolerance in basis points (optional, default: 50 = 0.5%)

### What happens

1. **Load Accounts**: uses `loadMultiChainAccounts` to load both EVM (EIP-7702) and Solana accounts
2. **Display Balances**: fetches and shows balances for ob:usdc, ob:usdt, ob:sol with chain breakdown
3. **Check Balance**: verifies sufficient balance of source asset
4. **Get Quote**: requests swap quote from OneBalance
5. **Sign Operations**: signs all required operations (EVM and/or Solana)
6. **Execute Swap**: submits signed transaction
7. **Monitor**: waits for completion

### Key Features

- flexible: swap any Solana asset to any other
- multi-chain support: uses both EVM (EIP-7702) and Solana accounts
- uses `loadMultiChainAccounts` (consistent with other examples)
- supports both aggregated (`ob:sol`) and chain-specific asset IDs
- handles cross-chain operations automatically
- proper amount formatting with `viem`
- automatic key generation and caching
- transaction monitoring with status updates

### Files

- `swap.ts` - flexible swap implementation
- `../helpers/` - shared utilities for crypto, API calls, and OneBalance operations
