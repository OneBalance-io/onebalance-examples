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
 * Simple EIP-7702 token swap
 * Supports both EVM-only and cross-chain (EVM + Solana) swaps
 */
async function eip7702Swap(
  fromAssetId: string,
  toAssetId: string,
  amount: string,
  decimals: number,
  slippageTolerance: number = 100,
  recipientAccount?: string,
) {
  try {
    console.log('🚀 Starting EIP-7702 swap...\n');
    console.log(`💱 ${fromAssetId} → ${toAssetId}`);

    // Step 1: Load accounts (EIP-7702 + Solana if needed)
    const { accounts, evmAccount, solanaAccount, signerKey, solanaKeypair } = await loadAccounts(
      {
        fromAssetId,
        toAssetId,
        amount,
        decimals,
      },
      'session2',
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
        ...(recipientAccount && { account: recipientAccount }),
      },
      slippageTolerance,
    };

    console.log('Request:', JSON.stringify(quoteRequest, null, 2));

    const quote = await getQuoteV3(quoteRequest);

    console.log('Quote:', JSON.stringify(quote, null, 2));

    // Display quote info
    displaySwapQuote({
      quote,
      fromAssetId,
      toAssetId,
      fromAmount: amount,
      fromDecimals: decimals,
    });

    // Step 4: Sign operations
    const signedQuote = await signAllOperations(
      quote,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    // Step 5: Execute
    console.log('\n⚡ Executing swap...');
    const result = await executeQuoteV3(signedQuote);
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('✅ Swap submitted:', result.success);

    await monitorTransactionCompletion(quote);
    console.log('\n🎉 Swap completed!\n');

    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main - swap examples
 */
async function main() {
  try {
    // Example 1: ob:usdc to RESOLV on BSC
    // await eip7702Swap(
    //   'ob:usdc',
    //   'eip155:56/erc20:0xda6cef7f667d992a60eb823ab215493aa0c6b360', // RESOLV on BSC
    //   parseUnits('0.5', 6).toString(), // USDC has 6 decimals
    //   6,
    // );

    // Example 2: RESOLV to ob:usdc on BSC
    // await eip7702Swap(
    //   'eip155:56/erc20:0xda6cef7f667d992a60eb823ab215493aa0c6b360', // RESOLV on BSC
    //   'ob:usdc',
    //   parseUnits('3.4', 18).toString(), // RESOLV has 18 decimals
    //   18,
    // );

    // Example 3: Solana Mango to Base USDC
    // await eip7702Swap(
    //   'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac',
    //   'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    //   parseUnits('6', 6).toString(), // MNGO has 6 decimals
    //   6,
    //   100, // 1% slippage
    //   'eip155:8453:0xbb3b207d38E7dcEE4053535fdEA42D6b8D3477Da', // Recipient account
    // );

    // Example 4: ob:usdc to USDC on Arbitrum
    // await eip7702Swap(
    //   'ob:usdc',
    //   'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
    //   parseUnits('1', 6).toString(),
    //   6, // USDC has 6 decimals
    //   50, // 0.5% slippage
    //   'eip155:42161:0x46c0726a3a82ee887B2DfF336f05c760Ac6AeDcd', // Recipient account
    // );

    // Example 5: Swap from USDC on Ethereum to 1INCH on Base
    await eip7702Swap(
      'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
      'eip155:8453/erc20:0xc5fecC3a29Fb57B5024eEc8a2239d4621e111CBE', // 1INCH on Base
      parseUnits('1', 6).toString(),
      6, // USDC has 6 decimals
      50, // 0.5% slippage
      'eip155:8453:0xE8e8265a733984caA7d44426a3bEe5BAa945ed1d', // Recipient account
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
