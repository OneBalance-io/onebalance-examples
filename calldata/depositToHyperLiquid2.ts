import { parseUnits, parseAbi, encodeFunctionData } from 'viem';
import {
  loadAccounts,
  prepareCallQuoteV3,
  fetchCallQuoteV3,
  executeQuoteV3,
  getQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  signOperation,
  checkAssetBalance,
  getBalanceCheckAddress,
  type QuoteRequestV3,
  type PrepareCallRequestV3,
  type CallRequestV3,
  ContractAccountType,
  type Hex,
  type TargetCallQuoteV3,
  CallType,
} from '../helpers';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Smart Hyperliquid Deposit with EIP-7702 Account
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *
 * INTELLIGENT ROUTING:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ 1. Detect fund distribution across chains                       │
 * │ 2. Route to optimal flow based on detection:                    │
 * │                                                                  │
 * │    ┌─────────────┐                                              │
 * │    │  Detection  │                                              │
 * │    └──────┬──────┘                                              │
 * │           │                                                      │
 * │      ┌────┴────┐                                                │
 * │      │         │                                                │
 * │   SINGLE    MULTI                                               │
 * │   INPUT     INPUT                                               │
 * │      │         │                                                │
 * │   ┌──▼──┐   ┌──▼──┐                                            │
 * │   │FLOW │   │FLOW │                                            │
 * │   │  1  │   │  2  │                                            │
 * │   └─────┘   └─────┘                                            │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * FLOW 1: ATOMIC (single-input - funds on 1 chain)
 *   ✓ One transaction, optimal UX
 *   ✓ Cross-chain routing with calldata
 *   ✓ User stays as sender → bridge accepts
 *   Example: Base USDC → Arbitrum → Hyperliquid ✓
 *
 * FLOW 2: TWO-STEP (multi-input - funds on 2+ chains)
 *   ✓ Step 1: Consolidate to Arbitrum (swap endpoint)
 *   ✓ Step 2: Deposit from Arbitrum (calldata)
 *   ✓ Workaround for EIP-7702 limitation
 *   Example: Base + ETH USDC → Arbitrum → Hyperliquid ✓
 *
 * WHY THIS MATTERS:
 *   • Hyperliquid bridge ONLY credits deposits from user accounts
 *   • Cross-chain handlers become sender → bridge rejects ✗
 *   • Calldata keeps user as sender → bridge accepts ✓
 *   • Multi-input hits EIP-7702 limitation → needs consolidation
 *
 * REFERENCE:
 *   • Pattern used by Dexari: $4M+ monthly volume
 *   • Docs: .context/HYPERLIQUID.md
 *   • Working tx: arbiscan.io/tx/0x9739f147...
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Configuration
const ARBITRUM_CHAIN = 'eip155:42161';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HYPERLIQUID_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

/**
 * Determines if we need two-step flow based on callType and source balances
 *
 * ATOMIC FLOW (return false):
 * - same_chain_exclude_solver: all funds on target chain, no solver needed
 * - cross_chain_with_solver: single source chain, can route directly
 *
 * TWO-STEP FLOW (return true):
 * - Multiple source chains (funds split across chains)
 * - Requires consolidation first due to EIP-7702 limitation
 */
function needsTwoStepFlow(preparedQuote: TargetCallQuoteV3): boolean {
  // If same-chain without solver, we can do atomic
  if (preparedQuote.callType === CallType.SameChainExcludeSolver) {
    return false;
  }

  // Check if funds are on multiple chains
  const sourceBalances = preparedQuote.sourceAssetBalances || [];
  return sourceBalances.length > 1;
}

/**
 * Signs, executes, and monitors a call quote
 * Reusable for both atomic and two-step flows
 */
async function executeCallQuote(
  quote: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  flowType: 'atomic' | 'two-step',
) {
  console.log('\n📋 Signing origin chain operations...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    solanaKeypair,
    solanaAccount,
    ContractAccountType.KernelV33,
  );
  console.log('✅ All operations signed\n');

  // Execute
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

/**
 * OPTION 1: Atomic single-transaction deposit (for single-input scenarios)
 */
async function depositAtomic(
  accounts: any[],
  evmAccount: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  amount: string,
  decimals: number,
  slippageTolerance: number,
) {
  console.log('\n💡 Using ATOMIC flow (single-input detected)\n');

  // Prepare transfer calldata
  console.log('📋 Preparing transfer to Hyperliquid bridge...');
  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [HYPERLIQUID_BRIDGE as Hex, BigInt(amount)],
  });

  console.log('✅ Transfer calldata encoded');
  console.log(`  - To: ${HYPERLIQUID_BRIDGE}`);
  console.log(`  - Amount: ${Number(amount) / 10 ** decimals} USDC\n`);

  // Prepare call quote
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
        amount: amount,
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
    ContractAccountType.KernelV33,
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
  const result = await executeCallQuote(quote, signerKey, solanaKeypair, solanaAccount, 'atomic');

  console.log('\n✅ Atomic deposit completed!');
  return { success: true, flow: 'atomic', result };
}

/**
 * OPTION 2: Two-step consolidation deposit (for multi-input scenarios)
 */
async function depositTwoStep(
  accounts: any[],
  evmAccount: any,
  signerKey: any,
  solanaKeypair: any,
  solanaAccount: any,
  amount: string,
  decimals: number,
  slippageTolerance: number,
) {
  console.log('\n💡 Using TWO-STEP flow (multi-input detected)\n');
  console.log('📊 STEP 1: Consolidating funds to Arbitrum...');
  console.log('💱 Swapping ob:usdc → Arbitrum USDC\n');

  const swapQuoteRequest: QuoteRequestV3 = {
    from: {
      accounts,
      asset: { assetId: 'ob:usdc' },
      amount,
    },
    to: {
      asset: { assetId: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}` },
      account: `eip155:42161:${evmAccount.accountAddress}`,
      // Swap to self (same address)
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
  console.log(
    `  - Amount out: ${Number(swapQuote.destinationToken?.amount || 0) / 10 ** decimals} USDC`,
  );

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

  // ========================================================================
  // STEP 2: Deposit to Hyperliquid bridge using call data
  // ========================================================================
  console.log('\n🌉 STEP 2: Depositing to Hyperliquid bridge...');

  // Prepare transfer calldata
  console.log('📋 Preparing transfer to Hyperliquid bridge...');
  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [HYPERLIQUID_BRIDGE as Hex, BigInt(amount)],
  });

  console.log('✅ Transfer calldata encoded');
  console.log(`  - To: ${HYPERLIQUID_BRIDGE}`);
  console.log(`  - Amount: ${Number(amount) / 10 ** decimals} USDC\n`);

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
        amount: amount,
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
    ContractAccountType.KernelV33,
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
  );

  console.log('\n🎉 Two-step deposit completed!');
  console.log(`\n💡 Summary:`);
  console.log(`   1. Consolidated aggregated USDC to Arbitrum`);
  console.log(`   2. Deposited to Hyperliquid bridge from Arbitrum`);
  console.log(`   Sender: ${evmAccount?.accountAddress}`);
  console.log(`   Bridge: ${HYPERLIQUID_BRIDGE}\n`);

  return { swapResult, depositResult, success: true, flow: 'two-step' };
}

/**
 * Smart router: detects single vs multi-input and chooses optimal flow
 */
async function depositToHyperLiquid(
  amount: string,
  decimals: number,
  slippageTolerance: number = 50,
) {
  try {
    console.log('🚀 Starting smart Hyperliquid deposit...\n');

    // Load EIP-7702 account
    const { accounts, evmAccount, signerKey, solanaKeypair, solanaAccount } = await loadAccounts(
      {
        fromAssetId: 'ob:usdc',
        toAssetId: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
        amount,
        decimals,
      },
      'session4',
      'eip7702',
    );

    // Check aggregated USDC balance
    const balanceAddress = getBalanceCheckAddress('ob:usdc', evmAccount, solanaAccount);
    await checkAssetBalance(balanceAddress, 'ob:usdc', decimals);

    // Prepare a test quote to detect multi-input scenario
    console.log('\n🔍 Detecting fund distribution...');

    // Generate transfer calldata for test
    const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
    const testTransferCallData = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE as Hex, BigInt(amount)],
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
          amount: amount,
        },
      ],
    };

    const testPrepare: TargetCallQuoteV3 = await prepareCallQuoteV3(testPrepareRequest);
    console.log('Test prepare:', JSON.stringify(testPrepare, null, 2));

    const needsTwoStep = needsTwoStepFlow(testPrepare);
    const sourceChains = testPrepare.sourceAssetBalances?.length || 0;
    const callType = testPrepare.callType || 'unknown';

    console.log(`\n📊 Detection results:`);
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
      );
    }
  } catch (error) {
    console.error('\n❌ Deposit failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main - Smart Hyperliquid deposit
 */
async function main() {
  try {
    // Deposit USDC to Hyperliquid bridge
    // Automatically detects single-input vs multi-input scenario
    // and chooses optimal flow (atomic vs two-step)
    await depositToHyperLiquid(
      parseUnits('0.4', 6).toString(), // 0.5 USDC (6 decimals)
      18, // USDC decimals
      50, // 0.5% slippage
    );
  } catch (error) {
    console.error('Failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
