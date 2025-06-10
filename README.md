# OneBalance API Examples & Code Snippets

This repository contains practical examples and code snippets for integrating with the OneBalance API. OneBalance enables cross-chain asset management and smart account operations through a unified interface.

## 🚀 Quickstart

```bash
# Install dependencies
pnpm install

# Run the calldata example
pnpm calldata
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
