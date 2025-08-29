# OneBalance API Examples & Code Snippets

This repository contains practical examples and code snippets for integrating with the OneBalance API. OneBalance enables cross-chain asset management and smart account operations through a unified interface.

## 🚀 Quickstart

```bash
# Install dependencies
pnpm install

# Run the calldata example
pnpm calldata

# Run the EIP-7702 example
pnpm eip-7702
```

## 📋 Table of Contents

- [Authentication](#authentication)
- [Available Examples](#available-examples)

## 🔐 Authentication

All OneBalance API requests require authentication using an API key:

```typescript
const PUBLIC_API_KEY = 'your-api-key-here';

function createAuthHeaders(): Record<string, string> {
  return {
    'x-api-key': PUBLIC_API_KEY,
  };
}
```

## 🛠️ Available Examples

### Calldata Example (`onebalance-calldata/`)

Complete example demonstrating:
- EOA key generation and caching
- Smart account address prediction
- Balance fetching and monitoring
- ERC20 token transfers using OneBalance
- Transaction status monitoring

```bash
# Run the calldata example
pnpm calldata
```

### EIP-7702 Example (`eip-7702/`)

Atomic cross-chain execution using EIP-7702 delegation:
- **No address prediction needed** - EOA addresses remain unchanged
- **Atomic delegation** - Delegate EOA to smart account capabilities
- **4-step process**: Prepare → Sign → Quote → Execute atomically
- **Zero intermediate states** - Everything happens in one transaction

```bash
# Run the EIP-7702 example
pnpm eip-7702
```

### Shared Helpers (`helpers/`)

Reusable utilities for all examples:
- **API helpers** - OneBalance API communication and authentication
- **Crypto helpers** - Key generation, caching, and signing utilities  
- **Type definitions** - Complete TypeScript interfaces for all operations
- **OneBalance helpers** - High-level functions for common operations
- **Centralized keys** - All examples use shared keys stored in `helpers/keys/`

**Note:** Keys are automatically generated and cached in `helpers/keys/` directory. Both `session` and `admin` keys are shared across all examples for consistency.

## 🔧 Configuration

### Environment Setup

Create a `.env` file (optional):
```env
ONEBALANCE_API_KEY=your-api-key-here
ONEBALANCE_BASE_URL=https://be.onebalance.io
```

## 🤝 Contributing

Feel free to contribute additional examples and improvements to this repository!

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
