import { parseUnits, formatUnits, parseAbi, encodeFunctionData } from 'viem';
import * as fs from 'fs';
import * as path from 'path';
import {
  loadAccounts,
  prepareCallQuoteV3,
  fetchCallQuoteV3,
  executeQuoteV3,
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

  const markdown = `# Hyperliquid Deposit Log

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
 * Deposit USDC to Hyperliquid Bridge using EIP-7702 account with call data
 *
 * This example demonstrates the correct way to deposit to Hyperliquid bridge:
 * - Uses call data endpoints instead of swap endpoints
 * - Keeps user account as sender on Arbitrum (required by Hyperliquid)
 * - Pulls from aggregated USDC balance across all chains
 * - Handles cross-chain routing automatically
 *
 * Why call data instead of swap:
 * - Swap endpoints route through Relay solver for cross-chain operations
 * - Relay becomes the sender, not the user
 * - Hyperliquid bridge only credits deposits from user accounts
 * - Call data keeps user as sender throughout the flow
 */

// Configuration
const ARBITRUM_CHAIN = 'eip155:42161';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const HYPERLIQUID_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

async function depositToHyperLiquid(
  amount: string,
  decimals: number,
  slippageTolerance: number = 50,
) {
  try {
    console.log('🚀 Starting Hyperliquid deposit...\n');

    // Step 1: Load EIP-7702 account
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

    // Step 2: Check aggregated USDC balance
    const balanceAddress = getBalanceCheckAddress('ob:usdc', evmAccount, solanaAccount);
    await checkAssetBalance(balanceAddress, 'ob:usdc', decimals);

    // Step 3: Prepare transfer calldata to Hyperliquid bridge
    console.log('\n📋 Preparing transfer to Hyperliquid bridge...');

    const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
    const transferCallData = encodeFunctionData({
      abi: transferAbi,
      functionName: 'transfer',
      args: [HYPERLIQUID_BRIDGE as Hex, BigInt(amount)],
    });

    console.log('✅ Transfer calldata encoded');
    console.log(`  - To: ${HYPERLIQUID_BRIDGE}`);
    console.log(`  - Amount: ${formatUnits(BigInt(amount), decimals)} USDC\n`);

    // Step 4: Prepare call quote
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

    const preparedQuote = await prepareCallQuoteV3(prepareRequest);
    console.log('✅ Prepared quote:', JSON.stringify(preparedQuote, null, 2));

    console.log('✅ Prepared quote received');
    console.log(
      `  - Tamper Proof Signature: ${preparedQuote.tamperProofSignature.slice(0, 20)}...\n`,
    );

    // Step 5: Sign target chain operation
    console.log('📋 Signing target chain operation...');

    const signedChainOp = await signOperation(
      preparedQuote.chainOperation,
      signerKey.privateKey,
      ContractAccountType.KernelV33,
    );

    console.log('✅ Target chain operation signed\n');

    // Step 6: Get call quote with cross-chain routing
    console.log('📋 Getting call quote with cross-chain routing...');

    const callRequest: CallRequestV3 = {
      //   fromAggregatedAssetId: 'ob:usdc',
      fromAssetId: `${ARBITRUM_CHAIN}/erc20:${ARBITRUM_USDC}`,
      accounts,
      tamperProofSignature: preparedQuote.tamperProofSignature,
      chainOperation: signedChainOp,
      slippageTolerance,
    };

    console.log('\n📤 Call request:', JSON.stringify(callRequest, null, 2));

    const quote = await fetchCallQuoteV3(callRequest);
    console.log('✅ Call quote:', JSON.stringify(quote, null, 2));

    console.log('\n✅ Full quote response:', JSON.stringify(quote, null, 2));

    console.log('\n✅ Call quote received:');
    console.log(`  - Quote ID: ${quote.id}`);
    console.log(`  - Origin operations: ${quote.originChainsOperations?.length || 0}`);
    console.log(
      `  - Expiration: ${new Date(Number(quote.expirationTimestamp) * 1000).toISOString()}`,
    );

    if (quote.originToken) {
      console.log('\n💰 Funding details:');
      console.log(`  - Using: ${quote.originToken.aggregatedAssetId}`);
      if (Array.isArray(quote.originToken.assetType)) {
        console.log(`  - From chains: ${quote.originToken.assetType.join(', ')}`);
      }
    }

    // Step 7: Sign origin chain operations
    console.log('\n📋 Signing origin chain operations...');

    const signedQuote = await signAllOperations(
      quote as any,
      signerKey,
      solanaKeypair,
      solanaAccount,
      ContractAccountType.KernelV33,
    );

    console.log('✅ All operations signed\n');

    // Step 8: Execute quote
    console.log('⚡ Executing quote...');

    const result = await executeQuoteV3(signedQuote as any);

    if (!result.success) {
      throw new Error(result.error || 'Quote execution failed');
    }

    console.log('✅ Quote executed successfully!\n');

    // Step 9: Monitor transaction completion
    console.log('📋 Monitoring transaction...');
    await monitorTransactionCompletion(quote as any);

    console.log('\n🎉 Deposit to Hyperliquid completed!');
    console.log(`\n💡 Your USDC has been deposited to Hyperliquid bridge`);
    console.log(`   The deposit will be credited to your account on Hyperliquid`);
    console.log(`   Sender address (your EIP-7702 account): ${evmAccount?.accountAddress}\n`);

    return result;
  } catch (error) {
    console.error('\n❌ Deposit failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main - Hyperliquid deposit example
 */
async function main() {
  try {
    // Deposit 1 USDC to Hyperliquid bridge on Arbitrum
    // This will pull from aggregated USDC across all chains
    await depositToHyperLiquid(
      parseUnits('0.2', 6).toString(), // 1 USDC (6 decimals)
      18, // USDC decimals
      50, // 0.5% slippage
    );
  } catch (error) {
    console.error('Failed:', error);
  } finally {
    // Save logs to markdown file with timestamp
    saveLogsToMarkdown('depositToHyperLiquid-log');

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
