# EIP-7702 Examples

Demonstrates cross-chain USDC transfers using EIP-7702 delegation with OneBalance.

## What is EIP-7702?

EIP-7702 enables EOAs to gain smart account capabilities through delegation. Your wallet address stays the same while gaining features like gas abstraction and cross-chain execution.

**Key Benefits:**

- ✅ No address changes - use your existing EOA
- ✅ Gas abstraction - sponsored transactions

## Examples

### 1. Basic EIP-7702 Transfer (`index.ts`)

Simple USDC transfer between EVM chains using EIP-7702.

```bash
npx tsx eip-7702/index.ts
```

### 2. Solana ↔ Polygon Transfer (`solana-transfer-to-polygon.ts`)

Bidirectional USDC transfers between Solana and Polygon using EIP-7702 + Solana accounts.

```bash
npx tsx eip-7702/solana-transfer-to-polygon.ts
```

## Setup

### 1. Create EVM Key

`helpers/keys/session2-key.json`:
```json
{
  "privateKey": "0x...",
  "address": "0x..."
}
```

### 2. Create Solana Key (for Solana example)

`helpers/keys/solana-key.json`:
```json
{
  "publicKey": "YOUR_SOLANA_PUBLIC_KEY",
  "secretKey": [your, secret, key, array]
}
```

### 3. Add USDC

- **Solana**: send USDC to your Solana public key
- **Polygon**: send USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359) to your EVM address

## How It Works

1. **Loads** keys from `helpers/keys/`
2. **Checks** USDC balances
3. **Gets** quote using v3 endpoints
4. **Signs** operations (EIP-7702 delegation + Solana signatures)
5. **Executes** atomic transfer
6. **Monitors** completion

## Key Code Concepts

### EIP-7702 Account Configuration

```typescript
const eip7702Account: EIP7702Account = {
  type: 'kernel-v3.3-ecdsa',
  deploymentType: 'EIP7702',
  accountAddress: eoaAddress,
  signerAddress: eoaAddress,
};
```

### Multi-Account Requests (v3)

```typescript
const quoteRequest: QuoteRequestV3 = {
  from: {
    accounts: [solanaAccount, eip7702Account], // Multiple accounts
    asset: { assetId: USDC_SOLANA_ASSET_ID },
    amount: '400000',
  },
  to: {
    asset: { assetId: USDC_POLYGON_ASSET_ID },
    account: 'eip155:137:0x...', // CAIP-10 format
  },
};
```

### Unified Signing

`signAllOperations()` handles both EVM (EIP-7702 delegation + UserOp) and Solana signatures automatically.

## Asset IDs

- **Solana USDC**: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Polygon USDC**: `eip155:137/erc20:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`
- **Aggregated USDC**: `ob:usdc` (auto-routes across chains)

## Files

- `index.ts` - Basic EIP-7702 transfer
- `solana-transfer-to-polygon.ts` - Solana ↔ Polygon bidirectional transfers
- `../helpers/` - Shared OneBalance API functions and types
