import { parseUnits, formatUnits } from 'viem';
import {
  loadMultiChainAccounts,
  buildAccountParam,
  getChainIdentifier,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  fetchAggregatedBalanceV3,
  type QuoteRequestV3,
  ContractAccountType,
} from '../helpers';

/**
 * Consolidate Stablecoins using EIP-7702 Account (with optional Solana support)
 *
 * Consolidates aggregated stablecoins to any destination chain.
 * Supports: ob:usdc, ob:usdt, ob:dai, Solana USDC, etc.
 *
 * Amount logic: Request up to total balance, script uses available from non-destination chains.
 *
 * Example: 8 USDC on Arbitrum (destination) + 3 USDC on Base + 2 USDC on Solana
 * - Request 10 USDC → consolidates 5 USDC from Base + Solana (excludes destination)
 *
 * Balance decimals: Public API uses 6, custom APIs may use 18.
 * Use parseUnits(amount, decimals) matching your API configuration.
 */

const ARBITRUM_CHAIN = 'eip155:42161';
const BASE_CHAIN = 'eip155:8453';
const BSC_CHAIN = 'eip155:56';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // has 6 decimals
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BSC_USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'; // has 18 decimals

// Get native decimals for a specific chain's USDC
function getNativeDecimals(chainId: string): number {
  // BSC USDC has 18 decimals, Solana USDC has 6, most EVM chains have 6
  return chainId === '56' ? 18 : 6;
}

// Calculate balance excluding destination chain
function calculateNonDestinationBalance(
  asset: any,
  destinationChainId: string,
  assetSymbol: string,
  targetDecimals: number, // Aggregated decimals (6 or 18)
): { nonDestinationBalance: bigint } {
  let nonDestinationBalance = 0n;

  console.log('\n💰 Balance breakdown:');
  for (const balance of asset.individualAssetBalances) {
    const amount = BigInt(balance.balance);
    const chainId = getChainIdentifier(balance.assetType);
    const nativeDecimals = getNativeDecimals(chainId);
    const isDestination = chainId === destinationChainId;

    const status = isDestination ? 'excluded' : 'included';
    console.log(
      `  - Chain ${chainId}: ${formatUnits(amount, nativeDecimals)} ${assetSymbol} (${status})`,
    );

    if (!isDestination) {
      // Normalize to target decimals before adding
      const decimalDiff = targetDecimals - nativeDecimals;
      const normalizedAmount = amount * 10n ** BigInt(decimalDiff);
      nonDestinationBalance += normalizedAmount;
    }
  }

  console.log(
    `\n📈 Available: ${formatUnits(nonDestinationBalance, targetDecimals)} ${assetSymbol}\n`,
  );

  return { nonDestinationBalance };
}

async function consolidateStablecoin(
  fromAssetId: string,
  toAssetId: string,
  amount: string,
  balanceDecimals: number, // Aggregated balance decimals (6 or 18)
  slippageTolerance: number = 50,
) {
  try {
    const assetSymbol = fromAssetId.replace('ob:', '').toUpperCase();
    const destinationChainId = toAssetId.match(/eip155:(\d+)/)?.[1];

    if (!destinationChainId) {
      throw new Error(`Invalid destination asset format: ${toAssetId}`);
    }

    const requestedAmount = BigInt(amount);
    console.log(
      `🚀 Consolidating ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol} to chain ${destinationChainId}...\n`,
    );

    const { accounts, evmAccount, signerKey, solanaKeypair, solanaAccount } =
      await loadMultiChainAccounts({
        needsEvm: true,
        needsSolana: true,
        sessionKeyName: 'session2',
        evmAccountType: 'eip7702',
      });

    if (!evmAccount || !signerKey) {
      throw new Error('EVM account is required for consolidation');
    }

    // Fetch detailed balance
    console.log('📊 Fetching balance distribution...');
    const accountParam = buildAccountParam(evmAccount, solanaAccount);
    const balanceResponse = await fetchAggregatedBalanceV3(accountParam, fromAssetId);

    const asset = balanceResponse.balanceByAggregatedAsset?.find(
      (a) => a.aggregatedAssetId === fromAssetId,
    );

    if (!asset) {
      throw new Error(`No ${assetSymbol} balance found`);
    }

    console.log(
      `💰 Total balance: ${formatUnits(BigInt(asset.balance), balanceDecimals)} ${assetSymbol}\n`,
    );

    const { nonDestinationBalance } = calculateNonDestinationBalance(
      asset,
      destinationChainId,
      assetSymbol,
      balanceDecimals,
    );

    if (nonDestinationBalance === 0n) {
      console.log('✓ All funds already on destination, no consolidation needed');
      return { success: true, skipped: true };
    }

    // nonDestinationBalance is already in aggregated decimals
    const availableAmount = nonDestinationBalance;
    const totalBalanceValue = BigInt(asset.balance);

    if (requestedAmount === 0n) {
      throw new Error('Amount must be greater than 0');
    }

    if (requestedAmount > totalBalanceValue) {
      throw new Error(
        `Insufficient balance: requested ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}, ` +
          `total balance ${formatUnits(totalBalanceValue, balanceDecimals)} ${assetSymbol}`,
      );
    }

    // Use min(requested, available from non-destination chains)
    const amountToConsolidate =
      requestedAmount < availableAmount ? requestedAmount : availableAmount;

    console.log(`📊 Consolidation plan:`);
    console.log(`   Requested: ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}`);
    console.log(
      `   Will use: ${formatUnits(amountToConsolidate, balanceDecimals)} ${assetSymbol} (from non-destination chains)\n`,
    );

    console.log('📋 Getting swap quote...');

    const swapQuoteRequest: QuoteRequestV3 = {
      from: {
        accounts,
        asset: { assetId: fromAssetId },
        amount: amountToConsolidate.toString(),
      },
      to: {
        asset: { assetId: toAssetId },
        account: `eip155:${destinationChainId}:${evmAccount.accountAddress}`,
      },
      slippageTolerance,
    };

    console.log('Swap quote request:', JSON.stringify(swapQuoteRequest, null, 2));

    const swapQuote = await getQuoteV3(swapQuoteRequest);

    console.log('\n✅ Swap quote response:', JSON.stringify(swapQuote, null, 2));

    const destDecimals = getNativeDecimals(destinationChainId);
    console.log(`\n✅ Quote ID: ${swapQuote.id}`);
    console.log(
      `   Amount out: ${formatUnits(BigInt(swapQuote.destinationToken?.amount || 0), destDecimals)} ${assetSymbol}`,
    );

    console.log('\n📋 Signing and executing...');
    const signedSwapQuote = await signAllOperations(
      swapQuote,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    const result = await executeQuoteV3(signedSwapQuote);

    if (!result.success) {
      throw new Error(result.error || 'Execution failed');
    }

    console.log('⚡ Executed, monitoring...');
    await monitorTransactionCompletion(swapQuote);

    console.log(
      `\n✅ Consolidated ${formatUnits(amountToConsolidate, balanceDecimals)} ${assetSymbol} to chain ${destinationChainId}\n`,
    );

    return { success: true, result };
  } catch (error) {
    console.error('\n❌ Consolidation failed:', (error as Error).message);
    throw error;
  }
}

async function main() {
  try {
    // Example 1: Public API (6 decimals)
    // await consolidateStablecoin(
    //   'ob:usdc',
    //   `${BSC_CHAIN}/erc20:${BSC_USDC}`,
    //   parseUnits('1', 6).toString(),
    //   6,
    // );

    // Example 2: Team API (18 decimals)
    await consolidateStablecoin(
      'ob:usdc',
      `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
      parseUnits('3', 18).toString(),
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
