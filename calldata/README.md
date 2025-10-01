# OneBalance V3 Calldata Examples

This folder contains examples of using OneBalance's V3 calldata endpoints to execute arbitrary smart contract calls using Basic accounts (kernel-v3.1-ecdsa).

## 📁 Examples

### `standard-account.ts`

Simple example showing how to use V3 calldata endpoints with a Basic account to perform a USDC transfer.

**Flow:**
1. Load session key (`session2`)
2. Predict smart account address
3. Check USDC balance
4. Prepare call quote using `/api/v3/quote/prepare-call-quote`
5. Sign the chain operation
6. Get call quote using `/api/v3/quote/call-quote`
7. Sign all origin chain operations
8. Execute quote using `/api/v3/quote/execute-quote`
9. Monitor transaction completion

**Run:**
```bash
ts-node calldata/standard-account.ts
```

## 🔑 Key Differences from V1

The V3 calldata endpoints use an `accounts` array instead of a single `account` object:

**V1 (Old):**
```typescript
{
  account: {
    type: "kernel-v3.1-ecdsa",
    signerAddress: "0x...",
    accountAddress: "0x..."
  }
}
```

**V3 (New):**
```typescript
{
  accounts: [
    {
      type: "kernel-v3.1-ecdsa",
      signerAddress: "0x...",
      accountAddress: "0x..."
    }
  ]
}
```

This allows V3 to support multi-account operations, including cross-chain calls with mixed Solana and EVM accounts.

## 🚀 Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Ensure you have USDC balance on Arbitrum:
   - The example will predict your account address
   - Fund it with some USDC before running

3. Run the example:
   ```bash
   ts-node calldata/standard-account.ts
   ```

## 📚 API Endpoints Used

- **Prepare Call Quote V3**: `POST /api/v3/quote/prepare-call-quote`
- **Get Call Quote V3**: `POST /api/v3/quote/call-quote`
- **Execute Quote V3**: `POST /api/v3/quote/execute-quote`
- **Get Execution Status V3**: `GET /api/v3/status/get-execution-status`

## 🔗 Resources

- [Prepare Call Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/prepare-call-quote-v3)
- [Get Call Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/get-call-quote-v3)
- [Execute Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/execute-quote-v3)
- [Contract Calls Guide](https://docs.onebalance.io/guides/contract-calls/overview)

