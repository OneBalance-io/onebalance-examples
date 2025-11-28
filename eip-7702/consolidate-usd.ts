import { parseUnits, formatUnits } from 'viem';
import {
  loadAccounts,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  fetchAggregatedBalanceV3,
  type QuoteRequestV3,
  ContractAccountType,
} from '../helpers';

/**
 * Consolidate Stablecoins using EIP-7702 Account
 *
 * Flexible consolidation for any aggregated stablecoin to any destination chain.
 * Supports: ob:usdc, ob:usdt, ob:dai, ob:usd, etc.
 *
 * CRITICAL: Destination chain balance is automatically excluded from consolidation.
 * Example with 10 USDC total:
 * - 5 USDC on Arbitrum (destination) → excluded
 * - 3 USDC on Base → included
 * - 2 USDC on BSC → included
 *
 * Only 5 USDC (Base + BSC) available for consolidation.
 *
 * Balance decimals:
 * - Public API: 6 decimals (use parseUnits('10', 6))
 * - Team XYZ API: 18 decimals (use parseUnits('10', 18))
 * - BSC native USDC: 18 decimals
 * - Most chains: 6 decimals
 *
 * Use cases: Consolidate before deposits, reduce cross-chain complexity, prepare
 * for on-chain operations requiring single-chain funds.
 */

const ARBITRUM_CHAIN = 'eip155:42161';
const BASE_CHAIN = 'eip155:8453';
const BSC_CHAIN = 'eip155:56';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // has 6 decimals
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BSC_USDC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'; // has 18 decimals

// Get native decimals for a specific chain's USDC
function getNativeDecimals(chainId: string): number {
  // BSC USDC has 18 decimals, most others have 6
  return chainId === '56' ? 18 : 6;
}

// Calculate balance excluding destination chain
function calculateNonDestinationBalance(
  asset: any,
  destinationChainId: string,
  assetSymbol: string,
): {
  nonDestinationBalance: bigint;
  destinationBalance: bigint;
  totalBalance: bigint;
  consolidationDecimals: number;
} {
  let nonDestinationBalance = 0n;
  let destinationBalance = 0n;
  let consolidationDecimals = 6; // Default to 6, will be set based on actual source chains

  console.log('\n💰 Balance breakdown:');
  for (const balance of asset.individualAssetBalances) {
    const amount = BigInt(balance.balance);
    const balanceChainId = balance.assetType.match(/eip155:(\d+)/)?.[1];
    const nativeDecimals = getNativeDecimals(balanceChainId || '');
    const isDestination = balanceChainId === destinationChainId;

    if (isDestination) {
      destinationBalance += amount;
      console.log(
        `  - Chain ${balanceChainId}: ${formatUnits(amount, nativeDecimals)} ${assetSymbol} (excluded)`,
      );
    } else {
      nonDestinationBalance += amount;
      // Set consolidation decimals based on actual source chains
      if (amount > 0n) {
        consolidationDecimals = Math.max(consolidationDecimals, nativeDecimals);
      }
      console.log(
        `  - Chain ${balanceChainId}: ${formatUnits(amount, nativeDecimals)} ${assetSymbol} (included)`,
      );
    }
  }

  const totalBalance = nonDestinationBalance + destinationBalance;
  console.log(
    `\n📈 Available for consolidation: ${formatUnits(nonDestinationBalance, consolidationDecimals)} ${assetSymbol}`,
  );
  console.log(
    `   Already on destination: ${formatUnits(destinationBalance, getNativeDecimals(destinationChainId))} ${assetSymbol}\n`,
  );

  return { nonDestinationBalance, destinationBalance, totalBalance, consolidationDecimals };
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
    console.log(`🚀 Starting ${assetSymbol} consolidation to chain ${destinationChainId}...\n`);
    console.log(
      `📌 Requested amount: ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}\n`,
    );

    // Load EIP-7702 account (use dummy amount/decimals for now)
    const { accounts, evmAccount, signerKey, solanaKeypair, solanaAccount } = await loadAccounts(
      {
        fromAssetId,
        toAssetId,
        amount: '1',
        decimals: 18,
      },
      'session2',
      'eip7702',
    );

    // Fetch detailed balance
    console.log('📊 Fetching balance distribution...');
    const balanceResponse = await fetchAggregatedBalanceV3(
      `eip155:1:${evmAccount.accountAddress}`,
      fromAssetId,
    );

    // Find aggregated asset
    const asset = balanceResponse.balanceByAggregatedAsset?.find(
      (a) => a.aggregatedAssetId === fromAssetId,
    );

    if (!asset) {
      throw new Error(`No ${assetSymbol} balance found`);
    }

    console.log(
      `💰 Total ${assetSymbol} balance: ${formatUnits(BigInt(asset.balance), balanceDecimals)} ${assetSymbol}\n`,
    );

    // Calculate balance excluding destination chain (using native decimals for each chain)
    const { nonDestinationBalance, destinationBalance, totalBalance, consolidationDecimals } =
      calculateNonDestinationBalance(asset, destinationChainId, assetSymbol);

    if (nonDestinationBalance === 0n) {
      console.log('✓ All funds already on destination chain, no consolidation needed');
      return { success: true, skipped: true };
    }

    // Convert available non-destination balance to aggregated decimals for comparison
    const decimalDiff = balanceDecimals - consolidationDecimals;
    const nonDestinationBalanceInAggregatedDecimals =
      nonDestinationBalance * 10n ** BigInt(decimalDiff);

    console.log(`📊 Consolidation check:`);
    console.log(`   Requested: ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}`);
    console.log(
      `   Available: ${formatUnits(nonDestinationBalanceInAggregatedDecimals, balanceDecimals)} ${assetSymbol}\n`,
    );

    // Validate requested amount
    if (requestedAmount === 0n) {
      throw new Error('Requested amount must be greater than 0');
    }

    if (requestedAmount > nonDestinationBalanceInAggregatedDecimals) {
      throw new Error(
        `Insufficient balance: Requested ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}, ` +
          `but only ${formatUnits(nonDestinationBalanceInAggregatedDecimals, balanceDecimals)} ${assetSymbol} available ` +
          `(destination chain balance excluded)`,
      );
    }

    console.log(
      `✓ Will consolidate: ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}\n`,
    );

    const consolidationAmount = requestedAmount.toString();

    console.log('📋 Preparing consolidation swap...');

    const swapQuoteRequest: QuoteRequestV3 = {
      from: {
        accounts,
        asset: { assetId: fromAssetId },
        amount: consolidationAmount,
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

    console.log('\n✅ Swap quote received:');
    console.log(`  - Quote ID: ${swapQuote.id}`);
    console.log(`  - From: ${swapQuote.originToken?.aggregatedAssetId || 'unknown'}`);
    console.log(`  - To: ${swapQuote.destinationToken?.assetType || 'unknown'}`);

    const destDecimals = getNativeDecimals(destinationChainId);
    console.log(
      `  - Amount out: ${formatUnits(BigInt(swapQuote.destinationToken?.amount || 0), destDecimals)} ${assetSymbol}`,
    );

    if (swapQuote.originToken?.assetType && Array.isArray(swapQuote.originToken.assetType)) {
      console.log('\n📍 Source chains:');
      for (const assetType of swapQuote.originToken.assetType) {
        const chain = assetType.match(/eip155:(\d+)/)?.[1] || 'unknown';
        console.log(`  - Chain ${chain}: ${assetType}`);
      }
    }

    // Sign swap operations
    console.log('\n📋 Signing swap operations...');
    const signedSwapQuote = await signAllOperations(
      swapQuote,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    // Execute swap
    console.log('⚡ Executing consolidation swap...');
    const swapResult = await executeQuoteV3(signedSwapQuote);

    if (!swapResult.success) {
      throw new Error(swapResult.error || 'Consolidation swap failed');
    }

    console.log('✅ Swap executed successfully!');

    // Monitor swap completion
    console.log('📋 Monitoring consolidation...');
    await monitorTransactionCompletion(swapQuote);

    console.log('\n🎉 Consolidation completed!');
    console.log(`\n💡 Summary:`);
    console.log(`   Consolidated: ${formatUnits(requestedAmount, balanceDecimals)} ${assetSymbol}`);
    console.log(`   To: ${toAssetId}\n`);

    return { success: true, result: swapResult };
  } catch (error) {
    console.error('\n❌ Consolidation failed:', (error as Error).message);
    throw error;
  }
}

async function main() {
  try {
    // Example: Consolidate 10 USDC to Arbitrum
    // await consolidateStablecoin(
    //   'ob:usdc',
    //   `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
    //   parseUnits('10', 18).toString(), // Amount in balance decimals
    //   18, // Balance decimals (public API uses 6)
    //   50,
    // );

    await consolidateStablecoin(
      'ob:usdc',
      `${BSC_CHAIN}/erc20:${BSC_USDC}`,
      parseUnits('1', 18).toString(), // Amount in balance decimals
      18, // Balance decimals (public API uses 6)
      50,
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
