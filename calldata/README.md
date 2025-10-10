# OneBalance Calldata Examples

Examples of using OneBalance's V1 and V3 calldata endpoints to execute arbitrary smart contract calls.

## Examples

### `erc20transfer.ts` (V1)

Simple ERC20 USDC transfer example using V1 calldata endpoints with Role-based accounts.

```bash
pnpm run calldata:erc20transfer
```

### `standard-account.ts` (V3)

Simple USDC transfer example using V3 calldata endpoints with Standard accounts (kernel-v3.1-ecdsa).

```bash
pnpm run calldata:standard-account
```

### `euler-vault-v1.ts` (V1)

Deposit and withdraw AERO tokens from the eAERO-1 vault on Base using V1 endpoints.

**Configuration:**
```typescript
const OPERATION: 'deposit' | 'withdraw' = 'deposit'; // Change to 'withdraw' for withdrawals
```

**Details:**
- Uses CAIP-19 format (chain-specific tokens)
- Requires tokens on Base chain
- Single account operations

```bash
pnpm run calldata:euler-vault-v1
```

### `euler-vault-v3.ts` (V3)

Deposit and withdraw AERO tokens from the eAERO-1 vault using V3 endpoints with cross-chain routing support.

**Configuration:**
```typescript
const OPERATION: 'deposit' | 'withdraw' = 'deposit'; // Change to 'withdraw' for withdrawals
```

**Details:**
- Supports aggregated assets (e.g., `ob:aero`)
- Cross-chain routing for deposits
- Multi-account operations

```bash
pnpm run calldata:euler-vault-v3
```

## Key Differences: V1 vs V3

| Feature | V1 | V3 |
|---------|----|----|
| Account structure | Single `account` object | `accounts` array |
| Asset format | CAIP-19 only | CAIP-19 + aggregated assets |
| Cross-chain routing | No | Yes |
| Multi-account | No | Yes |

## Resources

- [Prepare Call Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/prepare-call-quote-v3)
- [Get Call Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/get-call-quote-v3)
- [Execute Quote V3 API Docs](https://docs.onebalance.io/api-reference/quotes/execute-quote-v3)
- [Contract Calls Guide](https://docs.onebalance.io/guides/contract-calls/overview)
