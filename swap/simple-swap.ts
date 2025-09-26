import { formatUnits, parseUnits } from 'viem';
import {
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  loadAccounts,
  checkAssetBalance,
  buildQuoteRequest,
  signAllOperations,
  getBalanceCheckAddress,
  SwapParams,
} from '../helpers';

/**
 * Universal swap function using basic account (kernel-v3.1-ecdsa)
 * Executes any swap payload without balance checking
 */
async function simpleSwap(swapParams: SwapParams) {
  try {
    console.log('🚀 Starting a swap...\n');
    console.log(`💱 ${swapParams.fromAssetId} → ${swapParams.toAssetId}`);

    // Step 1: Load accounts (EVM + Solana if needed)
    const { accounts, evmAccount, solanaAccount, signerKey, solanaKeypair } = await loadAccounts(
      swapParams,
      'session2',
    );

    // Step 2: Check balance for the from asset
    const balanceCheckAddress = getBalanceCheckAddress(
      swapParams.fromAssetId,
      evmAccount,
      solanaAccount,
    );
    await checkAssetBalance(balanceCheckAddress, swapParams.fromAssetId, swapParams.decimals);

    // Step 3: Get quote
    console.log('\n📋 Getting quote...');
    const quoteRequest = buildQuoteRequest(swapParams, accounts);
    console.log('Quote Request:', JSON.stringify(quoteRequest, null, 2));

    const quote = await getQuoteV3(quoteRequest);

    // Display quote info
    const fromAmount = swapParams.decimals
      ? formatUnits(BigInt(swapParams.amount), swapParams.decimals)
      : swapParams.amount;

    console.log('✅ Quote received:', {
      id: quote.id,
      from: `${fromAmount} ${swapParams.fromAssetId}`,
      willReceive: quote.destinationToken
        ? `${formatUnits(BigInt(quote.destinationToken.amount), 18)} ${swapParams.toAssetId}`
        : 'Unknown amount',
      fiatValue: quote.destinationToken ? `$${quote.destinationToken.fiatValue}` : 'Unknown value',
    });

    // Step 4: Sign all operations (EVM + Solana)
    const signedQuote = await signAllOperations(quote, signerKey, solanaKeypair, solanaAccount);

    // Step 5: Execute
    console.log('\n⚡ Ready to execute swap...');

    const result = await executeQuoteV3(signedQuote);
    console.log('🎯 Swap submitted successfully!');
    console.log('Execution success:', result.success);

    await monitorTransactionCompletion(quote);
    console.log('\n🎉 Swap completed successfully!');

    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function with examples
 */
async function main() {
  try {
    // Example 1: Swap from aggregated USDC to SOL on Solana
    // await simpleSwap({
    //     fromAssetId: 'ds:usdc',
    //     toAssetId: 'ds:sol',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 2: Swap from aggregated USDT to Solana USDC
    // await simpleSwap({
    //     fromAssetId: 'ds:usdt',
    //     toAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 3: Swap from USDC on Arbitrum to AAVE on Base
    // await simpleSwap({
    //     fromAssetId: 'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 4: Swap from USDC on Optimism to AAVE on Base
    // await simpleSwap({
    //     fromAssetId: 'eip155:10/erc20:0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 5: Swap from AERO on Base to aggregated USDC
    // await simpleSwap({
    //     fromAssetId: 'eip155:8453/erc20:0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    //     toAssetId: 'ds:usdc',
    //     amount: parseUnits('1.5', 18).toString(),
    //     decimals: 18
    // });

    // Example 6: Swap from aggregated USDC to JUP on Solana
    await simpleSwap({
      fromAssetId: 'ds:usdc',
      toAssetId:
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      amount: parseUnits('0.7', 6).toString(),
      decimals: 6,
    });
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}
