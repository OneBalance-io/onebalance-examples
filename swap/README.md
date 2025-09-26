# OneBalance Swap Examples

This directory contains comprehensive examples demonstrating different swap scenarios using OneBalance's aggregated assets and various account types.

## Available Examples

### 1. Role-Based Account Swap (`role-based.ts`)
- **Account Type**: Role-based smart contract account
- **Swap**: 1 USDC → USDT
- **Assets**: `ob:usdc` → `ob:usdt`
- **API Version**: V3

### 2. Basic Account Swap (`basic.ts`)
- **Account Type**: Basic account (`kernel-v3.1-ecdsa`)
- **Swap**: 1 USDC → AERO
- **Assets**: `ob:usdc` → `ob:aero`
- **API Version**: V3

## What These Examples Demonstrate

1. **Balance Checking**: Uses V3 aggregated balance endpoint to check available tokens across all chains
2. **Quote Generation**: Requests quotes using aggregated asset IDs for optimal cross-chain routing
3. **Operation Signing**: Signs all required chain operations based on account type
4. **Quote Execution**: Submits signed quotes for execution
5. **Transaction Monitoring**: Tracks transactions until completion

## Key Features

- **Aggregated Assets**: Unified cross-chain token representation (`ob:usdc`, `ob:aero`, etc.)
- **Multiple Account Types**: Support for role-based and basic (kernel) accounts
- **Chain Abstraction**: Automatic chain selection for optimal execution
- **Gas Abstraction**: No need to manage gas tokens across different chains
- **Type Safety**: Full TypeScript support with OpenAPI-based types

## How to Run

### Role-Based Account Swap
```bash
npx ts-node swap/role-based.ts
```

### Basic Account Swap
```bash
npx ts-node swap/basic.ts
```

## Prerequisites

- Account with sufficient USDC balance (at least 1 USDC)
- Keys configured in `helpers/keys/` directory:
  - `session-key.json` (for both account types)
  - `admin-key.json` (for role-based accounts only)
- Environment variable `ONEBALANCE_API_KEY` set in `.env` (optional - defaults to public key)

## Account Types & Setup

### Role-Based Account
Uses dual-key architecture for enhanced security:

```typescript
const account = {
  type: 'role-based',
  sessionAddress: sessionKey.address,   // For normal operations
  adminAddress: adminKey.address,       // For emergency/admin operations
  accountAddress: predictedAddress,     // Smart contract account address
};
```

**Key Roles:**
- **Session Address**: Signs normal transactions and operations
- **Admin Address**: Backup admin that can perform emergency operations (rage quit)
- **Account Address**: The predicted smart contract account where funds are stored

### Basic Account (Kernel v3.1)
Uses single-key architecture for simplicity:

```typescript
const account = {
  type: 'kernel-v3.1-ecdsa',
  signerAddress: signerKey.address,     // EOA that signs operations
  accountAddress: predictedAddress,     // Smart contract account address
};
```

**Key Features:**
- **Single Signer**: One EOA address for all operations
- **Kernel v3.1**: Uses the Kernel v3.1 ECDSA validator
- **UserOp Signing**: Signs UserOperation hash instead of typed data

## Account Address Prediction

Both account types use deterministic address prediction:

```typescript
// Role-based account
const accountAddress = await predictAddress(sessionAddress, adminAddress);

// Basic account
const accountAddress = await predictBasicAddress('kernel-v3.1-ecdsa', signerAddress);
```

## Aggregated Assets

These examples showcase OneBalance's aggregated asset system:

- **`ob:usdc`** - Represents USDC across all supported chains
- **`ob:usdt`** - Represents USDT across all supported chains  
- **`ob:aero`** - Represents AERO token across supported chains

The system automatically:
- Finds the best chain to execute from
- Handles any necessary cross-chain operations
- Optimizes for fees and execution time
- Provides unified balance view across chains

## Signing Differences

### Role-Based Accounts
- Sign EIP-712 typed data using `signTypedData()`
- Use session key for normal operations

### Basic Accounts (Kernel v3.1)
- Sign UserOperation hash using `signMessage()`
- Use single signer key for all operations

```typescript
// Role-based signing
signOperation(operation, sessionKey.privateKey, ContractAccountType.RoleBased);

// Basic account signing
signOperation(operation, signerKey.privateKey, ContractAccountType.KernelV31);
```

## API Versions

### V1 API
- Single account per request
- EVM chains only
- Used by basic account example

### V3 API  
- Multi-account support
- Cross-chain operations (EVM + Solana)
- Used by role-based account example

## Error Handling

All examples include comprehensive error handling for:
- Insufficient balance validation
- Quote generation failures
- Signing operation errors
- Execution failures with detailed error messages
- Transaction monitoring timeouts
- Type safety with OpenAPI-based types

## Type Safety

Examples use strongly-typed interfaces based on the [OneBalance OpenAPI specification](https://docs.onebalance.io/api-reference/openapi.json):

- `QuoteRequestV1` / `QuoteRequestV3` for request types
- `QuoteResponseV1` / `QuoteResponseV3` for response types
- `Account` union type for different account configurations
- Full TypeScript support with proper error handling
