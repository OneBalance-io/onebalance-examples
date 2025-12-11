import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { AaveClient, chainId, evmAddress } from '@aave/client';
import { userSupplies, chains } from '@aave/client/actions';
import { AaveV3Arbitrum } from '@bgd-labs/aave-address-book';
import {
  loadMultiChainAccounts,
  prepareCallQuoteV3,
  fetchCallQuoteV3,
  executeQuoteV3,
  signAllOperations,
  signOperation,
  checkAssetBalance,
  monitorTransactionCompletion,
  createLogger,
  type PrepareCallRequestV3,
  type CallRequestV3,
  ContractAccountType,
  type Hex,
  type EIP7702Account,
  type EOAKeyPair,
} from '../helpers';
import L2PoolABI from '../abi/aave/L2PoolInstance.json';

// Create logger instance (saves to calldata/logs directory)
const logger = createLogger('supplyAAVE', 'calldata/logs/aave');

/**
 * AAVE V3 Supply Example with OneBalance
 *
 * Combines AAVE SDK (query) + OneBalance APIs (execution) for chain-abstracted yield
 *
 * Flow:
 * 1. Use AAVE SDK to query user positions
 * 2. Build supply() calldata for AAVE V3 Pool with known asset address
 * 3. Use OneBalance prepareCallQuoteV3 to calculate routing
 * 4. Use OneBalance getCallQuoteV3 to get full quote with cross-chain routing
 * 5. Execute atomically with executeQuoteV3
 *
 * Benefits:
 * - Supply from any chain to any AAVE market
 * - Automatic cross-chain bridging and consolidation
 * - Gas abstraction via paymaster
 * - Single transaction UX
 *
 * API Pattern:
 * - tokensRequired: specific asset on target chain (CAIP-19 format)
 * - fromAssetId: where to pull funds from (aggregated "ob:usdc" or specific chain)
 * - allowanceRequirements: approvals handled automatically (NOT as calls)
 */

// Configuration - AAVE V3 on Arbitrum
const ARBITRUM_CHAIN = 'eip155:42161';

// AAVE Pool Proxy (EIP-1967 Transparent Proxy)
// Proxy: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
// Implementation: 0xCe142f1e750522a3E7Ed7305A224AE88dD9F6ce8 (L2PoolInstance)
const AAVE_POOL_ARBITRUM = AaveV3Arbitrum.POOL;

/**
 * Query user AAVE positions using AAVE SDK
 */
async function queryAAVEPositions(userAddress: string) {
  logger.log('\n📊 Querying AAVE positions...');

  const client = AaveClient.create();

  try {
    // Query user supplies on Arbitrum
    const supplies = await userSupplies(client, {
      markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
      user: evmAddress(userAddress),
    });

    logger.subsection('User Supplies');
    logger.code('json', JSON.stringify(supplies, null, 2));

    // Query supported chains
    const chainsResult = await chains(client);
    if (chainsResult.isOk()) {
      logger.log(`✅ AAVE supports ${chainsResult.value.length} chains`);
    }

    return { supplies };
  } catch (error) {
    logger.log('⚠️  Could not query positions (user may have no positions yet)');
    return { supplies: null };
  }
}

/**
 * Build AAVE supply calldata using L2PoolInstance ABI
 */
function buildSupplyCalldata(
  assetAddress: string,
  amount: bigint,
  onBehalfOf: string,
  decimals: number = 18,
): Hex {
  logger.log('📋 Building AAVE supply calldata...');

  const supplyCalldata = encodeFunctionData({
    abi: L2PoolABI,
    functionName: 'supply',
    args: [
      assetAddress as Hex, // asset to supply
      amount, // amount in token decimals
      onBehalfOf as Hex, // onBehalfOf (receives aTokens)
      0, // referralCode (0 for none)
    ],
  });

  logger.log('✅ Supply calldata encoded');
  logger.log(`  - Pool: ${AAVE_POOL_ARBITRUM}`);
  logger.log(`  - Asset: ${assetAddress}`);
  logger.log(`  - Amount: ${formatUnits(amount, decimals)}`);
  logger.log(`  - On behalf of: ${onBehalfOf}\n`);

  return supplyCalldata;
}

/**
 * Execute AAVE operation
 */
async function executeAAVEOperation(quote: any, signerKey: EOAKeyPair) {
  logger.section('Execution');
  logger.log('\n📋 Signing all operations...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    null, // no solana keypair
    null, // no solana account
    ContractAccountType.KernelV33,
  );
  logger.log('✅ All operations signed\n');

  logger.log('⚡ Executing supply operation...');
  const result = await executeQuoteV3(signedQuote);

  if (!result.success) {
    throw new Error(result.error || 'Supply execution failed');
  }

  logger.log('✅ Supply executed successfully!\n');

  // Monitor completion
  logger.log('📋 Monitoring transaction...');
  await monitorTransactionCompletion(quote);

  return result;
}

/**
 * Configuration for AAVE supply operation
 */
interface AAVESupplyConfig {
  /** Amount to supply (e.g., '1.5' for 1.5 USDC) */
  amount: string;
  /** Target chain (e.g., 'eip155:42161' for Arbitrum) */
  targetChain: string;
  /** Asset address on target chain */
  assetAddress: string;
  /** Asset decimals (e.g., 6 for USDC, 18 for WETH) */
  decimals: number;
  /** AAVE pool address on target chain */
  poolAddress: string;
  /** Source asset ID for cross-chain (e.g., 'ob:usdc', 'ob:eth') */
  fromAggregatedAssetId: string;
  /** Slippage tolerance in basis points (default: 50 = 0.5%) */
  slippageTolerance?: number;
}

/**
 * Supply assets to AAVE V3 from any chain
 */
async function supplyToAAVE(config: AAVESupplyConfig) {
  try {
    const {
      amount,
      targetChain,
      assetAddress,
      decimals,
      poolAddress,
      fromAggregatedAssetId,
      slippageTolerance = 50,
    } = config;

    // Extract asset symbol from aggregated asset ID for logging
    const assetSymbol = fromAggregatedAssetId.split(':').pop()?.toUpperCase() || 'TOKEN';
    const amountInDecimals = parseUnits(amount, decimals);

    logger.section('AAVE V3 Supply Operation');
    logger.log(`📋 Supplying ${formatUnits(amountInDecimals, decimals)} ${assetSymbol} to AAVE\n`);

    // Load EIP-7702 account (EVM only, no Solana needed)
    const { accounts, evmAccount, signerKey } = await loadMultiChainAccounts({
      needsEvm: true,
      needsSolana: false,
      sessionKeyName: 'session',
      evmAccountType: 'eip7702',
    });

    if (!evmAccount || !signerKey) {
      throw new Error('EVM account is required');
    }

    // Check balance
    logger.subsection('Balance Check');
    logger.log(`💰 Checking ${assetSymbol} balance...`);
    await checkAssetBalance(evmAccount.accountAddress, fromAggregatedAssetId, decimals);

    // Query AAVE positions
    await queryAAVEPositions(evmAccount.accountAddress);

    // Build supply calldata
    const supplyCalldata = buildSupplyCalldata(
      assetAddress,
      amountInDecimals,
      evmAccount.accountAddress,
      decimals,
    );

    // Prepare call quote
    logger.subsection('Prepare Call Quote');
    logger.log('\n📋 Preparing call quote...');

    const targetAssetType = `${targetChain}/erc20:${assetAddress}`;

    const prepareRequest: PrepareCallRequestV3 = {
      accounts,
      targetChain,
      calls: [
        {
          to: poolAddress as Hex,
          data: supplyCalldata,
          value: '0x0',
        },
      ],
      tokensRequired: [
        {
          assetType: targetAssetType, // specific target chain asset
          amount: amountInDecimals.toString(),
        },
      ],
      allowanceRequirements: [
        {
          assetType: targetAssetType, // approval for target chain
          spender: poolAddress as Hex,
          amount: amountInDecimals.toString(),
        },
      ],
      fromAssetId: fromAggregatedAssetId, // where to pull funds from (enables multi-chain)
    };

    logger.code('json', JSON.stringify(prepareRequest, null, 2));
    const preparedQuote = await prepareCallQuoteV3(prepareRequest);
    logger.log('\n✅ Prepared quote received');

    // Log detected sources
    const sourceBalances = preparedQuote.sourceAssetBalances || [];
    logger.log(`\n📊 Detected ${sourceBalances.length} source chain(s):`);
    sourceBalances.forEach((balance: any) => {
      logger.log(
        `  • ${balance.assetType}: ${formatUnits(BigInt(balance.balance), balance.decimals)}`,
      );
    });
    logger.log(`  • Call type: ${preparedQuote.callType}\n`);

    logger.code('json', JSON.stringify(preparedQuote, null, 2));

    // Sign target chain operation
    logger.log('\n📋 Signing target chain operation...');
    const signedChainOp = await signOperation(
      preparedQuote.chainOperation,
      signerKey.privateKey,
      ContractAccountType.KernelV33,
    );
    logger.log('✅ Target chain operation signed\n');

    // Get quote with cross-chain routing
    logger.subsection('Get Call Quote');
    logger.log('📋 Getting call quote with cross-chain routing...');

    // Check if cross-chain routing needed (multiple source chains)
    const sourceChains = preparedQuote.sourceAssetBalances?.length || 0;
    logger.log(`  - Source chains detected: ${sourceChains}`);
    logger.log(`  - Call type: ${preparedQuote.callType}`);

    if (sourceChains > 1) {
      logger.log(`  - Multi-chain consolidation: pulling from ${sourceChains} chains\n`);
    } else {
      logger.log(`  - Same-chain operation: funds already on target chain\n`);
    }

    const callRequest: CallRequestV3 = {
      ...preparedQuote,
      fromAggregatedAssetId, // aggregated asset for routing
      accounts,
      chainOperation: signedChainOp,
      //   tamperProofSignature: preparedQuote.tamperProofSignature,
      //   callType: preparedQuote.callType, // pass from prepare response
      //   sourceAssetBalances: preparedQuote.sourceAssetBalances, // pass all detected sources
      slippageTolerance,
    };

    logger.code('json', JSON.stringify(callRequest, null, 2));
    const quote = await fetchCallQuoteV3(callRequest);
    logger.log('\n✅ Call quote received');
    logger.code('json', JSON.stringify(quote, null, 2));

    // Execute
    // const result = await executeAAVEOperation(quote, signerKey);

    // logger.section('Summary');
    // logger.log('🎉 AAVE supply completed!');
    // logger.log(`   Supplied: ${formatUnits(amountInDecimals, decimals)} ${assetSymbol}`);
    // logger.log(`   To: AAVE V3 on chain ${targetChain.split(':')[1]}`);
    // logger.log(`   User: ${evmAccount.accountAddress}`);
    // logger.log(`   Pool: ${poolAddress}`);
    // if (sourceBalances.length > 1) {
    //   logger.log(`   Consolidated from ${sourceBalances.length} chains`);
    // }
    // logger.log('');

    // // Query updated positions
    // logger.subsection('Updated Positions');
    // await queryAAVEPositions(evmAccount.accountAddress);

    // return { success: true, result };
  } catch (error) {
    logger.error('\n❌ Supply failed:', (error as Error).message);
    throw error;
  }
}

// Configuration - USDC on Arbitrum
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_DECIMALS = 6;

// Main
async function main() {
  try {
    // Example: Supply USDC to AAVE V3 on Arbitrum
    // Funds can come from any chain (Polygon, Optimism, Base, etc.)
    await supplyToAAVE({
      amount: '1.2',
      targetChain: ARBITRUM_CHAIN,
      assetAddress: ARBITRUM_USDC,
      decimals: USDC_DECIMALS,
      poolAddress: AAVE_POOL_ARBITRUM,
      fromAggregatedAssetId: 'ob:usdc', // Pull USDC from any chain
      slippageTolerance: 50, // 0.5%
    });

    // Close logger
    logger.close();
  } catch (error) {
    logger.error('Failed:', error);
    logger.close();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
