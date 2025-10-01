# OneBalance V3 Calldata Examples

This folder contains examples of using OneBalance's V3 calldata endpoints to execute arbitrary smart contract calls using Basic accounts (kernel-v3.1-ecdsa).

📋 **[See CALLDATA_FINDINGS.md](./CALLDATA_FINDINGS.md)** for detailed V1 vs V3 comparison, known issues (SUP-231), and technical analysis.

## 📁 Examples

### `standard-account.ts` (V3)

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
pnpm run calldata:standard-account
```

### `euler-vault-v1.ts` (V1)

Euler vault deposit/withdraw example using V1 calldata endpoints. Demonstrates both depositing AERO tokens and withdrawing them from the eAERO-1 vault.

**Important:** V1 endpoints only support CAIP-19 format (chain-specific tokens), NOT aggregated assets. Requires AERO on Base chain.

**Token Details:**
- **AERO on Base:** `0x940181a94A35A4569E4529A3CDfB74e38FD98631` (CAIP-19: `eip155:8453/erc20:0x940181a94a35a4569e4529a3cdfb74e38fd98631`)
- **Vault Token:** EVK Vault eAERO-1 (eAERO-1)
- **Network:** Base
- **Proxy Contract:** `0x5Fe2DE3E565a6a501a4Ec44AAB8664b1D674ac25`
- **Implementation:** `0x30a9A9654804F1e5b3291a86E83EdeD7cF281618`
- **Proxy Pattern:** EIP-1967 Beacon Proxy
- **Type:** ERC-20 vault shares (Euler V2)
- **Decimals:** 18

**Operations:**
1. **DEPOSIT** - `deposit(uint256 assets, address receiver)` - Selector: `0x6e553f65`
   - Requires AERO tokens on Base (V1 doesn't support cross-chain routing)
   - Deposits AERO tokens into the vault on Base
   - Receives eAERO-1 vault tokens in return
   - Call type: `same_chain_exclude_solver`
   
2. **WITHDRAW** - `redeem(uint256 shares, address receiver, address owner)` - Selector: `0xba087652`
   - Burns eAERO-1 vault tokens
   - Receives AERO tokens back on Base
   - Call type: `same_chain_exclude_solver`

**Configuration:**
Change the `OPERATION` constant at the top of the file:
```typescript
const OPERATION: 'deposit' | 'withdraw' = 'deposit'; // or 'withdraw'
```

**Flow:**
1. Load session key and predict account address
2. Verify token balance (AERO for deposit, eAERO-1 for withdraw)
3. Encode function call (deposit or redeem)
4. Prepare call quote using `/api/quotes/prepare-call-quote`
5. Sign chain operation
6. Get call quote using `/api/quotes/call-quote`
7. Sign origin chain operations
8. Execute quote using `/api/quotes/execute-quote`
9. Monitor transaction completion

**Run:**
```bash
pnpm run calldata:euler-vault-v1
```

## Example 3: Euler Vault Deposit/Withdraw (V3) - `euler-vault-v3.ts`

⚠️ **Note:** V3 calldata endpoints currently have an API inconsistency bug. See [CALLDATA_FINDINGS.md](./CALLDATA_FINDINGS.md) for details.

This example demonstrates both depositing and withdrawing from an Euler V2 vault using **V3 endpoints**. It showcases the same vault operations as the V1 example but with V3's enhanced features (when the API is fixed).

### Scenario

**Deposit Flow:**
1. User has AERO tokens (on any supported chain - V3 handles cross-chain routing)
2. Deposit AERO → Receive eAERO-1 vault tokens on Base
3. V3 automatically routes AERO from any chain to Base if needed

**Withdraw Flow:**
1. User has eAERO-1 vault tokens on Base
2. Redeem eAERO-1 → Get back AERO tokens

### Token Details
- **AERO Token**: `0x940181a94A35A4569E4529A3CDfB74e38FD98631` (Base)
- **Vault Token (eAERO-1)**: `0x5Fe2DE3E565a6a501a4Ec44AAB8664b1D674ac25` (Base)
- **Implementation**: `0x30a9A9654804F1e5b3291a86E83EdeD7cF281618` (EIP-1967 Beacon Proxy)

### Flow Steps

1. Load account (Basic account with kernel-v3.1-ecdsa)
2. Verify token balance (AERO for deposit, eAERO-1 for withdraw)
3. Encode vault function calldata (deposit or redeem)
4. Prepare call quote using `/api/quotes/prepare-call-quote-v3`
5. Sign chain operations
6. Get call quote using `/api/quotes/get-call-quote-v3`
7. Sign origin operations
8. Execute quote using `/api/quotes/execute-quote-v3`
9. Monitor transaction completion

**Run:**
```bash
pnpm run calldata:euler-vault-v3
```

**Known Issue:** Currently fails at execution with `Required at "accounts"` error due to API returning `account` instead of `accounts`.

**Client-Side Workaround Not Possible:** Transforming the response structure breaks the `tamperProofSignature` validation, resulting in "Incorrect tamper proof signature" error. This requires a backend fix (SUP-231).

## 🔑 Key Differences: V1 vs V3

### V1 Endpoints (`euler-vault-v1.ts`)
- Uses single `account` object
- Requires CAIP-19 chain-specific tokens (e.g., `eip155:8453/erc20:0x...`)
- No cross-chain routing for deposits
- Must have tokens on the target chain

### V3 Endpoints (`euler-vault-v3.ts`)
- Uses `accounts` array (supports multi-account operations)
- Supports aggregated assets (e.g., `ob:aero`) for cross-chain routing
- Can automatically bridge/swap tokens from any chain
- More flexible for deposit operations

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

