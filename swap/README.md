# OneBalance Swap Examples

Simple examples showing how to perform swaps using OneBalance's aggregated assets.

## Examples

- **`role-based.ts`** - Role-based account swap (dual-key)
- **`standard-account.ts`** - Standard account swap (single-key)  
- **`simple-swap.ts`** - Universal swap function with standard account (kernel-v3.1-ecdsa)
- **`simple-swap-role-based.ts`** - Universal swap function with role-based account (dual-key)

## How to Run

```bash
# Role-based account example
pnpm run swap:role-based

# Standard account example  
pnpm run swap:standard-account

# Simple swap examples (standard account)
pnpm run swap:simple

# Simple swap examples (role-based account)
pnpm run swap:simple-role-based
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
- **Signing**: EIP-712 typed data (signTypedData)
- **API Version**: V1 for EVM-only, V3 when Solana is involved
- **Use Case**: Enhanced security with backup admin

### Standard Account (Kernel v3.1)
- **Simplicity**: Single-key architecture
- **Signing**: UserOperation hash (signMessage)
- **API Version**: V3 for all operations
- **Use Case**: Simple operations with one signer

## API Endpoints

The `simple-swap-role-based.ts` example intelligently chooses between API versions:
- **V1 API** (`/api/v1/quote`): Used for EVM-to-EVM swaps
  - Single account structure
  - Simpler request format
  - Optimal for cross-chain EVM operations
- **V3 API** (`/api/v3/quote`): Used when Solana is involved
  - Multi-account support (EVM + Solana)
  - Handles mixed chain types
  - Required for Solana integration

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
