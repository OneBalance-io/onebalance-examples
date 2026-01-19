import { parseUnits, formatUnits, parseAbi, encodeFunctionData } from 'viem';
import {
  loadMultiChainAccounts,
  prepareCallQuoteV3,
  fetchCallQuoteV3,
  executeQuoteV3,
  getQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  signOperation,
  checkAssetBalance,
  getBalanceCheckAddress,
  fetchAggregatedBalanceV3,
  buildAccountParam,
  getChainIdentifier,
  type QuoteRequestV3,
  type PrepareCallRequestV3,
  type CallRequestV3,
  ContractAccountType,
  type Hex,
  type TargetCallQuoteV3,
  CallType,
  type EvmAccountType,
} from '../helpers';

/**
 * Smart Hyperliquid Deposit with Switchable Account Types
 *
 * Supports two account types:
 *   - EIP-7702 (kernel-v3.3-ecdsa): EOA is the account address
 *   - Standard (kernel-v3.1-ecdsa): Uses predictStandardAddress to derive account
 *
 * Automatically detects fund distribution and routes to optimal flow:
 *
 * FLOW 1 (ATOMIC): Funds on 1 chain
 *   → Direct calldata deposit, user stays as sender, bridge accepts
 *
 * FLOW 2 (TWO-STEP): Funds on 2+ chains
 *   → Step 1: Consolidate to Arbitrum (swap)
 *   → Step 2: Deposit via calldata (workaround for EIP-7702 limitation)
 *
 * WHY: Hyperliquid bridge only credits deposits from user accounts.
 * Cross-chain handlers become sender → bridge rejects.
 * Calldata keeps user as sender → bridge accepts.
 */

// Configuration
const ARBITRUM_CHAIN = 'eip155:42161';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HYPERLIQUID_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

// Helper to get the correct ContractAccountType for signing based on EVM account type
function getContractAccountType(evmAccountType: EvmAccountType): ContractAccountType {
  return evmAccountType === 'eip7702'
    ? ContractAccountType.KernelV33
    : ContractAccountType.KernelV31;
}

// Get native decimals for a specific chain's USDC
function getNativeDecimals(chainId: string): number {
  return chainId === '56' ? 18 : 6; // BSC has 18 decimals, others have 6
}

// Calculate balance excluding destination chain
function calculateNonDestinationBalance(
  asset: any,
  destinationChainId: string,
  targetDecimals: number,
): bigint {
  let nonDestinationBalance = 0n;

  for (const balance of asset.individualAssetBalances) {
    const amount = BigInt(balance.balance);
    const chainId = getChainIdentifier(balance.assetType);
    const nativeDecimals = getNativeDecimals(chainId);
    const isDestination = chainId === destinationChainId;

    if (!isDestination) {
      // Normalize to target decimals before adding
      const decimalDiff = targetDecimals - nativeDecimals;
      // Handle both scaling up (positive diff) and scaling down (negative diff)
      const normalizedAmount =
        decimalDiff >= 0
          ? amount * 10n ** BigInt(decimalDiff)
          : amount / 10n ** BigInt(-decimalDiff);
      nonDestinationBalance += normalizedAmount;
    }
  }

  console.log({ nonDestinationBalance });
  return nonDestinationBalance;
}

// Determines if two-step flow is needed based on callType and source balances
// Returns true if funds are on multiple chains (EIP-7702 limitation)
function needsTwoStepFlow(preparedQuote: TargetCallQuoteV3): boolean {
  // If same-chain without solver, we can do atomic
  if (preparedQuote.callType === CallType.SameChainExcludeSolver) {
    return false;
  }

  // Check if funds are on multiple chains
  const sourceBalances = preparedQuote.sourceAssetBalances || [];
  return sourceBalances.length > 1;
}

// Signs, executes, and monitors a call quote
async function executeCallQuote(
  quote: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  flowType: 'atomic' | 'two-step',
  evmAccountType: EvmAccountType,
) {
  const contractAccountType = getContractAccountType(evmAccountType);

  console.log('\n📋 Signing origin chain operations...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    solanaKeypair,
    solanaAccount,
    contractAccountType,
  );
  console.log('✅ All operations signed\n');

  console.log(`⚡ Executing ${flowType} deposit...`);
  const result = await executeQuoteV3(signedQuote);

  if (!result.success) {
    throw new Error(result.error || `${flowType} deposit execution failed`);
  }

  console.log('✅ Deposit executed successfully!\n');

  // Monitor completion
  console.log('📋 Monitoring transaction...');
  await monitorTransactionCompletion(quote);

  return result;
}

// OPTION 1: Atomic deposit (single-input scenarios)
async function depositAtomic(
  accounts: any[],
  evmAccount: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  amount: string,
  decimals: number,
  slippageTolerance: number,
  evmAccountType: EvmAccountType,
) {
  console.log('\n💡 Using ATOMIC flow (single-input detected)\n');

  const contractAccountType = getContractAccountType(evmAccountType);

  // Convert amount from aggregated decimals to native token decimals
  const nativeDecimals = 6; // Arbitrum USDC has 6 decimals
  const decimalDiff = decimals - nativeDecimals;
  const amountInNativeDecimals = BigInt(amount) / 10n ** BigInt(decimalDiff);

  console.log('📋 Preparing transfer to Hyperliquid bridge...');
  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [HYPERLIQUID_BRIDGE as Hex, amountInNativeDecimals],
  });

  console.log('✅ Transfer calldata encoded');
  console.log(`  - To: ${HYPERLIQUID_BRIDGE}`);
  console.log(`  - Amount: ${formatUnits(BigInt(amount), decimals)} USDC\n`);

  console.log('📋 Preparing call quote...');
  const prepareRequest: PrepareCallRequestV3 = {
    accounts,
    targetChain: ARBITRUM_CHAIN,
    calls: [
      {
        to: ARBITRUM_USDC as Hex,
        data: transferCallData,
        value: '0x0',
      },
    ],
    tokensRequired: [
      {
        assetType: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
        amount: amountInNativeDecimals.toString(),
      },
    ],
  };

  console.log('Prepare call request:', JSON.stringify(prepareRequest, null, 2));
  const preparedQuote = await prepareCallQuoteV3(prepareRequest);
  console.log('\n✅ Prepared quote response:', JSON.stringify(preparedQuote, null, 2));

  // Sign target chain operation
  console.log('\n📋 Signing target chain operation...');
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerKey.privateKey,
    contractAccountType,
  );
  console.log('✅ Target chain operation signed\n');

  // Get call quote with cross-chain routing
  console.log('📋 Getting call quote...');
  const callRequest: CallRequestV3 = {
    fromAggregatedAssetId: 'ob:usdc', // Pull from single source chain
    accounts,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: signedChainOp,
    slippageTolerance,
  };

  console.log('Call quote request:', JSON.stringify(callRequest, null, 2));
  const quote = await fetchCallQuoteV3(callRequest);
  console.log('\n✅ Call quote response:', JSON.stringify(quote, null, 2));

  // Execute call quote
  const result = await executeCallQuote(
    quote,
    signerKey,
    solanaKeypair,
    solanaAccount,
    'atomic',
    evmAccountType,
  );

  console.log('\n✅ Atomic deposit completed!');
  return { success: true, flow: 'atomic', result };
}

// OPTION 2: Two-step deposit (multi-input scenarios)
async function depositTwoStep(
  accounts: any[],
  evmAccount: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  amount: string,
  decimals: number,
  slippageTolerance: number,
  evmAccountType: EvmAccountType,
) {
  console.log('\n💡 Using TWO-STEP flow (multi-input detected)\n');
  console.log('📊 STEP 1: Consolidating funds to Arbitrum...');

  const contractAccountType = getContractAccountType(evmAccountType);

  // Fetch balance
  const accountParam = buildAccountParam(evmAccount, solanaAccount);
  const balanceResponse = await fetchAggregatedBalanceV3(accountParam, 'ob:usdc');

  const asset = balanceResponse.balanceByAggregatedAsset?.find(
    (a) => a.aggregatedAssetId === 'ob:usdc',
  );

  if (!asset) {
    throw new Error('No USDC balance found');
  }

  const requestedAmount = BigInt(amount);

  // Calculate Arbitrum balance and show breakdown
  let arbitrumBalance = 0n;
  console.log('\n💰 Balance breakdown:');
  for (const balance of asset.individualAssetBalances) {
    const chainId = getChainIdentifier(balance.assetType);
    const nativeDecimals = getNativeDecimals(chainId);
    const balanceAmount = BigInt(balance.balance);

    console.log(`  - Chain ${chainId}: ${formatUnits(balanceAmount, nativeDecimals)} USDC`);

    if (chainId === '42161') {
      // Normalize to aggregated decimals
      const decimalDiff = decimals - nativeDecimals;
      arbitrumBalance += balanceAmount * 10n ** BigInt(decimalDiff);
    }
  }

  const availableNonArbitrum = calculateNonDestinationBalance(asset, '42161', decimals);

  console.log(`\n💱 Consolidation plan:`);
  console.log(`   Requested for deposit: ${formatUnits(requestedAmount, decimals)} USDC`);
  console.log(`   Already on Arbitrum: ${formatUnits(arbitrumBalance, decimals)} USDC`);
  console.log(
    `   Available from other chains: ${formatUnits(availableNonArbitrum, decimals)} USDC`,
  );

  // Calculate how much we need to consolidate
  const needToConsolidate =
    requestedAmount > arbitrumBalance ? requestedAmount - arbitrumBalance : 0n;
  const amountToConsolidate =
    needToConsolidate < availableNonArbitrum ? needToConsolidate : availableNonArbitrum;

  console.log(`   Need to consolidate: ${formatUnits(needToConsolidate, decimals)} USDC`);
  console.log(`   Will consolidate: ${formatUnits(amountToConsolidate, decimals)} USDC\n`);

  const swapQuoteRequest: QuoteRequestV3 = {
    from: {
      accounts,
      asset: { assetId: 'ob:usdc' },
      amount: amountToConsolidate.toString(),
    },
    to: {
      asset: { assetId: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}` },
      account: `eip155:42161:${evmAccount.accountAddress}`,
    },
    slippageTolerance,
  };

  console.log('📋 Getting swap quote...');
  console.log('Swap quote request:', JSON.stringify(swapQuoteRequest, null, 2));

  const swapQuote = await getQuoteV3(swapQuoteRequest);

  console.log('\n✅ Swap quote response:', JSON.stringify(swapQuote, null, 2));

  console.log('\n✅ Swap quote received:');
  console.log(`  - Quote ID: ${swapQuote.id}`);
  console.log(`  - From: ${swapQuote.originToken?.aggregatedAssetId || 'unknown'}`);
  console.log(`  - To: ${swapQuote.destinationToken?.assetType || 'unknown'}`);

  // Get actual input/output amounts from swap (in native decimals - 6 for USDC)
  // Note: originToken.fiatValue contains the actual amounts pulled per chain
  const swapOutputAmount = swapQuote.destinationToken?.amount || '0';
  const swapInputAmounts = swapQuote.originToken?.fiatValue as
    | Array<{ assetType: string; fiatValue: string; amount?: string }>
    | undefined;
  const actualSwapInput = Array.isArray(swapInputAmounts)
    ? swapInputAmounts.reduce((sum, v) => sum + BigInt(v.amount || '0'), 0n)
    : 0n;
  console.log(`  - Amount in: ${formatUnits(actualSwapInput, 6)} USDC`);
  console.log(`  - Amount out: ${formatUnits(BigInt(swapOutputAmount), 6)} USDC`);

  // Sign swap operations
  console.log('\n📋 Signing swap operations...');
  const signedSwapQuote = await signAllOperations(
    swapQuote,
    signerKey,
    solanaKeypair,
    solanaAccount,
    contractAccountType,
  );

  console.log('⚡ Executing swap...');
  const swapResult = await executeQuoteV3(signedSwapQuote);

  if (!swapResult.success) {
    throw new Error(swapResult.error || 'Swap execution failed');
  }

  console.log('✅ Swap executed successfully!');

  // Monitor swap completion
  console.log('📋 Monitoring swap...');
  await monitorTransactionCompletion(swapQuote);
  console.log('✅ Funds consolidated on Arbitrum!\n');

  // Wait a moment for balance to update
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // STEP 2: Deposit to Hyperliquid bridge using call data
  console.log('\n🌉 STEP 2: Depositing to Hyperliquid bridge...');

  // Calculate actual available after consolidation (arbBalance + swapOutput)
  const swapOutputBigInt = BigInt(swapOutputAmount);
  const nativeDecimals = 6;
  const decimalDiff = decimals - nativeDecimals;
  const arbitrumBalanceNative = arbitrumBalance / 10n ** BigInt(decimalDiff);
  const actualAvailable = arbitrumBalanceNative + swapOutputBigInt;
  const requestedDepositNative = requestedAmount / 10n ** BigInt(decimalDiff);

  // Use min(requested, actualAvailable) accounting for fees/slippage
  const depositAmount = (
    requestedDepositNative < actualAvailable ? requestedDepositNative : actualAvailable
  ).toString();

  console.log(`💰 Available for deposit: ${formatUnits(actualAvailable, 6)} USDC`);
  console.log(`   Requested: ${formatUnits(requestedDepositNative, 6)} USDC`);
  console.log(`   Will deposit: ${formatUnits(BigInt(depositAmount), 6)} USDC\n`);

  console.log('📋 Preparing transfer to Hyperliquid bridge...');
  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [HYPERLIQUID_BRIDGE as Hex, BigInt(depositAmount)],
  });

  console.log('✅ Transfer calldata encoded');
  console.log(`  - To: ${HYPERLIQUID_BRIDGE}`);
  console.log(`  - Amount: ${formatUnits(BigInt(depositAmount), 6)} USDC\n`);

  // Prepare call quote (same-chain operation on Arbitrum)
  console.log('\n📋 Preparing call quote...');
  const prepareRequest: PrepareCallRequestV3 = {
    accounts,
    targetChain: ARBITRUM_CHAIN,
    calls: [
      {
        to: ARBITRUM_USDC as Hex,
        data: transferCallData,
        value: '0x0',
      },
    ],
    tokensRequired: [
      {
        assetType: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
        amount: depositAmount, // Use actual consolidated amount
      },
    ],
  };

  console.log('Prepare call request:', JSON.stringify(prepareRequest, null, 2));

  const preparedQuote = await prepareCallQuoteV3(prepareRequest);

  console.log('\n✅ Prepared quote response:', JSON.stringify(preparedQuote, null, 2));

  console.log('\n✅ Prepared quote received');

  // Sign target chain operation
  console.log('📋 Signing target chain operation...');
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerKey.privateKey,
    contractAccountType,
  );
  console.log('✅ Target chain operation signed\n');

  // Get call quote (should be same-chain, no cross-chain routing)
  console.log('\n📋 Getting call quote...');
  const callRequest: CallRequestV3 = {
    // Use specific Arbitrum USDC (not aggregated) since we just swapped
    fromAssetId: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
    accounts,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: signedChainOp,
    slippageTolerance,
  };

  console.log('Call quote request:', JSON.stringify(callRequest, null, 2));

  const quote = await fetchCallQuoteV3(callRequest);

  console.log('\n✅ Call quote response:', JSON.stringify(quote, null, 2));

  console.log('\n✅ Call quote received:');
  console.log(`  - Quote ID: ${quote.id}`);
  console.log(`  - Call type: ${(preparedQuote as any).callType || 'same-chain'}`);
  console.log(`  - Origin operations: ${quote.originChainsOperations?.length || 0}`);

  // Execute call quote
  const depositResult = await executeCallQuote(
    quote,
    signerKey,
    solanaKeypair,
    solanaAccount,
    'two-step',
    evmAccountType,
  );

  console.log('\n🎉 Two-step deposit completed!');
  console.log(`\n💡 Summary:`);
  console.log(`   1. Requested consolidation: ${formatUnits(amountToConsolidate, decimals)} USDC`);
  console.log(
    `   2. Actually pulled: ${formatUnits(actualSwapInput, 6)} USDC → received ${formatUnits(BigInt(swapOutputAmount), 6)} USDC`,
  );
  console.log(
    `   3. Deposited ${formatUnits(BigInt(depositAmount), 6)} USDC to Hyperliquid bridge`,
  );
  console.log(`   Sender: ${evmAccount?.accountAddress}`);
  console.log(`   Bridge: ${HYPERLIQUID_BRIDGE}\n`);

  return { swapResult, depositResult, success: true, flow: 'two-step' };
}

// Smart router: detects single vs multi-input and chooses optimal flow
async function depositToHyperLiquid(
  amount: string,
  decimals: number,
  slippageTolerance: number = 50,
  evmAccountType: EvmAccountType = 'eip7702',
) {
  try {
    const accountTypeLabel = evmAccountType === 'eip7702' ? 'EIP-7702' : 'Standard';
    console.log(`🚀 Starting smart Hyperliquid deposit with ${accountTypeLabel} account...\n`);

    // Load accounts based on selected type
    const { accounts, evmAccount, signerKey, solanaKeypair, solanaAccount } =
      await loadMultiChainAccounts({
        needsEvm: true,
        needsSolana: true, // Set to false to test EVM-only
        sessionKeyName: 'session2',
        evmAccountType,
      });

    if (!evmAccount || !signerKey) {
      throw new Error('EVM account is required');
    }

    // Check aggregated USDC balance
    const balanceAddress = getBalanceCheckAddress('ob:usdc', evmAccount, solanaAccount);
    await checkAssetBalance(balanceAddress, 'ob:usdc', decimals);

    // Prepare a test quote to detect multi-input scenario
    console.log('\n🔍 Detecting fund distribution...');

    // Convert amount from aggregated decimals to native token decimals (6 for USDC)
    const nativeDecimals = 6; // Arbitrum USDC has 6 decimals
    const decimalDiff = decimals - nativeDecimals;
    const amountInNativeDecimals = BigInt(amount) / 10n ** BigInt(decimalDiff);

    // Generate transfer calldata for test
    const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
    const testTransferCallData = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE as Hex, amountInNativeDecimals],
    });

    const testPrepareRequest: PrepareCallRequestV3 = {
      accounts,
      targetChain: ARBITRUM_CHAIN,
      calls: [
        {
          to: ARBITRUM_USDC as Hex,
          data: testTransferCallData,
          value: '0x0',
        },
      ],
      tokensRequired: [
        {
          assetType: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
          amount: amountInNativeDecimals.toString(),
        },
      ],
    };

    const testPrepare: TargetCallQuoteV3 = await prepareCallQuoteV3(testPrepareRequest);
    console.log('Test prepare:', JSON.stringify(testPrepare, null, 2));

    const needsTwoStep = needsTwoStepFlow(testPrepare);
    const sourceChains = testPrepare.sourceAssetBalances?.length || 0;
    const callType = testPrepare.callType || 'unknown';

    console.log(`\n📊 Detection results:`);
    console.log(`  - Account type: ${accountTypeLabel}`);
    console.log(`  - Call type: ${callType}`);
    console.log(`  - Source chains: ${sourceChains}`);
    console.log(`  - Flow: ${needsTwoStep ? 'TWO-STEP' : 'ATOMIC'}\n`);

    if (needsTwoStep) {
      console.log('✓ Multi-input scenario detected');
      console.log('→ Using two-step consolidation flow\n');
      return await depositTwoStep(
        accounts,
        evmAccount,
        signerKey,
        solanaKeypair,
        solanaAccount,
        amount,
        decimals,
        slippageTolerance,
        evmAccountType,
      );
    } else {
      console.log('✓ Single-input scenario detected');
      console.log('→ Using atomic calldata flow\n');
      return await depositAtomic(
        accounts,
        evmAccount,
        signerKey,
        solanaKeypair,
        solanaAccount,
        amount,
        decimals,
        slippageTolerance,
        evmAccountType,
      );
    }
  } catch (error) {
    console.error('\n❌ Deposit failed:', (error as Error).message);
    throw error;
  }
}

// Main - Smart Hyperliquid deposit
async function main() {
  try {
    // ========================================
    // ACCOUNT TYPE SWITCH
    // ========================================
    // Choose which account type to use:
    // - 'eip7702': EIP-7702 account (kernel-v3.3-ecdsa) - EOA is the account address
    // - 'standard': Standard account (kernel-v3.1-ecdsa) - uses predictStandardAddress
    const ACCOUNT_TYPE: EvmAccountType = 'standard';

    // Deposit USDC to Hyperliquid bridge
    // Automatically detects single-input vs multi-input scenario
    // and chooses optimal flow (atomic vs two-step)

    await depositToHyperLiquid(
      parseUnits('3', 6).toString(), // 1.5 USDC
      6, // Balance decimals
      50, // Slippage tolerance
      ACCOUNT_TYPE,
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
