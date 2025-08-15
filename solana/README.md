# OneBalance Solana Integration Example

This example demonstrates how to integrate Solana with OneBalance using the v3 API endpoints, enabling cross-chain operations between Solana and EVM chains.

## Features

- 🔑 **Solana Keypair Management**: Generate and cache Solana keypairs locally
- 💰 **Balance Checking**: Get aggregated balances across multiple chains using v3 API
- 🔄 **Solana Swaps**: Swap SOL to USDC within the Solana ecosystem
- 🌉 **Cross-Chain Operations**: Transfer assets between Solana and EVM chains
- ✍️ **Transaction Signing**: Sign Solana transactions using `@solana/web3.js`
- 📊 **Status Monitoring**: Track quote execution status with real-time updates

## Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm/yarn
- Basic understanding of Solana and OneBalance concepts

## Installation

```bash
# Install dependencies
pnpm install

# Or with npm
npm install
```

## Quick Start

```bash
# Run the demo script
pnpm start

# Or run in development mode with auto-reload
pnpm dev
```

## How It Works

### 1. Keypair Management

The script automatically generates and caches a Solana keypair:

```typescript
const solanaKey = readOrCacheSolanaKey('demo');
console.log('🔑 Solana Public Key:', solanaKey.publicKey);
```

Keypairs are saved as JSON files (e.g., `demo-solana-key.json`) for reuse across sessions.

### 2. Balance Checking

Check aggregated balances across all supported chains:

```typescript
const balances = await getAggregatedBalanceV3([`solana:${solanaKey.publicKey}`]);
console.log('💰 Total fiat value:', balances.totalBalance.fiatValue);
```

### 3. SOL to USDC Swap

Get a quote for swapping SOL to USDC on Solana:

```typescript
const quote = await swapSolToUSDC(solanaAccount, '10000000'); // 0.01 SOL
```

### 4. Cross-Chain Operations

Transfer USDC from Solana to Ethereum (or other EVM chains):

```typescript
const crossChainQuote = await crossChainTransfer(
  solanaAccount,
  'eip155:1:0x742F2c0c6b8fC7e53bb68C0F00FC6b66C0B7f6A4', // Ethereum address
  '1000000' // 1 USDC
);
```

### 5. Transaction Signing

Sign and execute quotes using Solana-specific signing:

```typescript
const result = await signAndExecuteQuote(quote, solanaKey.keypair);
await monitorQuoteExecution(quote.id);
```

## Key Differences from EVM

### API Endpoints
- Uses **v3 API endpoints** which support multiple account types
- Account structure uses `accounts` array instead of single account object

### Signing Process
- **EVM**: Uses typed data signing with `viem`
- **Solana**: Uses `MessageV0` and `VersionedTransaction` from `@solana/web3.js`

```typescript
// Solana signing flow
const message = MessageV0.deserialize(Buffer.from(dataToSign, 'base64'));
const transaction = new VersionedTransaction(message);
transaction.sign([keypair]);
const signature = bs58.encode(Buffer.from(transaction.signatures[0]));
```

### Asset Identifiers
- **SOL**: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501`
- **USDC on Solana**: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **Aggregated USDC**: `ds:usdc`

## API Reference

### Core Functions

#### `getQuoteV3(quoteRequest: QuoteRequestV3)`
Get a quote for asset swaps or transfers with v3 multi-account support.

#### `executeQuoteV3(quote: QuoteResponseV3)`
Execute a signed quote on-chain.

#### `getAggregatedBalanceV3(accounts: string[], assetIds?: string[])`
Fetch aggregated balances across multiple chains and account types.

#### `signSolanaOperation(dataToSign: string, keypair: Keypair)`
Sign Solana transactions using the OneBalance format.

#### `monitorQuoteExecution(quoteId: string, timeoutMs?: number)`
Monitor quote execution status with polling.

## Configuration

### API Base URL
```typescript
const BASE_URL = 'https://be.staging.onebalance.io'; // Staging
// const BASE_URL = 'https://be.onebalance.io'; // Production
```

### API Key
The script uses a public test API key. For production use, get your own API key from [OneBalance](https://docs.onebalance.io).

## Example Output

```
🚀 OneBalance Solana Integration Demo
=====================================
🔑 Solana Public Key: J5CCzBULFax899tcirb6wMbenQUd8whbaetG7EfSick5

📊 Checking balances...
💰 Total fiat value: 0
📈 Aggregated assets: 0

📝 Getting SOL to USDC quote...
ℹ️  Quote failed (might be due to insufficient balance or network issues)

🌉 Getting cross-chain quote...
ℹ️  Cross-chain quote failed (might be due to insufficient balance)

✨ Demo completed!

📚 Next steps:
  - Fund your Solana account to test actual swaps
  - Try different asset combinations
  - Implement transaction execution and monitoring
  - Explore cross-chain operations
```

## Funding Your Account

To test actual transactions, you'll need to fund your Solana account:

1. Copy your public key from the script output
2. Send SOL or SPL tokens to this address
3. Run the script again to see your balances and test swaps

### Solana Devnet Faucet
For testing on devnet:
```bash
solana airdrop 2 <YOUR_PUBLIC_KEY> --url devnet
```

## Error Handling

The script includes comprehensive error handling:
- API errors are logged with full response details
- Network timeouts are handled gracefully
- Insufficient balance scenarios are caught and explained

## Security Notes

- 🔐 Keypairs are stored locally in JSON files
- 🚨 Never commit keypair files to version control
- 🔑 Use secure key management for production applications
- 🌐 Be cautious with mainnet transactions and real funds

## Next Steps

1. **Fund Account**: Add SOL or SPL tokens to test real swaps
2. **Custom Assets**: Try different token combinations
3. **Production Setup**: Get production API keys and update base URL
4. **Integration**: Incorporate into your dApp or service
5. **Advanced Features**: Explore multi-account operations and complex routing

## Support

- 📚 [OneBalance Documentation](https://docs.onebalance.io)
- 💬 [Discord Community](https://discord.gg/onebalance)
- 🐛 [GitHub Issues](https://github.com/onebalance/onebalance-examples)

## License

MIT License - see [LICENSE](../LICENSE) file for details. 