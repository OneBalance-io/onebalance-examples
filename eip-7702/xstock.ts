import { parseUnits } from 'viem';
import {
  loadAccounts,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  checkAssetBalance,
  displaySwapQuote,
  getBalanceCheckAddress,
  type QuoteRequestV3,
  ContractAccountType,
} from '../helpers';

/**
 * xStock token definitions (Solana only)
 *
 * Note: xStocks are only available on Solana.
 * EVM chains don't have sufficient liquidity (returns "no routes found").
 */
const XSTOCKS = {
  ABTx: {
    symbol: 'ABTx',
    name: 'Abbott xStock',
    solana: 'XsHtf5RpxsQ7jeJ9ivNewouZKJHbPxhPoEy6yYvULr7',
  },
  ABBVx: {
    symbol: 'ABBVx',
    name: 'AbbVie xStock',
    solana: 'XswbinNKyPmzTa5CskMbCPvMW6G5CMnZXZEeQSSQoie',
  },
  ACNx: {
    symbol: 'ACNx',
    name: 'Accenture xStock',
    solana: 'Xs5UJzmCRQ8DWZjskExdSQDnbE6iLkRu2jjrRAB1JSU',
  },
  GOOGLx: {
    symbol: 'GOOGLx',
    name: 'Alphabet xStock',
    solana: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN',
  },
  AMZNx: {
    symbol: 'AMZNx',
    name: 'Amazon xStock',
    solana: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg',
  },
  AAPLx: {
    symbol: 'AAPLx',
    name: 'Apple xStock',
    solana: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
  },
} as const;

type XStockSymbol = keyof typeof XSTOCKS;

/**
 * Get CAIP-19 asset ID for xStock token on Solana
 */
function getXStockAssetId(symbol: XStockSymbol): string {
  const token = XSTOCKS[symbol];
  return `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:${token.solana}`;
}

/**
 * Buy xStock token on Solana
 * Uses EIP-7702 + Solana multiaccount for cross-chain purchases
 */
async function buyXStock(
  fromAssetId: string, // e.g., 'ob:usdc' or chain-specific USDC
  toAssetId: string, // Solana xStock token (use getXStockAssetId helper)
  amount: string, // Amount in base units (e.g., parseUnits('10', 6) for USDC)
  decimals: number, // Decimals of the from asset
  slippageTolerance: number = 100, // 1% default
) {
  try {
    console.log('🚀 Buying xStock token...\n');
    console.log(`💱 ${fromAssetId} → ${toAssetId}`);
    console.log(`💰 Amount: ${amount}\n`);

    // Step 1: Load accounts (EIP-7702 + Solana if buying on Solana)
    const { accounts, evmAccount, solanaAccount, signerKey, solanaKeypair } = await loadAccounts(
      {
        fromAssetId,
        toAssetId,
        amount,
        decimals,
      },
      'session2', // Session key name
      'eip7702', // Use EIP-7702 account type
    );

    // Step 2: Check balance
    const balanceAddress = getBalanceCheckAddress(fromAssetId, evmAccount, solanaAccount);
    await checkAssetBalance(balanceAddress, fromAssetId, decimals);

    // Step 3: Get quote
    console.log('\n📋 Getting quote...');
    const quoteRequest: QuoteRequestV3 = {
      from: {
        accounts,
        asset: { assetId: fromAssetId },
        amount,
      },
      to: {
        asset: { assetId: toAssetId },
        // Add recipient account for cross-chain to Solana
        ...(solanaAccount && {
          account: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${solanaAccount.accountAddress}`,
        }),
      },
      slippageTolerance,
    };

    console.log('Request:', JSON.stringify(quoteRequest, null, 2));

    const quote = await getQuoteV3(quoteRequest);

    console.log('\nQuote received:', JSON.stringify(quote, null, 2));

    // Display quote info
    displaySwapQuote({
      quote,
      fromAssetId,
      toAssetId,
      fromAmount: amount,
      fromDecimals: decimals,
    });

    // Step 4: Sign operations
    console.log('\n✍️  Signing operations...');
    const signedQuote = await signAllOperations(
      quote,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    // Step 5: Execute
    console.log('\n⚡ Executing purchase...');
    const result = await executeQuoteV3(signedQuote);
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('✅ Purchase submitted:', result.success);

    // Step 6: Monitor completion
    await monitorTransactionCompletion(quote);
    console.log('\n🎉 Successfully purchased xStock token!\n');

    return result;
  } catch (error) {
    console.error('\n❌ Failed to buy xStock:', (error as Error).message);
    throw error;
  }
}

/**
 * List available xStocks on Solana
 */
function listAvailableXStocks() {
  console.log('\n📊 Available xStocks (Solana only):\n');
  Object.entries(XSTOCKS).forEach(([symbol, token], index) => {
    console.log(`${index + 1}. ${symbol} - ${token.name}`);
    console.log(`   ${token.solana}`);
  });
  console.log('\n⚠️  Note: xStocks only work on Solana');
  console.log('   EVM chains have insufficient liquidity\n');
  console.log('Usage:');
  console.log('  getXStockAssetId(symbol) - get Solana CAIP-19 asset ID');
  console.log('  buyXStock(fromAssetId, toAssetId, amount, decimals, slippage)\n');
}

/**
 * Main - xStock purchase examples on Solana
 */
async function main() {
  try {
    // List available xStocks
    listAvailableXStocks();

    // Example 1: Buy Apple (AAPLx) on Solana using aggregated USDC
    // await buyXStock(
    //   'ob:usdc',
    //   getXStockAssetId('AAPLx'),
    //   parseUnits('1', 6).toString(),
    //   6,
    //   100,
    // );

    // Example 2: Buy Alphabet (GOOGLx) on Solana
    // await buyXStock(
    //   'ob:usdc',
    //   getXStockAssetId('GOOGLx'),
    //   parseUnits('1', 6).toString(),
    //   6,
    //   100,
    // );

    // Example 3: Buy Amazon (AMZNx) using chain-specific USDC from Arbitrum
    await buyXStock(
      'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      getXStockAssetId('AMZNx'),
      parseUnits('1', 6).toString(),
      6,
      100,
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
