import { parseUnits, parseAbi, encodeFunctionData } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
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

// Log capture for markdown export
const logBuffer: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function captureLog(...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ');
  logBuffer.push(message);
  originalConsoleLog.apply(console, args);
}

function captureError(...args: any[]) {
  const message = args
    .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)))
    .join(' ');
  logBuffer.push(`ERROR: ${message}`);
  originalConsoleError.apply(console, args);
}

function saveLogsToMarkdown(baseFilename: string) {
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `${baseFilename}-${dateStr}.md`;

  const markdown = `# Hyperliquid Smart Deposit Log

**Timestamp:** ${timestamp}

## Console Output

\`\`\`
${logBuffer.join('\n')}
\`\`\`
`;

  const logsDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const outputPath = path.join(logsDir, filename);
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  originalConsoleLog(`\n📄 Logs saved to: ${outputPath}`);
}

// Override console methods
console.log = captureLog;
console.error = captureError;

/**
 * Smart Hyperliquid Deposit with EIP-7702 Account
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
 *
 * See: .context/HYPERLIQUID.md for detailed explanation
 */

// Configuration
const ARBITRUM_CHAIN = 'eip155:42161';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HYPERLIQUID_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

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
) {
  console.log('\n💡 Using ATOMIC flow (single-input detected)\n');

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

  // STEP 2: Deposit to Hyperliquid bridge using call data
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

// Smart router: detects single vs multi-input and chooses optimal flow
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

// Main - Smart Hyperliquid deposit
async function main() {
  try {
    // Deposit USDC to Hyperliquid bridge
    // Automatically detects single-input vs multi-input scenario
    // and chooses optimal flow (atomic vs two-step)
    await depositToHyperLiquid(
      parseUnits('2', 6).toString(), // 0.5 USDC (6 decimals)
      6, // USDC decimals
      50, // 0.5% slippage
    );
  } catch (error) {
    console.error('Failed:', error);
  } finally {
    // Save logs to markdown file with timestamp
    saveLogsToMarkdown('depositToHyperLiquid2-log');

    // Restore original console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

if (require.main === module) {
  main().catch((error) => {
    originalConsoleError('Fatal error:', error);
    process.exit(1);
  });
}
