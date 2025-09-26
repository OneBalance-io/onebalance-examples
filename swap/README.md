# OneBalance Swap Examples

Simple examples showing how to perform swaps using OneBalance's aggregated assets.

## Examples

- **`role-based.ts`** - Role-based account swap (dual-key)
- **`basic.ts`** - Basic account swap (single-key)  
- **`simple-swap.ts`** - Universal swap function with multiple examples

## How to Run

```bash
# Role-based account example
pnpm run swap:role-based

# Basic account example  
pnpm run swap:basic

# Simple swap examples
pnpm run swap:simple
```

## Setup

1. **Keys**: Configure in `helpers/keys/` directory:
   - `session-key.json` - For signing operations
   - `admin-key.json` - For role-based accounts only

2. **Balance**: Ensure account has sufficient token balance

3. **API Key**: Set `ONEBALANCE_API_KEY` in `.env` (optional)

## Account Types

### Role-Based Account
- **Security**: Dual-key architecture (session + admin)
- **Signing**: EIP-712 typed data
- **Use Case**: Enhanced security with backup admin

### Basic Account (Kernel v3.1)
- **Simplicity**: Single-key architecture
- **Signing**: UserOperation hash
- **Use Case**: Simple operations with one signer

## Aggregated Assets

Use aggregated asset IDs for cross-chain swaps:
- `ob:usdc` - USDC across all chains
- `ob:usdt` - USDT across all chains
- `ob:sol` - SOL on Solana
- `ob:aave` - AAVE across chains

OneBalance automatically handles:
- Chain selection
- Cross-chain bridging
- Gas optimization
- Unified balance view
