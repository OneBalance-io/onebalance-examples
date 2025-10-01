# OneBalance Examples

Examples for integrating with the OneBalance API to enable cross-chain asset management.

## Quickstart

```bash
pnpm install

# Run examples
pnpm run swap:simple
pnpm run swap:role-based
pnpm run calldata                     # V1 calldata example (legacy)
pnpm run calldata:standard-account    # V3 calldata example (recommended)
pnpm run calldata:euler-vault-v1      # V1 Euler vault deposit/withdraw example
pnpm run calldata:euler-vault-v3      # V3 Euler vault deposit/withdraw example
pnpm run eip-7702
```

## Examples

- **`swap/`** - Cross-chain swap examples with different account types
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
