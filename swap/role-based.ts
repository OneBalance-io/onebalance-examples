import { formatUnits, parseUnits } from 'viem';
import {
  readOrCacheEOAKey,
  fetchAggregatedBalanceV3,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signOperation,
  predictAddress,
  displaySwapQuote,
  ContractAccountType,
  QuoteRequestV3,
  ChainOperation,
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
 * Perform USDC to USDT swap using aggregated assets
 */
async function swapUSDCtoUSDT() {
  try {
    console.log('🚀 Starting USDC to USDT swap using aggregated assets...\n');

    // Load session and admin keys for role-based account
    const sessionKey = readOrCacheEOAKey('session');
    const adminKey = readOrCacheEOAKey('admin');

    console.log(`Session Address: ${sessionKey.address}`);
    console.log(`Admin Address: ${adminKey.address}`);

    // Predict account address for role-based account
    const accountAddress = await predictAddress(sessionKey.address, adminKey.address);
    console.log(`Predicted Account Address: ${accountAddress}`);

    // Configure role-based account for V3 API
    const account = {
      sessionAddress: sessionKey.address,
      adminAddress: adminKey.address,
      accountAddress: accountAddress,
    };

    console.log(`Using Role-Based Account: ${account.accountAddress}`);

    // Check USDC balance
    const balance = await checkUSDCBalance(account.accountAddress);
    const swapAmount = 1.0; // 1 USDC

    if (balance < swapAmount) {
      throw new Error(
        `Insufficient balance. Need ${swapAmount} USDC, have ${balance.toFixed(2)} USDC`,
      );
    }

    console.log(`\n💱 Swapping ${swapAmount} USDC to USDT...`);

    // Step 1: Get quote for USDC → USDT using aggregated assets
    console.log('📋 Getting quote...');

    const quoteRequest = {
      from: {
        accounts: [
          {
            type: 'role-based',
            sessionAddress: account.sessionAddress,
            adminAddress: account.adminAddress,
            accountAddress: account.accountAddress,
          },
        ],
        asset: {
          assetId: 'ob:usdc', // Aggregated USDC
        },
        amount: parseUnits(swapAmount.toString(), 6).toString(), // USDC has 6 decimals
      },
      to: {
        asset: {
          assetId: 'ob:usdt', // Aggregated USDT
        },
      },
    };

    console.log('quoteRequest', JSON.stringify(quoteRequest, null, 2));
    const quote = await getQuoteV3(quoteRequest as QuoteRequestV3);

    displaySwapQuote({
      quote,
      fromAssetId: 'ob:usdc',
      toAssetId: 'ob:usdt',
      fromAmount: parseUnits(swapAmount.toString(), 6).toString(),
      fromDecimals: 6,
    });

    // Step 2: Sign all chain operations
    console.log('\n🔐 Signing operations...');

    for (let i = 0; i < quote.originChainsOperations.length; i++) {
      const signedOperation = await signOperation(
        quote.originChainsOperations[i] as ChainOperation,
        sessionKey.privateKey,
        ContractAccountType.RoleBased, // Use role-based signing
      );
      quote.originChainsOperations[i] = signedOperation;
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
    console.log(`✨ You now have USDT in your account!`);

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
    await swapUSDCtoUSDT();
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run the swap if this file is executed directly
if (require.main === module) {
  main();
}
