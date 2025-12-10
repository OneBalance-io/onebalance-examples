# OneBalance Examples

Examples for integrating with the OneBalance API to enable cross-chain asset management.

## Quickstart

```bash
pnpm install

# Swap examples
pnpm run swap:simple                  # Swap with standard account
pnpm run swap:simple-role-based       # Swap with role-based account
pnpm run swap:standard-account        # Standard account swap example
pnpm run swap:role-based              # Role-based swap example

# Transfer examples
pnpm run transfer:simple              # Transfer with standard account
pnpm run transfer:simple-role-based   # Transfer with role-based account

# Calldata examples
pnpm run calldata:standard-account    # V3 calldata (recommended)
pnpm run calldata:depositToHyperLiquid # V3 Hyperliquid bridge deposit
pnpm run calldata:euler-vault-v3      # V3 Euler vault deposit/withdraw
pnpm run calldata:euler-vault-v1      # V1 Euler vault deposit/withdraw
pnpm run calldata:erc20transfer       # V1 ERC20 transfer

# Other examples
pnpm run eip-7702                     # EIP-7702 delegation
pnpm run solana:swap                  # Solana-specific swap
```

## Examples

- **`swap/`** - Cross-chain swap examples with different account types
- **`transfer/`** - Asset transfer examples with recipient specification (CAIP-10)
- **`calldata/`** - V3 calldata examples with Standard accounts
- **`eip-7702/`** - Atomic cross-chain execution with EIP-7702 delegation
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
