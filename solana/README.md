# Solana Examples

This directory contains examples showing how to use OneBalance with Solana.

## swap.ts

A simple SOL to USDC swap within the Solana network.

### What it does

- Loads your Solana keypair from `helpers/keys/solana-key.json`
- Checks your SOL balance
- Swaps 0.0015 SOL for USDC
- Monitors the transaction until completion

### How to run

```bash
pnpm run solana-swap
```

### Requirements

- SOL balance (at least 0.0015 SOL)
- OneBalance API key in your environment

### What happens

1. **Load Account**: Reads or generates a Solana keypair
2. **Check Balance**: Verifies you have enough SOL
3. **Get Quote**: Requests swap quote from OneBalance
4. **Sign Transaction**: Signs the Solana operation
5. **Execute Swap**: Submits the signed transaction
6. **Monitor**: Waits for completion

### Key Features

- Uses OneBalance v3 API for Solana support
- Proper amount formatting with `viem` utilities
- Automatic key generation and caching
- Transaction monitoring with status updates

### Files

- `swap.ts` - Main swap implementation
- `../helpers/` - Shared utilities for crypto, API calls, and OneBalance operations
