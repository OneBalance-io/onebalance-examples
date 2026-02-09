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

### `depositToHyperLiquid.ts` (V3)

Smart Hyperliquid bridge deposit with automatic flow detection and destination balance handling.

**Features:**
- Automatic routing: atomic (single-chain) or two-step (multi-chain)
- Destination balance exclusion (only consolidates what's needed)
- Accounts for fees/slippage between steps
- Supports EVM + Solana multi-chain
- Handles 6 and 18 decimal configurations

**Details:**
- Detects fund distribution automatically
- Single-input: direct deposit via calldata (one tx)
- Multi-input: consolidate first, then deposit (two txs)
- Uses `same_chain_exclude_solver` for optimal routing

```bash
pnpm run calldata:depositToHyperLiquid
```

### `aave.ts` (V3) - Interactive CLI

Interactive menu-driven interface for complete AAVE operations.

**Menu Options:**
1. Show USDC Balance (multi-chain breakdown)
2. List Positions (supplies & borrows)
3. View Transaction History
4. Supply USDC (prompts for amount)
5. Borrow USDC (prompts for amount)
6. Withdraw USDC (prompts for amount)
7. Repay USDC (prompts for amount)
0. Exit

**Features:**
- Interactive menu selection (no command-line args needed)
- Loads account once, reuses for all operations
- Multi-chain consolidation for supply/repay
- Smart validation (checks positions before operations)
- AAVE SDK queries (balance, positions, history)
- Full JSON logging for debugging
- Transaction monitoring
- Error handling that doesn't crash the loop
- While loop - stays open until you exit

**Usage:**
```bash
# Run interactive CLI
pnpm run calldata:aave

# Then select from menu:
# - Enter 1 to see multi-chain USDC balance
# - Enter 2 to see positions
# - Enter 3 to see transaction history
# - Enter 4 to supply (will prompt for amount, supports multi-chain)
# - Enter 5 to borrow (will prompt for amount, requires collateral)
# - Enter 6 to withdraw (will prompt for amount)
# - Enter 7 to repay (will prompt for amount, supports multi-chain)
# - Enter 0 to exit
```

**Smart validations:**
- Withdraw: checks if you have USDC supply first
- Repay: checks if you have USDC debt first
- Supply/Repay: supports cross-chain consolidation
- Borrow/Withdraw: same-chain operations

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
