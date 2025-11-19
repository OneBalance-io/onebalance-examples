import { parseUnits } from 'viem';
import {
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  loadAccounts,
  checkAssetBalance,
  buildQuoteRequest,
  signAllOperations,
  getBalanceCheckAddress,
  displaySwapQuote,
  SwapParams,
} from '../helpers';

/**
 * Universal swap function using standard account (kernel-v3.1-ecdsa)
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
    const quoteRequest = buildQuoteRequest(swapParams, accounts, {
      slippageTolerance: swapParams.slippageTolerance,
      recipientAccount: swapParams.recipientAccount,
    });
    console.log('Quote Request:', JSON.stringify(quoteRequest, null, 2));

    const quote = await getQuoteV3(quoteRequest);

    // Display quote info
    displaySwapQuote({
      quote,
      fromAssetId: swapParams.fromAssetId,
      toAssetId: swapParams.toAssetId,
      fromAmount: swapParams.amount,
      fromDecimals: swapParams.decimals,
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
    //     fromAssetId: 'ob:usdc',
    //     toAssetId: 'ob:sol',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 2: Swap from aggregated USDT to Solana USDC
    // await simpleSwap({
    //     fromAssetId: 'ob:usdt',
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
    //     toAssetId: 'ob:usdc',
    //     amount: parseUnits('1.5', 18).toString(),
    //     decimals: 18
    // });

    // Example 6: Swap from aggregated USDC to JUP on Solana
    // await simpleSwap({
    //   fromAssetId: 'ob:usdc',
    //   toAssetId:
    //     'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    //   amount: parseUnits('0.7', 6).toString(),
    //   decimals: 6,
    // });

    // Example 7: Swap from Solana Mango to Base USDC
    await simpleSwap({
      fromAssetId:
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac',
      toAssetId: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amount: parseUnits('6', 6).toString(),
      decimals: 6,
      slippageTolerance: 100,
      recipientAccount: 'eip155:8453:0xbb3b207d38E7dcEE4053535fdEA42D6b8D3477Da',
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
