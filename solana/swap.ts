import { formatUnits, parseUnits } from 'viem';
import {
  loadMultiChainAccounts,
  monitorTransactionCompletion,
  fetchAggregatedBalanceV3,
  getQuoteV3,
  executeQuoteV3,
  signAllOperations,
  buildAccountParam,
  checkAssetBalance,
  getBalanceCheckAddress,
  displaySwapQuote,
  QuoteRequestV3,
  ContractAccountType,
} from '../helpers';

interface SwapSolanaAssetsParams {
  /** Source asset ID (e.g., 'ob:sol', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501') */
  fromAssetId: string;
  /** Destination asset ID (e.g., 'ob:usdc', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') */
  toAssetId: string;
  /** Amount to swap in smallest unit (wei-equivalent) */
  amount: string;
  /** Decimals of the source asset */
  fromDecimals: number;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageTolerance?: number;
}

/**
 * Get standard decimals for aggregated assets
 * Note: API returns aggregated balances in native token decimals
 */
function getAggregatedAssetDecimals(assetId: string): number {
  const decimalsMap: Record<string, number> = {
    'ob:usdc': 6, // USDC uses 6 decimals
    'ob:usdt': 6, // USDT uses 6 decimals
    'ob:sol': 9, // SOL uses 9 decimals
    'ob:eth': 18, // ETH uses 18 decimals
    'ob:weth': 18, // WETH uses 18 decimals
  };
  return decimalsMap[assetId] || 18;
}

/**
 * Get native decimals for a chain-specific asset
 */
function getNativeAssetDecimals(assetType: string): number {
  // Solana assets
  if (assetType.includes('slip44:501')) return 9; // SOL
  if (assetType.startsWith('solana:') && assetType.includes('token:')) return 6; // Most Solana tokens

  // BSC USDC/USDT has 18 decimals
  if (assetType.includes('eip155:56')) return 18;

  // Most EVM tokens have 6 decimals (USDC, USDT)
  if (assetType.includes('erc20:') || assetType.includes('token:')) return 6;

  // Native ETH and similar have 18 decimals
  return 18;
}

/**
 * Display balances for multiple aggregated assets across EVM and Solana
 */
async function displayMultiChainBalances(evmAccount: any, solanaAccount: any) {
  try {
    console.log('\n💰 Fetching balances for EVM and Solana accounts...\n');

    const accountParam = buildAccountParam(evmAccount, solanaAccount);
    const assetsToCheck = ['ob:usdc', 'ob:usdt', 'ob:sol'];

    // Fetch balances for all assets
    const balanceResponse = await fetchAggregatedBalanceV3(accountParam, assetsToCheck.join(','));

    console.log('📊 Account Balances:\n');
    console.log(`EVM Account: ${evmAccount.accountAddress}`);
    console.log(`Solana Account: ${solanaAccount.accountAddress}\n`);

    if (
      !balanceResponse.balanceByAggregatedAsset ||
      balanceResponse.balanceByAggregatedAsset.length === 0
    ) {
      console.log('No balances found for specified assets\n');
      return;
    }

    // Display each asset balance
    for (const asset of balanceResponse.balanceByAggregatedAsset) {
      const assetId = asset.aggregatedAssetId;
      const totalBalance = BigInt(asset.balance);
      const decimals = getAggregatedAssetDecimals(assetId);
      const formattedBalance = formatUnits(totalBalance, decimals);

      console.log(`${assetId.toUpperCase()}:`);
      console.log(`  Total: ${formattedBalance}`);

      // Show breakdown by chain
      if (asset.individualAssetBalances && asset.individualAssetBalances.length > 0) {
        console.log('  Breakdown:');
        for (const chainBalance of asset.individualAssetBalances) {
          const chainAmount = BigInt(chainBalance.balance);
          const chainDecimals = getNativeAssetDecimals(chainBalance.assetType);
          const chainFormatted = formatUnits(chainAmount, chainDecimals);

          // Skip zero balances in breakdown
          if (parseFloat(chainFormatted) === 0) continue;

          // Extract chain info from assetType
          let chainName = 'Unknown';
          if (chainBalance.assetType.startsWith('solana:')) {
            chainName = 'Solana';
          } else if (chainBalance.assetType.includes('eip155:')) {
            const chainIdMatch = chainBalance.assetType.match(/eip155:(\d+)/);
            if (chainIdMatch) {
              const chainId = chainIdMatch[1];
              const chainNames: Record<string, string> = {
                '1': 'Ethereum',
                '10': 'Optimism',
                '56': 'BSC',
                '137': 'Polygon',
                '8453': 'Base',
                '42161': 'Arbitrum',
                '43114': 'Avalanche',
              };
              chainName = chainNames[chainId] || `Chain ${chainId}`;
            }
          }

          console.log(`    - ${chainName}: ${chainFormatted}`);
        }
      }
      console.log('');
    }
  } catch (error) {
    console.error('Failed to fetch balances:', (error as Error).message);
  }
}

/**
 * Perform Solana swap from any asset to any asset
 * Supports both EVM and Solana accounts for cross-chain operations
 */
async function swapSolanaAssets({
  fromAssetId,
  toAssetId,
  amount,
  fromDecimals,
  slippageTolerance = 50,
}: SwapSolanaAssetsParams) {
  try {
    console.log('🚀 Starting Solana swap...\n');

    // Load multi-chain accounts (EVM + Solana)
    const { accounts, evmAccount, signerKey, solanaAccount, solanaKeypair } =
      await loadMultiChainAccounts({
        needsEvm: true,
        needsSolana: true,
        sessionKeyName: 'session2',
        evmAccountType: 'eip7702',
      });

    if (!evmAccount || !signerKey) {
      throw new Error('EVM account and signer key are required');
    }

    if (!solanaAccount || !solanaKeypair) {
      throw new Error('Solana account is required');
    }

    console.log(`Using EVM account: ${evmAccount.accountAddress}`);
    console.log(`Using Solana account: ${solanaAccount.accountAddress}`);

    // Display balances for both EVM and Solana accounts
    await displayMultiChainBalances(evmAccount, solanaAccount);

    // Check balance for source asset
    const balanceAddress = getBalanceCheckAddress(fromAssetId, evmAccount, solanaAccount);
    await checkAssetBalance(balanceAddress, fromAssetId, fromDecimals);

    console.log(
      `\n💱 Swapping ${formatUnits(BigInt(amount), fromDecimals)} ${fromAssetId} to ${toAssetId}...`,
    );

    // Step 1: Get quote
    console.log('\n📋 Getting quote...');

    const quoteRequest: QuoteRequestV3 = {
      from: {
        accounts,
        asset: {
          assetId: fromAssetId,
        },
        amount,
      },
      to: {
        asset: {
          assetId: toAssetId,
        },
      },
      slippageTolerance,
    };

    console.log('Quote request:', JSON.stringify(quoteRequest, null, 2));

    const quote = await getQuoteV3(quoteRequest);

    console.log('\n✅ Quote response:', JSON.stringify(quote, null, 2));

    displaySwapQuote({
      quote,
      fromAssetId,
      toAssetId,
      fromAmount: amount,
      fromDecimals,
    });

    // Step 2: Sign all operations (both EVM and Solana if needed)
    console.log('\n🔐 Signing operations...');

    const signedQuote = await signAllOperations(
      quote,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    console.log('✅ Operations signed successfully');

    // Step 3: Execute the swap
    console.log('\n⚡ Executing swap...');

    const result = await executeQuoteV3(signedQuote);

    if (!result.success) {
      throw new Error(result.error || 'Swap execution failed');
    }

    console.log('✅ Swap submitted successfully!');

    // Step 4: Monitor completion
    console.log('\n📋 Monitoring transaction...');
    await monitorTransactionCompletion(quote);

    console.log('\n🎉 Swap completed successfully!');
    console.log(
      `✨ Swapped ${formatUnits(BigInt(amount), fromDecimals)} ${fromAssetId} to ${toAssetId}`,
    );

    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function to run example swaps
 */
async function main() {
  try {
    // Example: SOL to USDC swap
    const SOL_ASSET_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
    const USDC_SOLANA_ASSET_ID =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    await swapSolanaAssets({
      fromAssetId: SOL_ASSET_ID,
      toAssetId: USDC_SOLANA_ASSET_ID,
      amount: parseUnits('0.002', 9).toString(),
      fromDecimals: 9,
      slippageTolerance: 50,
    });
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run the swap if this file is executed directly
if (require.main === module) {
  main();
}
