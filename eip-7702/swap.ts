import { parseUnits } from 'viem';
import {
  readOrCacheEOAKey,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  checkAssetBalance,
  displaySwapQuote,
  type EIP7702Account,
  type QuoteRequestV3,
  type Hex,
  ContractAccountType,
} from '../helpers';

/**
 * Simple EIP-7702 token swap
 * Reusable function - just pass from/to assets and amount
 */
async function eip7702Swap(
  fromAssetId: string,
  toAssetId: string,
  amount: string,
  decimals: number,
) {
  try {
    console.log('🚀 Starting EIP-7702 swap...\n');
    console.log(`💱 ${fromAssetId} → ${toAssetId}`);

    // Step 1: Load EIP-7702 account
    const signerKey = readOrCacheEOAKey('session2');
    const eip7702Account: EIP7702Account = {
      type: 'kernel-v3.3-ecdsa',
      deploymentType: 'EIP7702',
      accountAddress: signerKey.address.toLowerCase() as Hex,
      signerAddress: signerKey.address.toLowerCase() as Hex,
    };

    console.log('Account:', eip7702Account.accountAddress);

    // Step 2: Check balance
    await checkAssetBalance(eip7702Account.accountAddress, fromAssetId, decimals);

    // Step 3: Get quote
    console.log('\n📋 Getting quote...');
    const quoteRequest: QuoteRequestV3 = {
      from: {
        accounts: [eip7702Account],
        asset: { assetId: fromAssetId },
        amount,
      },
      to: {
        asset: { assetId: toAssetId },
      },
      slippageTolerance: 100, // 1%
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
      null,
      null,
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
    await eip7702Swap(
      'eip155:56/erc20:0xda6cef7f667d992a60eb823ab215493aa0c6b360', // RESOLV on BSC
      'ob:usdc',
      parseUnits('3.4', 18).toString(), // RESOLV has 18 decimals
      18,
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
