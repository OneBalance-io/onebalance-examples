# OneBalance Transfer Examples

Examples showing how to transfer assets to specific recipient addresses using CAIP-10 format.

## Examples

- **`simple-transfer.ts`** - Transfer with basic account (kernel-v3.1-ecdsa)
- **`simple-transfer-role-based.ts`** - Transfer with role-based account (dual-key)

## How to Run

```bash
# Basic account transfer
pnpm run transfer:simple

# Role-based account transfer
pnpm run transfer:simple-role-based
```

## What is a Transfer?

A transfer sends the same asset to a different recipient account. Unlike swaps, transfers:
- Send the same asset type (e.g., USDC → USDC)
- Specify a recipient account in CAIP-10 format
- Can be cross-chain (e.g., USDC from Arbitrum to recipient on Optimism)

## CAIP-10 Format for Recipients

The recipient account must be specified in CAIP-10 format:

```
<namespace>:<chain_id>:<account_address>
```

### Examples:

**EVM Chains:**
- `eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` (Arbitrum)
- `eip155:43114:0xc9c2fcc7011748e7c8a3c16e819d6859f6140ec6` (Avalanche)
- `eip155:8453:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` (Base)
- `eip155:10:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb` (Optimism)

**Solana:**
- `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:4yLyrKpdwhxFcBmjqkVXdqoH1NQFyTgufxP9LFjvKT1D`

## Transfer vs Swap

| Feature | Transfer | Swap |
|---------|----------|------|
| Asset Type | Same (USDC → USDC) | Different (USDC → USDT) |
| Recipient | Required (CAIP-10) | Optional (defaults to sender) |
| Use Case | Send funds to another address | Exchange between assets |
| Example | Withdraw to external wallet | Trade USDC for ETH |

## API Endpoints

### Role-Based Account Transfers
The `simple-transfer-role-based.ts` intelligently chooses API versions:

- **V1 API** (`/api/v1/quote`): For EVM-to-EVM transfers
  - Example: USDC on Arbitrum to address on Optimism
  - Request structure:
    ```json
    {
      "from": {
        "account": { "type": "role-based", ... },
        "asset": { "assetId": "ob:usdc" },
        "amount": "1000000"
      },
      "to": {
        "asset": { "assetId": "ob:usdc" },
        "account": "eip155:10:0x742d..."
      }
    }
    ```

- **V3 API** (`/api/v3/quote`): When Solana is involved
  - Example: SOL to another Solana address
  - Request structure:
    ```json
    {
      "from": {
        "accounts": [{ "type": "role-based", ... }, { "type": "solana", ... }],
        "asset": { "assetId": "ob:sol" },
        "amount": "100000000"
      },
      "to": {
        "asset": { "assetId": "ob:sol" },
        "account": "solana:5eykt...:4yLyr..."
      }
    }
    ```

### Basic Account Transfers
The `simple-transfer.ts` always uses V3 API for all operations.

## Transfer Flow

1. **Load Accounts**: Initialize sender account (EVM and/or Solana)
2. **Check Balance**: Verify sufficient funds for transfer + fees
3. **Build Request**: Create transfer request with recipient in CAIP-10 format
4. **Get Quote**: Request quote from OneBalance API
5. **Sign Operations**: Sign with appropriate method (signMessage or signTypedData)
6. **Execute**: Submit signed quote for execution
7. **Monitor**: Track transaction completion

## Example Usage

### Basic Transfer (Simple)

```typescript
import { simpleTransfer } from './transfer/simple-transfer';
import { parseUnits } from 'viem';

await simpleTransfer({
  assetId: 'ob:usdc',
  amount: parseUnits('10', 6).toString(),
  recipientAccount: 'eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  decimals: 6,
});
```

### Role-Based Transfer (Production)

```typescript
import { simpleTransferRoleBased } from './transfer/simple-transfer-role-based';
import { parseUnits } from 'viem';

// Withdraw USDT to Avalanche
await simpleTransferRoleBased({
  assetId: 'ob:usdt',
  amount: parseUnits('47', 6).toString(),
  recipientAccount: 'eip155:43114:0xc9c2fcc7011748e7c8a3c16e819d6859f6140ec6',
  decimals: 6,
});
```

## Setup

1. **Keys**: Configure in `helpers/keys/` directory:
   - `session-key.json` - For signing operations
   - `admin-key.json` - For role-based accounts only
   - `solana-key.json` - For Solana transfers

2. **Balance**: Ensure account has sufficient balance + gas

3. **API Key**: Set `ONEBALANCE_API_KEY` in `.env` (optional)

## Common Use Cases

### Withdraw to External Wallet
```typescript
await simpleTransferRoleBased({
  assetId: 'ob:usdc',
  amount: parseUnits('100', 6).toString(),
  recipientAccount: 'eip155:1:0xYourExternalWallet', // Ethereum Mainnet
  decimals: 6,
});
```

### Cross-Chain Transfer
```typescript
// Transfer USDC from any chain to Base
await simpleTransfer({
  assetId: 'ob:usdc',
  amount: parseUnits('50', 6).toString(),
  recipientAccount: 'eip155:8453:0xRecipientOnBase',
  decimals: 6,
});
```

### Solana Transfer
```typescript
await simpleTransfer({
  assetId: 'ob:sol',
  amount: parseUnits('0.5', 9).toString(),
  recipientAccount: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:RecipientPublicKey',
  decimals: 9,
});
```

