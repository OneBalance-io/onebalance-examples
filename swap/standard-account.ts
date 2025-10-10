import { formatUnits, parseUnits } from 'viem';
import {
  readOrCacheEOAKey,
  fetchAggregatedBalanceV3,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signOperation,
  predictStandardAddress,
  ContractAccountType,
} from '../helpers';

/**
 * Check USDC balance using aggregated balance endpoint
 */
async function checkUSDCBalance(accountAddress: string) {
  try {
    console.log('🔍 Checking USDC balance...');

    const response = await fetchAggregatedBalanceV3(
      `eip155:42161:${accountAddress}`, // Using Arbitrum as primary chain
      'ob:usdc', // Aggregated USDC asset ID
    );

    const usdcBalance = response.balanceByAggregatedAsset?.find(
      (asset) => asset.aggregatedAssetId === 'ob:usdc',
    );

    if (!usdcBalance) {
      throw new Error('No USDC balance found');
    }

    const balanceInUSDC = parseFloat(formatUnits(BigInt(usdcBalance.balance), 6));
    console.log(`💰 Available USDC balance: ${balanceInUSDC.toFixed(2)} USDC`);

    return balanceInUSDC;
  } catch (error) {
    console.error('Failed to check balance:', error);
    throw error;
  }
}

/**
 * Perform USDC to AERO swap using standard account
 */
async function swapUSDCtoAERO() {
  try {
    console.log('🚀 Starting USDC to AERO swap using standard account...\n');

    // Load signer key for standard account
    const signerKey = readOrCacheEOAKey('session');

    console.log(`Signer Address: ${signerKey.address}`);

    // Predict account address for standard account
    const accountAddress = await predictStandardAddress('kernel-v3.1-ecdsa', signerKey.address);
    console.log(`Predicted Account Address: ${accountAddress}`);

    // Configure standard account for V3 API
    const account = {
      type: 'kernel-v3.1-ecdsa',
      signerAddress: signerKey.address,
      accountAddress: accountAddress,
    };

    console.log(`Using Standard Account: ${account.accountAddress}`);

    // Check USDC balance
    const balance = await checkUSDCBalance(account.accountAddress);
    const swapAmount = 1.0; // 1 USDC

    if (balance < swapAmount) {
      throw new Error(
        `Insufficient balance. Need ${swapAmount} USDC, have ${balance.toFixed(2)} USDC`,
      );
    }

    console.log(`\n💱 Swapping ${swapAmount} USDC to AERO...`);

    // Step 1: Get quote for USDC → AERO using aggregated assets
    console.log('📋 Getting quote...');

    const quoteRequest = {
      from: {
        accounts: [
          {
            type: 'kernel-v3.1-ecdsa' as const,
            signerAddress: account.signerAddress as `0x${string}`,
            accountAddress: account.accountAddress as `0x${string}`,
          },
        ],
        asset: {
          assetId: 'ob:usdc', // Aggregated USDC
        },
        amount: parseUnits(swapAmount.toString(), 6).toString(), // USDC has 6 decimals
      },
      to: {
        asset: {
          assetId: 'ob:aero', // Aggregated AERO
        },
      },
    };

    console.log('quoteRequest', JSON.stringify(quoteRequest, null, 2));
    const quote = await getQuoteV3(quoteRequest);

    console.log('✅ Quote received:', {
      id: quote.id,
      willReceive: quote.destinationToken
        ? `${formatUnits(BigInt(quote.destinationToken.amount), 18)} AERO`
        : 'Unknown amount', // AERO has 18 decimals
      fiatValue: quote.destinationToken ? `$${quote.destinationToken.fiatValue}` : 'Unknown value',
    });

    // Step 2: Sign all chain operations
    console.log('\n🔐 Signing operations...');

    for (let i = 0; i < quote.originChainsOperations.length; i++) {
      const operation = quote.originChainsOperations[i];
      // Only sign EVM operations, skip Solana operations
      if ('userOp' in operation && 'typedDataToSign' in operation) {
        const signedOperation = await signOperation(
          operation,
          signerKey.privateKey,
          ContractAccountType.KernelV31, // Use kernel v3.1 signing
        );
        quote.originChainsOperations[i] = signedOperation;
      }
    }

    console.log('✅ All operations signed successfully');

    // Step 3: Execute the swap
    console.log('\n⚡ Executing swap...');

    const result = await executeQuoteV3(quote);

    console.log('🎯 Swap submitted successfully!');
    console.log('Execution success:', result.success);

    // Step 4: Monitor completion
    await monitorTransactionCompletion(quote);

    console.log('\n🎉 Swap completed successfully!');
    console.log(`✨ You now have AERO in your account!`);

    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function to run the swap
 */
async function main() {
  try {
    await swapUSDCtoAERO();
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run the swap if this file is executed directly
if (require.main === module) {
  main();
}
