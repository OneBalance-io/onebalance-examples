import { parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { AaveClient, chainId, evmAddress } from '@aave/client';
import { userSupplies, userBorrows, chains, userTransactionHistory } from '@aave/client/actions';
import { AaveV3Arbitrum } from '@bgd-labs/aave-address-book';
import * as readline from 'readline';
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
  fetchAggregatedBalanceV3,
  buildAccountParam,
  getChainIdentifier,
  type PrepareCallRequestV3,
  type CallRequestV3,
  ContractAccountType,
  type Hex,
  type EIP7702Account,
  type EOAKeyPair,
} from '../helpers';
import L2PoolABI from '../abi/aave/L2PoolInstance.json';

// Configuration
const ARBITRUM_CHAIN = 'eip155:42161';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_DECIMALS = 6;
const AAVE_POOL_ARBITRUM = AaveV3Arbitrum.POOL;

const client = AaveClient.create();
const logger = createLogger('aave', 'calldata/logs/aave');

/**
 * CLI Modes
 */
type Mode = 'supply' | 'borrow' | 'withdraw' | 'repay' | 'positions' | 'history' | 'exit';

/**
 * Create readline interface
 */
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input
 */
function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Display menu
 */
function displayMenu() {
  console.log('\n' + '='.repeat(60));
  console.log('AAVE Operations Menu');
  console.log('='.repeat(60));
  console.log('1. Show USDC Balance (multi-chain breakdown)');
  console.log('2. List Positions (supplies & borrows)');
  console.log('3. View Transaction History');
  console.log('4. Supply USDC');
  console.log('5. Borrow USDC');
  console.log('6. Withdraw USDC');
  console.log('7. Repay USDC');
  console.log('0. Exit');
  console.log('='.repeat(60));
}

/**
 * Build AAVE supply calldata
 */
function buildSupplyCalldata(
  assetAddress: string,
  amount: bigint,
  onBehalfOf: string,
  decimals: number = 18,
): Hex {
  const supplyCalldata = encodeFunctionData({
    abi: L2PoolABI,
    functionName: 'supply',
    args: [assetAddress as Hex, amount, onBehalfOf as Hex, 0],
  });

  logger.log(`✅ Supply calldata: ${formatUnits(amount, decimals)}`);
  return supplyCalldata;
}

/**
 * Build AAVE borrow calldata
 */
function buildBorrowCalldata(
  assetAddress: string,
  amount: bigint,
  onBehalfOf: string,
  decimals: number = 18,
): Hex {
  const borrowCalldata = encodeFunctionData({
    abi: L2PoolABI,
    functionName: 'borrow',
    args: [
      assetAddress as Hex,
      amount,
      2, // interestRateMode: 2 = variable rate
      0, // referralCode
      onBehalfOf as Hex,
    ],
  });

  logger.log(`✅ Borrow calldata: ${formatUnits(amount, decimals)}`);
  return borrowCalldata;
}

/**
 * Build AAVE withdraw calldata
 */
function buildWithdrawCalldata(
  assetAddress: string,
  amount: bigint,
  to: string,
  decimals: number = 18,
): Hex {
  const withdrawCalldata = encodeFunctionData({
    abi: L2PoolABI,
    functionName: 'withdraw',
    args: [assetAddress as Hex, amount, to as Hex],
  });

  logger.log(`✅ Withdraw calldata: ${formatUnits(amount, decimals)}`);
  return withdrawCalldata;
}

/**
 * Build AAVE repay calldata
 */
function buildRepayCalldata(
  assetAddress: string,
  amount: bigint,
  onBehalfOf: string,
  decimals: number = 18,
): Hex {
  const repayCalldata = encodeFunctionData({
    abi: L2PoolABI,
    functionName: 'repay',
    args: [
      assetAddress as Hex,
      amount,
      2, // interestRateMode: 2 = variable rate
      onBehalfOf as Hex,
    ],
  });

  logger.log(`✅ Repay calldata: ${formatUnits(amount, decimals)}`);
  return repayCalldata;
}

/**
 * Query aggregated USDC balance across chains
 */
async function queryAggregatedBalance(ctx: AccountContext) {
  logger.section('Aggregated Balance');

  try {
    const accountParam = buildAccountParam(ctx.evmAccount, null);
    const balanceResponse = await fetchAggregatedBalanceV3(accountParam, 'ob:usdc');

    const asset = balanceResponse.balanceByAggregatedAsset?.find(
      (a) => a.aggregatedAssetId === 'ob:usdc',
    );

    if (!asset) {
      logger.log('⚠️  No USDC balance found');
      return;
    }

    const totalBalance = BigInt(asset.balance);
    logger.log('\n💰 USDC Balance (Aggregated)');
    logger.log(`  Total: ${formatUnits(totalBalance, USDC_DECIMALS)} USDC`);
    logger.log(`  USD: $${asset.fiatValue}\n`);

    logger.log('📊 Breakdown by chain:');
    asset.individualAssetBalances.forEach((balance: any) => {
      const chainId = getChainIdentifier(balance.assetType);
      const amount = BigInt(balance.balance);

      logger.log(`  • Chain ${chainId}: ${formatUnits(amount, USDC_DECIMALS)} USDC`);
    });

    logger.log('');
    logger.code('json', JSON.stringify(balanceResponse, null, 2));
  } catch (error) {
    logger.error('Failed to fetch balance:', (error as Error).message);
  }
}

/**
 * Query user positions
 */
async function queryPositions(userAddress: string) {
  logger.section('User Positions');

  try {
    // Query supplies
    const suppliesResult = await userSupplies(client, {
      markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
      user: evmAddress(userAddress),
    });

    if (suppliesResult.isErr()) {
      logger.error('Failed to fetch supplies:', suppliesResult.error);
      return { supplies: [], borrows: [] };
    }

    const supplies = suppliesResult.value;
    logger.log('\n💰 Supply Positions:');
    if (supplies && supplies.length > 0) {
      supplies.forEach((position: any, index: number) => {
        logger.log(`\n  ${index + 1}. ${position.currency.symbol}`);
        logger.log(`     Balance: ${position.balance.amount.value}`);
        logger.log(`     USD: $${position.balance.usd}`);
        logger.log(`     APY: ${position.apy.formatted}%`);
        logger.log(`     Collateral: ${position.isCollateral ? 'Yes' : 'No'}`);
      });
    } else {
      logger.log('  No supply positions');
    }

    // Query borrows
    const borrowsResult = await userBorrows(client, {
      markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
      user: evmAddress(userAddress),
    });

    if (borrowsResult.isErr()) {
      logger.error('Failed to fetch borrows:', borrowsResult.error);
      return { supplies, borrows: [] };
    }

    const borrows = borrowsResult.value;
    logger.log('\n💳 Borrow Positions:');
    if (borrows && borrows.length > 0) {
      borrows.forEach((position: any, index: number) => {
        logger.log(`\n  ${index + 1}. ${position.currency.symbol}`);
        logger.log(`     Debt: ${position.debt.amount.value}`);
        logger.log(`     USD: $${position.debt.usd}`);
        logger.log(`     APY: ${position.apy.formatted}%`);
      });
    } else {
      logger.log('  No borrow positions');
    }

    return { supplies, borrows };
  } catch (error) {
    logger.error('Failed to query positions:', (error as Error).message);
    return { supplies: [], borrows: [] };
  }
}

/**
 * Query transaction history
 */
async function queryTransactionHistory(userAddress: string) {
  logger.section('Transaction History');

  try {
    const historyResult = await userTransactionHistory(client, {
      market: evmAddress(AAVE_POOL_ARBITRUM),
      chainId: chainId(42161),
      user: evmAddress(userAddress),
    });

    if (historyResult.isErr()) {
      logger.error('Failed to fetch history:', historyResult.error);
      return;
    }

    const history = historyResult.value;
    logger.log(`\n✅ Found ${history.items.length} transaction(s)`);

    history.items.forEach((tx: any, index: number) => {
      logger.log(`\n${index + 1}. ${tx.__typename}`);
      // Timestamp is already ISO string, not Unix timestamp
      logger.log(`   Timestamp: ${tx.timestamp}`);
      logger.log(`   Tx: ${tx.txHash}`);
      logger.log(`   Explorer: ${tx.blockExplorerUrl}`);

      // Show amount if available
      if (tx.amount) {
        logger.log(
          `   Amount: ${tx.amount.amount.value} ${tx.reserve?.underlyingToken?.symbol || ''}`,
        );
        logger.log(`   USD: $${tx.amount.usd}`);
      }
    });

    logger.code('json', JSON.stringify(history, null, 2));
  } catch (error) {
    logger.error('Failed to query history:', (error as Error).message);
  }
}

/**
 * Execute AAVE operation
 */
async function executeAAVEOperation(
  accounts: any[],
  calldata: Hex,
  tokenAmount: bigint,
  fromAggregatedAssetId: string,
  signerKey: EOAKeyPair,
) {
  const targetAssetType = `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`;

  // Prepare
  const prepareRequest: PrepareCallRequestV3 = {
    accounts,
    targetChain: ARBITRUM_CHAIN,
    calls: [{ to: AAVE_POOL_ARBITRUM as Hex, data: calldata, value: '0x0' }],
    tokensRequired: [{ assetType: targetAssetType, amount: tokenAmount.toString() }],
    allowanceRequirements: [
      {
        assetType: targetAssetType,
        spender: AAVE_POOL_ARBITRUM as Hex,
        amount: tokenAmount.toString(),
      },
    ],
    fromAssetId: fromAggregatedAssetId,
  };

  logger.log('\n📋 Preparing...');
  logger.code('json', JSON.stringify(prepareRequest, null, 2));
  const preparedQuote = await prepareCallQuoteV3(prepareRequest);

  const sourceBalances = preparedQuote.sourceAssetBalances || [];
  logger.log('\n✅ Prepared quote received');
  logger.log(`  Sources: ${sourceBalances.length} chain(s)`);
  logger.log(`  Type: ${preparedQuote.callType}`);
  sourceBalances.forEach((balance: any) => {
    logger.log(
      `    • ${balance.assetType}: ${formatUnits(BigInt(balance.balance), balance.decimals)}`,
    );
  });
  logger.log('');
  logger.code('json', JSON.stringify(preparedQuote, null, 2));

  // Sign
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerKey.privateKey,
    ContractAccountType.KernelV33,
  );

  // Get quote
  logger.log('\n📋 Getting quote...');
  const callRequest: CallRequestV3 = {
    ...preparedQuote,
    fromAggregatedAssetId,
    accounts,
    chainOperation: signedChainOp,
    slippageTolerance: 50,
  };

  logger.code('json', JSON.stringify(callRequest, null, 2));
  const quote = await fetchCallQuoteV3(callRequest);
  logger.log('\n✅ Quote received');
  logger.code('json', JSON.stringify(quote, null, 2));

  // Execute
  logger.log('⚡ Executing...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    null,
    null,
    ContractAccountType.KernelV33,
  );

  const result = await executeQuoteV3(signedQuote);
  if (!result.success) {
    throw new Error(result.error || 'Execution failed');
  }

  logger.log('✅ Executed successfully\n');
  await monitorTransactionCompletion(quote);

  return result;
}

/**
 * Account context passed to all modes (EIP-7702 only)
 */
interface AccountContext {
  accounts: any[];
  evmAccount: EIP7702Account;
  signerKey: EOAKeyPair;
}

/**
 * Supply mode
 */
async function modeSupply(ctx: AccountContext, amount: string) {
  logger.section('Supply to AAVE');
  logger.log(`Amount: ${amount} USDC\n`);

  await checkAssetBalance(ctx.evmAccount.accountAddress, 'ob:usdc', USDC_DECIMALS);

  const amountInDecimals = parseUnits(amount, USDC_DECIMALS);
  const calldata = buildSupplyCalldata(
    ARBITRUM_USDC,
    amountInDecimals,
    ctx.evmAccount.accountAddress,
    USDC_DECIMALS,
  );

  await executeAAVEOperation(ctx.accounts, calldata, amountInDecimals, 'ob:usdc', ctx.signerKey);

  logger.log('\n✅ Supply completed!');
  await queryPositions(ctx.evmAccount.accountAddress);
}

/**
 * Borrow mode
 */
async function modeBorrow(ctx: AccountContext, amount: string) {
  logger.section('Borrow from AAVE');
  logger.log(`Amount: ${amount} USDC\n`);

  const amountInDecimals = parseUnits(amount, USDC_DECIMALS);
  const calldata = buildBorrowCalldata(
    ARBITRUM_USDC,
    amountInDecimals,
    ctx.evmAccount.accountAddress,
    USDC_DECIMALS,
  );

  await executeAAVEOperation(ctx.accounts, calldata, amountInDecimals, 'ob:usdc', ctx.signerKey);

  logger.log('\n✅ Borrow completed!');
  await queryPositions(ctx.evmAccount.accountAddress);
}

/**
 * Withdraw mode
 */
async function modeWithdraw(ctx: AccountContext, amount: string) {
  logger.section('Withdraw from AAVE');
  logger.log(`Amount: ${amount} USDC\n`);

  // Check current supply position first
  const suppliesResult = await userSupplies(client, {
    markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
    user: evmAddress(ctx.evmAccount.accountAddress),
  });

  if (suppliesResult.isOk()) {
    const supplies = suppliesResult.value;
    const usdcSupply = supplies.find((s: any) => s.currency.symbol === 'USDC');
    if (usdcSupply) {
      logger.log(`📊 Current supply: ${usdcSupply.balance.amount.value} USDC\n`);
    } else {
      logger.log('⚠️  No USDC supply found. Cannot withdraw.\n');
      return;
    }
  }

  const amountInDecimals = parseUnits(amount, USDC_DECIMALS);
  const calldata = buildWithdrawCalldata(
    ARBITRUM_USDC,
    amountInDecimals,
    ctx.evmAccount.accountAddress,
    USDC_DECIMALS,
  );

  // Note: Withdraw doesn't need tokensRequired (burning aTokens)
  // But we need to handle it differently - no fromAssetId needed
  const targetAssetType = `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`;

  const prepareRequest: PrepareCallRequestV3 = {
    accounts: ctx.accounts,
    targetChain: ARBITRUM_CHAIN,
    calls: [{ to: AAVE_POOL_ARBITRUM as Hex, data: calldata, value: '0x0' }],
    tokensRequired: [], // No tokens required, burning aTokens
  };

  logger.log('\n📋 Preparing...');
  logger.code('json', JSON.stringify(prepareRequest, null, 2));
  const preparedQuote = await prepareCallQuoteV3(prepareRequest);
  logger.log('\n✅ Prepared quote received');
  logger.code('json', JSON.stringify(preparedQuote, null, 2));

  // Sign
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    ctx.signerKey.privateKey,
    ContractAccountType.KernelV33,
  );

  // Get quote
  logger.log('\n📋 Getting quote...');
  const callRequest: CallRequestV3 = {
    ...preparedQuote,
    accounts: ctx.accounts,
    chainOperation: signedChainOp,
    slippageTolerance: 50,
  };

  logger.code('json', JSON.stringify(callRequest, null, 2));
  const quote = await fetchCallQuoteV3(callRequest);
  logger.log('\n✅ Quote received');
  logger.code('json', JSON.stringify(quote, null, 2));

  // Execute
  logger.log('\n⚡ Executing...');
  const signedQuote = await signAllOperations(
    quote,
    ctx.signerKey,
    null,
    null,
    ContractAccountType.KernelV33,
  );

  const result = await executeQuoteV3(signedQuote);
  if (!result.success) {
    throw new Error(result.error || 'Execution failed');
  }

  logger.log('✅ Executed successfully\n');
  await monitorTransactionCompletion(quote);

  logger.log('\n✅ Withdraw completed!');
  await queryPositions(ctx.evmAccount.accountAddress);
}

/**
 * Repay mode
 */
async function modeRepay(ctx: AccountContext, amount: string) {
  logger.section('Repay to AAVE');
  logger.log(`Amount: ${amount} USDC\n`);

  // Check current borrow position first
  const borrowsResult = await userBorrows(client, {
    markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
    user: evmAddress(ctx.evmAccount.accountAddress),
  });

  if (borrowsResult.isOk()) {
    const borrows = borrowsResult.value;
    const usdcBorrow = borrows.find((b: any) => b.currency.symbol === 'USDC');
    if (usdcBorrow) {
      logger.log(`📊 Current debt: ${usdcBorrow.debt.amount.value} USDC\n`);
    } else {
      logger.log('⚠️  No USDC debt found. Nothing to repay.\n');
      return;
    }
  }

  await checkAssetBalance(ctx.evmAccount.accountAddress, 'ob:usdc', USDC_DECIMALS);

  const amountInDecimals = parseUnits(amount, USDC_DECIMALS);
  const calldata = buildRepayCalldata(
    ARBITRUM_USDC,
    amountInDecimals,
    ctx.evmAccount.accountAddress,
    USDC_DECIMALS,
  );

  await executeAAVEOperation(ctx.accounts, calldata, amountInDecimals, 'ob:usdc', ctx.signerKey);

  logger.log('\n✅ Repay completed!');
  await queryPositions(ctx.evmAccount.accountAddress);
}

/**
 * Positions mode
 */
async function modePositions(ctx: AccountContext) {
  logger.section('List Positions');
  await queryPositions(ctx.evmAccount.accountAddress);
}

/**
 * History mode
 */
async function modeHistory(ctx: AccountContext) {
  await queryTransactionHistory(ctx.evmAccount.accountAddress);
}

/**
 * Main CLI with interactive menu
 */
async function main() {
  console.log('🚀 AAVE Interactive CLI\n');
  logger.log('🚀 AAVE Interactive CLI\n');

  try {
    // Load accounts once
    console.log('Loading account...');
    const { accounts, evmAccount, signerKey } = await loadMultiChainAccounts({
      needsEvm: true,
      needsSolana: false,
      sessionKeyName: 'session',
      evmAccountType: 'eip7702',
    });

    if (!evmAccount || !signerKey) {
      throw new Error('EVM account required');
    }

    console.log(`\n👤 User: ${evmAccount.accountAddress}`);
    logger.log(`👤 User: ${evmAccount.accountAddress}\n`);

    // Create context
    const ctx: AccountContext = {
      accounts,
      evmAccount: evmAccount as EIP7702Account,
      signerKey,
    };

    // Interactive menu loop
    const rl = createReadlineInterface();
    let running = true;

    while (running) {
      displayMenu();
      const choice = await prompt(rl, '\nSelect option: ');

      try {
        switch (choice) {
          case '1': // Balance
            await queryAggregatedBalance(ctx);
            break;

          case '2': // Positions
            await modePositions(ctx);
            break;

          case '3': // History
            await modeHistory(ctx);
            break;

          case '4': // Supply
            try {
              // Show available balance first
              const accountParam = buildAccountParam(ctx.evmAccount, null);
              const balanceResponse = await fetchAggregatedBalanceV3(accountParam, 'ob:usdc');
              const asset = balanceResponse.balanceByAggregatedAsset?.find(
                (a) => a.aggregatedAssetId === 'ob:usdc',
              );
              if (asset) {
                console.log(
                  `\n💰 Available: ${formatUnits(BigInt(asset.balance), USDC_DECIMALS)} USDC ($${asset.fiatValue})`,
                );
              }
              const supplyAmount = await prompt(rl, 'Enter amount to supply (USDC): ');
              if (supplyAmount && parseFloat(supplyAmount) > 0) {
                await modeSupply(ctx, supplyAmount);
              } else {
                console.log('❌ Invalid amount');
              }
            } catch (error) {
              console.error('Failed to fetch balance:', (error as Error).message);
            }
            break;

          case '5': // Borrow
            try {
              // Show current supply for reference
              const suppliesResult = await userSupplies(client, {
                markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
                user: evmAddress(ctx.evmAccount.accountAddress),
              });
              if (suppliesResult.isOk()) {
                const usdcSupply = suppliesResult.value.find(
                  (s: any) => s.currency.symbol === 'USDC',
                );
                if (usdcSupply) {
                  console.log(
                    `\n💰 Your collateral: ${usdcSupply.balance.amount.value} USDC ($${usdcSupply.balance.usd})`,
                  );
                  console.log('   ⚠️  Make sure to maintain healthy collateralization ratio');
                }
              }
              const borrowAmount = await prompt(rl, 'Enter amount to borrow (USDC): ');
              if (borrowAmount && parseFloat(borrowAmount) > 0) {
                await modeBorrow(ctx, borrowAmount);
              } else {
                console.log('❌ Invalid amount');
              }
            } catch (error) {
              console.error('Failed to fetch positions:', (error as Error).message);
            }
            break;

          case '6': // Withdraw
            try {
              // Show available supply first
              const suppliesResult = await userSupplies(client, {
                markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
                user: evmAddress(ctx.evmAccount.accountAddress),
              });
              if (suppliesResult.isOk()) {
                const usdcSupply = suppliesResult.value.find(
                  (s: any) => s.currency.symbol === 'USDC',
                );
                if (usdcSupply) {
                  console.log(
                    `\n💰 Available to withdraw: ${usdcSupply.balance.amount.value} USDC ($${usdcSupply.balance.usd})`,
                  );
                } else {
                  console.log('\n⚠️  No USDC supply found. Nothing to withdraw.');
                  break;
                }
              }
              const withdrawAmount = await prompt(rl, 'Enter amount to withdraw (USDC): ');
              if (withdrawAmount && parseFloat(withdrawAmount) > 0) {
                await modeWithdraw(ctx, withdrawAmount);
              } else {
                console.log('❌ Invalid amount');
              }
            } catch (error) {
              console.error('Failed to fetch positions:', (error as Error).message);
            }
            break;

          case '7': // Repay
            try {
              // Show current debt first
              const borrowsResult = await userBorrows(client, {
                markets: [{ chainId: chainId(42161), address: evmAddress(AAVE_POOL_ARBITRUM) }],
                user: evmAddress(ctx.evmAccount.accountAddress),
              });
              if (borrowsResult.isOk()) {
                const usdcBorrow = borrowsResult.value.find(
                  (b: any) => b.currency.symbol === 'USDC',
                );
                if (usdcBorrow) {
                  console.log(
                    `\n💳 Current debt: ${usdcBorrow.debt.amount.value} USDC ($${usdcBorrow.debt.usd})`,
                  );
                } else {
                  console.log('\n⚠️  No USDC debt found. Nothing to repay.');
                  break;
                }
              }
              const repayAmount = await prompt(rl, 'Enter amount to repay (USDC): ');
              if (repayAmount && parseFloat(repayAmount) > 0) {
                await modeRepay(ctx, repayAmount);
              } else {
                console.log('❌ Invalid amount');
              }
            } catch (error) {
              console.error('Failed to fetch positions:', (error as Error).message);
            }
            break;

          case '0': // Exit
            console.log('\n👋 Goodbye!');
            logger.log('\n👋 Exiting...');
            running = false;
            break;

          default:
            console.log('❌ Invalid option. Please select 0-7.');
        }
      } catch (error) {
        console.error('\n❌ Operation failed:', (error as Error).message);
        logger.error('Operation failed:', error);
        console.log('\nPress Enter to continue...');
        await prompt(rl, '');
      }
    }

    rl.close();
    logger.close();
  } catch (error) {
    logger.error('Failed to initialize:', error);
    logger.close();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
