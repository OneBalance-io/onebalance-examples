# OneBalance Calldata Example

This example demonstrates how to perform ERC20 token transfers using OneBalance's smart account infrastructure. It shows the complete flow from key generation to transaction execution and monitoring.

## 🚀 Quickstart

```bash
# Install dependencies
pnpm install

# Run the example
pnpm calldata
```

## 📋 What This Example Does

1. **Generates EOA Keys** - Creates session and admin keys for the smart account and caches them locally
2. **Predicts Smart Account Address** - Calculates the smart account address before deployment using the generated keys
3. **Fetches Balances** - Retrieves USDC balances across all supported chains for the predicted address
4. **Executes Transfer** - Performs a small ERC20 USDC transfer (1 wei) from the smart account to the admin address
5. **Monitors Status** - Tracks transaction completion in real-time until it's confirmed

## 🔧 Configuration

- **Network**: Uses Arbitrum (`eip155:42161`) by default
- **Token**: Transfers USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`)
- **Amount**: Transfers 1 wei USDC for demonstration purposes

## 📁 Generated Files

The script generates these files on first run:
- `session-key.json` - Session key pair (cached for subsequent runs)
- `admin-key.json` - Admin key pair (cached for subsequent runs)

⚠️ **Important**: These files contain private keys. Never commit them to version control!

## 🎯 Key Features Demonstrated

- ✅ **EOA Key Generation** - Secure key pair creation and caching
- ✅ **Smart Account Prediction** - Calculate addresses before deployment
- ✅ **Cross-Chain Balance Queries** - Unified balance across multiple chains
- ✅ **ERC20 Token Transfers** - Execute transfers using OneBalance infrastructure
- ✅ **Transaction Monitoring** - Real-time status tracking
- ✅ **Error Handling** - Error management and retries

## 🚨 Important Notes

1. **API Key**: The example uses a public API key for demonstration. In production, use your own API key.
2. **Balance Requirements**: Ensure your smart account has sufficient USDC balance before running (`predictedAddress`).
3. **Key Security**: Session and admin keys are cached locally. Keep them secure!

## 🛠️ Troubleshooting

**No USDC Balance Found**: Fund your smart account with USDC on supported networks.
**Transaction Timeout**: Increase the timeout value or check network congestion.
**API Key Issues**: Verify your API key is correctly set in the headers.
