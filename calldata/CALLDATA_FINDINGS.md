# V3 Calldata API Inconsistency Findings

**Date:** October 1, 2025  
**Issue:** API response structure inconsistency between V3 calldata endpoints

## Problem Summary

The V3 calldata endpoints have an inconsistency in their response structure regarding `account` vs `accounts` field:

### ✅ Step 1: Prepare Call Quote - `/api/v3/quote/prepare-call-quote`
**Request:**
```json
{
  "accounts": [
    {
      "type": "kernel-v3.1-ecdsa",
      "signerAddress": "0x...",
      "accountAddress": "0x..."
    }
  ],
  ...
}
```

**Response (Correct):**
```json
{
  "accounts": [
    {
      "type": "kernel-v3.1-ecdsa",
      "signerAddress": "0x...",
      "accountAddress": "0x..."
    }
  ],
  "chainOperation": { ... },
  "tamperProofSignature": "0x...",
  ...
}
```
✅ Returns `accounts` array as expected

---

### ❌ Step 2: Get Call Quote - `/api/v3/quote/call-quote`
**Request:**
```json
{
  "accounts": [
    {
      "type": "kernel-v3.1-ecdsa",
      "signerAddress": "0x...",
      "accountAddress": "0x..."
    }
  ],
  "chainOperation": { ... },
  "tamperProofSignature": "0x...",
  ...
}
```

**Response (Incorrect):**
```json
{
  "id": "0x...",
  "account": {  // ❌ Should be "accounts" array
    "type": "kernel-v3.1-ecdsa",
    "signerAddress": "0x...",
    "accountAddress": "0x..."
  },
  "originChainsOperations": [ ... ],
  "expirationTimestamp": "...",
  "tamperProofSignature": "0x...",
  ...
}
```
❌ Returns singular `account` object instead of `accounts` array

---

### ❌ Step 3: Execute Quote - `/api/v3/quote/execute-quote`
**Sends the response from Step 2:**
```json
{
  "id": "0x...",
  "account": { ... },  // From get-call-quote response
  ...
}
```

**Error Response:**
```json
{
  "error": "Validation failed",
  "message": "Validation error: Required at \"accounts\"",
  "statusCode": 400
}
```
❌ Execute endpoint expects `accounts` array but receives `account` object from previous step

## Impact

This inconsistency breaks the V3 calldata flow:

1. **Prepare call quote** correctly uses `accounts` array
2. **Get call quote** incorrectly returns `account` object (should be `accounts` array)
3. **Execute quote** expects `accounts` array but receives `account` from step 2, causing validation error

## User Reports

This issue was reported in Intercom conversation on September 30 - October 1, 2025:

> "I know the reason. Here on step 2 instead of accounts is returned only account https://docs.onebalance.io/api-reference/quotes/get-call-quote-v3
> I should have got kind of this object "accounts": [...] but I got account in singular
> But on step 3 I should pass "accounts": [...]
> And there is why the code is broken"

## Why Client-Side Workaround Fails

We attempted to transform the response structure on the client side:

```typescript
// After getting call quote
const quote = await fetchCallQuoteV3(callRequest);

// Attempt 1: Transform account → accounts
const quoteWithFix = {
  ...quote,
  accounts: [quote.account],
  account: undefined,
};

await executeQuoteV3(quoteWithFix);
// ❌ Fails with: "Incorrect tamper proof signature"
```

**Why it fails:**
1. Backend generates `tamperProofSignature` for the payload structure it sends (with `account`)
2. Transforming `account` → `accounts` changes the structure
3. Execute endpoint validates signature against the modified payload
4. Signature validation fails because structure no longer matches

**Conclusion:** This is a backend-only fix. The backend must return `accounts` array with a matching signature. No client-side workaround is possible.

## Recommendation

The `/api/v3/quote/call-quote` endpoint should return `accounts` array instead of `account` object to match:
- The request structure (sends `accounts`)
- The prepare-call-quote response (returns `accounts`)
- The execute-quote expectation (requires `accounts`)
- The V3 API design pattern (multi-account support)

All V3 endpoints should consistently use `accounts` array for multi-account support.

## API Endpoints Affected

- ✅ `POST /api/v3/quote/prepare-call-quote` - Correct (uses `accounts`)
- ❌ `POST /api/v3/quote/call-quote` - Incorrect (returns `account` instead of `accounts`)
- ✅ `POST /api/v3/quote/execute-quote` - Correct (expects `accounts`)

## Test Case

Run the example to reproduce:
```bash
pnpm run calldata:standard-account
```

The execution will fail with validation error about missing `accounts` field.

## Related Pull Request

**Branch:** `calldata-examples`  
**PR Link:** https://github.com/OneBalance-io/onebalance-examples/pull/4/files

This PR adds V3 calldata examples with proper documentation of the API inconsistency issue. The example includes helper functions and a clean implementation demonstrating the V3 calldata flow with Basic accounts (kernel-v3.1-ecdsa).

## Update: October 1, 2025 - Issue Still Present

**Test Case:** Euler Vault V3 Deposit (`pnpm run calldata:euler-vault-v3`)

The API inconsistency **is still present** as of October 1, 2025:

```bash
✅ Call quote received:
  - Quote ID: 0x43378a280f3cee62f88db7ba97f9555b5682ec23b1bf0e69f6457b3faa9dc0d1...
  - Origin operations: 1
  
# Response still returns "account" (singular):
{
  "id": "0x43378a280f3cee62f88db7ba97f9555b5682ec23b1bf0e69f6457b3faa9dc0d1...",
  "account": {  // ❌ Still returning singular
    "type": "kernel-v3.1-ecdsa",
    ...
  },
  ...
}

# Execute fails - without workaround:
❌ Error: {"error":"Validation failed","message":"Validation error: Required at \"accounts\"","statusCode":400}

# Execute fails - with client-side transformation workaround:
⚠️  Applying SUP-231 workaround: Converting account → accounts
❌ Error: {"message":"Incorrect tamper proof signature","statusCode":400}
```

**Status:** The backend API inconsistency remains unfixed. All V3 calldata flows are currently broken for this endpoint. Client-side workarounds are not possible due to signature validation.

---

## V1 vs V3 Calldata API Comparison

### Key Architectural Differences

| Aspect | V1 Endpoints | V3 Endpoints |
|--------|-------------|--------------|
| **Account Structure** | Single `account` object | `accounts` array (multi-account support) |
| **Asset Specification** | CAIP-19 only (`eip155:8453/erc20:0x...`) | CAIP-19 + Aggregated assets (`ob:usdc`) |
| **Cross-chain Routing** | Same-chain only for calldata | Cross-chain bridging supported via `fromAggregatedAssetId` |
| **Prepare Response** | `TargetCallQuote` | `TargetCallQuoteV3` (with `callType` indicator) |
| **Quote Request** | `CallRequest` with signed operation | `CallRequestV3` with `fromAggregatedAssetId` option |
| **Quote Response** | `Quote` with single account | `CallQuoteResponseV3` (but ❌ returns `account` instead of `accounts`) |
| **Endpoint Pattern** | `/api/quotes/{endpoint}` | `/api/v3/quote/{endpoint}` |

### V1 Flow (Working ✅)
```typescript
// 1. Prepare: Returns TargetCallQuote
const prepared = await prepareCallQuote({
  account: {...},  // Single account
  tokensRequired: [{ assetType: "eip155:8453/erc20:0x..." }]  // CAIP-19 only
});

// 2. Get Quote: Returns Quote
const quote = await fetchCallQuote({
  account: {...},  // Single account
  chainOperation: signedOp,
  tamperProofSignature: prepared.tamperProofSignature
});

// 3. Execute: Expects Quote
await executeQuote(quote);  // Works ✅
```

### V3 Flow (Currently Broken ❌)
```typescript
// 1. Prepare: Returns TargetCallQuoteV3
const prepared = await prepareCallQuoteV3({
  accounts: [{...}],  // Array!
  tokensRequired: [{ assetType: "eip155:8453/erc20:0x..." }]  // Still needs CAIP-19 here
});

// 2. Get Quote: Returns CallQuoteResponseV3 (with API bug)
const quote = await fetchCallQuoteV3({
  accounts: [{...}],  // Send array
  chainOperation: signedOp,
  tamperProofSignature: prepared.tamperProofSignature,
  fromAggregatedAssetId: 'ob:aero'  // V3 feature: specify source asset
});

// Response incorrectly has "account" instead of "accounts"
// quote.account ❌ (singular)
// quote.accounts ✅ (should be array)

// 3. Execute: Expects QuoteResponseV3 with accounts array
await executeQuoteV3(quote);  // Fails with "Required at 'accounts'" ❌
```

### V3 Advantages (When Fixed)
1. **Multi-account operations** - Execute operations across multiple accounts in one quote
2. **Aggregated asset support** - Use `ob:usdc`, `ob:aero` for cross-chain routing
3. **Smart routing** - `fromAggregatedAssetId` lets you specify which asset to use for bridging
4. **Enhanced metadata** - `callType` indicator (e.g., `same_chain_exclude_solver`)
5. **Better gas estimation** - More accurate for complex multi-step operations

### Current Recommendation
**Use V1 endpoints for production calldata flows** until the V3 `account`/`accounts` inconsistency is resolved. V1 is stable and works reliably for same-chain contract interactions.

V3 endpoints should be used only after backend fix is deployed.

---

## Additional V3 Learnings

### Token Specification in prepare-call-quote-v3

**Important:** Even though V3 supports aggregated assets, the `tokensRequired` field in `prepare-call-quote-v3` **must use CAIP-19 format**, NOT aggregated assets.

```typescript
// ❌ WRONG - Will fail with "Must be a valid CAIP-19 asset type"
tokensRequired: [
  {
    assetType: 'ob:aero',  // Aggregated asset - NOT allowed here
    amount: '500000000000000000'
  }
]

// ✅ CORRECT - Use CAIP-19 format in prepare step
tokensRequired: [
  {
    assetType: 'eip155:8453/erc20:0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    amount: '500000000000000000'
  }
]

// Then use aggregated asset in get-call-quote step:
const quote = await fetchCallQuoteV3({
  accounts: [account],
  chainOperation: signedOp,
  tamperProofSignature: prepared.tamperProofSignature,
  fromAggregatedAssetId: 'ob:aero'  // ✅ Aggregated asset goes here
});
```

**Why?** The `tokensRequired` field specifies what tokens the contract call needs on the target chain (specific chain-specific tokens). The `fromAggregatedAssetId` specifies where to source those tokens from (can be any chain via cross-chain routing).

### Workflow Summary
1. **Prepare:** Specify target chain tokens (CAIP-19) + contract calls
2. **Get Quote:** Specify source tokens (aggregated or CAIP-19)
3. **Execute:** Send the quote for execution
