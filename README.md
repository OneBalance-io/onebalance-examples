# OneBalance Examples

Examples for integrating with the OneBalance API to enable cross-chain asset management.

## Quickstart

```bash
pnpm install

# Run examples
pnpm run swap:simple                  # Swap with basic account
pnpm run swap:simple-role-based       # Swap with role-based account
pnpm run transfer:simple              # Transfer with basic account
pnpm run transfer:simple-role-based   # Transfer with role-based account
pnpm run eip-7702
```

## Examples

- **`swap/`** - Cross-chain swap examples with different account types
- **`transfer/`** - Asset transfer examples with recipient specification (CAIP-10)
- **`calldata/`** - V3 calldata examples with Basic accounts
- **`onebalance-calldata/`** - V1 ERC20 transfers and balance checking (legacy)
- **`eip-7702/`** - Atomic cross-chain execution with delegation
- **`solana/`** - Solana-specific swap operations

## Setup

Keys are auto-generated in `helpers/keys/`. Optionally set API key:

```env
ONEBALANCE_API_KEY=your-api-key-here
```

## Helpers

Modular utilities in `helpers/`:
- **API & crypto** - Authentication and key management
- **Account management** - Multi-chain account loading
- **Balance checking** - Universal balance verification
- **Quote building** - Request construction
- **Signing** - EVM and Solana operation signing
- **Monitoring** - Transaction status tracking
