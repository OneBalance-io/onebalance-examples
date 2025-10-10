import { parseAbi, encodeFunctionData } from 'viem';
import {
  readOrCacheEOAKey,
  predictStandardAddress,
  prepareCallQuoteV3,
  fetchCallQuoteV3,
  executeQuoteV3,
  signOperation,
  checkAssetBalance,
  monitorTransactionCompletion,
} from '../helpers';
import {
  Hex,
  StandardAccount,
  PrepareCallRequestV3,
  CallRequestV3,
  ContractAccountType,
  EOAKeyPair,
  TargetCallQuoteV3,
  CallQuoteResponseV3,
} from '../helpers/types';

/**
 * Simple calldata example using V3 endpoints with a Standard account (kernel-v3.1-ecdsa)
 *
 * This example shows:
 * 1. Loading a session key (session2)
 * 2. Predicting the smart account address
 * 3. Checking USDC balance
 * 4. Preparing a call quote for a USDC transfer
 * 5. Getting the call quote with signed operation
 * 6. Executing the quote
 * 7. Monitoring transaction completion
 */

// Configuration
const CHAIN = 'eip155:42161'; // Arbitrum
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
const TRANSFER_AMOUNT = '10000'; // 0.01 USDC

/**
 * Step 1: Load signer key and create account
 */
async function loadAccount(): Promise<{ signerKey: EOAKeyPair; account: StandardAccount }> {
  console.log('📋 Step 1: Loading account...');

  const signerKey = readOrCacheEOAKey('session2');
  const accountAddress = await predictStandardAddress('kernel-v3.1-ecdsa', signerKey.address);

  console.log(`Signer Address: ${signerKey.address}`);
  console.log(`Account Address: ${accountAddress}\n`);

  const account: StandardAccount = {
    type: 'kernel-v3.1-ecdsa',
    signerAddress: signerKey.address as Hex,
    accountAddress: accountAddress as Hex,
  };

  return { signerKey, account };
}

/**
 * Step 2: Verify account has sufficient USDC balance
 */
async function verifyBalance(accountAddress: string): Promise<void> {
  console.log('📋 Step 2: Checking USDC balance...');

  const usdcBalance = await checkAssetBalance(accountAddress, 'ob:usdc', 6);

  if (usdcBalance === 0) {
    throw new Error('No USDC balance found. Please fund your account first.');
  }

  console.log('✅ Balance verified\n');
}

/**
 * Step 3: Encode the transfer function call
 */
function prepareTransferCalldata(recipientAddress: Hex): Hex {
  console.log('📋 Step 3: Preparing transfer calldata...');

  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [recipientAddress, 1n], // Transfer 1 wei USDC
  });

  console.log('✅ Transfer calldata encoded\n');
  return transferData;
}

/**
 * Step 4: Prepare the call quote using V3 endpoint
 */
async function preparePrepareCallQuote(
  account: StandardAccount,
  transferData: Hex,
): Promise<TargetCallQuoteV3> {
  console.log('📋 Step 4: Preparing call quote...');

  const prepareRequest: PrepareCallRequestV3 = {
    accounts: [account],
    targetChain: CHAIN,
    calls: [
      {
        to: USDC_ADDRESS as Hex,
        data: transferData,
        value: '0x0',
      },
    ],
    tokensRequired: [
      {
        assetType: `${CHAIN}/erc20:${USDC_ADDRESS}`,
        amount: TRANSFER_AMOUNT,
      },
    ],
    fromAssetId: 'ob:usdc',
  };

  const preparedQuote = await prepareCallQuoteV3(prepareRequest);

  console.log('✅ Prepared quote:');
  console.log(`  - Call Type: ${preparedQuote.callType}`);
  console.log(`  - Tamper Proof Signature: ${preparedQuote.tamperProofSignature.slice(0, 20)}...`);
  console.log();

  return preparedQuote;
}

/**
 * Step 5-6: Sign the chain operation and get the final call quote
 */
async function getSignedCallQuote(
  account: StandardAccount,
  preparedQuote: TargetCallQuoteV3,
  signerKey: EOAKeyPair,
): Promise<CallQuoteResponseV3> {
  console.log('📋 Step 5: Signing chain operation...');

  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerKey.privateKey,
    ContractAccountType.KernelV31,
  );

  console.log('✅ Chain operation signed\n');

  console.log('📋 Step 6: Getting call quote...');

  const callRequest: CallRequestV3 = {
    accounts: [account],
    chainOperation: signedChainOp,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    fromAggregatedAssetId: 'ob:usdc',
  };

  const quote = await fetchCallQuoteV3(callRequest);

  console.log('✅ Call quote received:');
  console.log(`  - Quote ID: ${quote.id}`);
  console.log(`  - Origin operations: ${quote.originChainsOperations.length}`);
  console.log(
    `  - Expiration: ${new Date(Number(quote.expirationTimestamp) * 1000).toISOString()}`,
  );
  console.log();

  return quote;
}

/**
 * Step 7: Sign all origin chain operations
 */
async function signOriginOperations(
  quote: CallQuoteResponseV3,
  signerKey: EOAKeyPair,
): Promise<void> {
  console.log('📋 Step 7: Signing origin chain operations...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    if ('userOp' in operation && 'typedDataToSign' in operation) {
      const signedOp = await signOperation(
        operation,
        signerKey.privateKey,
        ContractAccountType.KernelV31,
      );
      quote.originChainsOperations[i] = signedOp;
    }
  }

  console.log('✅ All operations signed\n');
}

/**
 * Step 8-9: Execute the quote and monitor completion
 */
async function executeAndMonitor(quote: CallQuoteResponseV3): Promise<void> {
  console.log('📋 Step 8: Executing quote...');

  const result = await executeQuoteV3(quote);

  if (!result.success) {
    throw new Error(result.error || 'Quote execution failed');
  }

  console.log('✅ Quote executed successfully!\n');

  console.log('📋 Step 9: Monitoring transaction...');
  await monitorTransactionCompletion(quote, 60_000, 2_000);

  console.log('\n🎉 Transaction completed successfully!');
}

/**
 * Main function - orchestrates the entire calldata flow
 */
async function main() {
  console.log('🚀 Starting V3 calldata flow...\n');

  // Load account and signer key
  const { signerKey, account } = await loadAccount();

  // Verify sufficient balance
  await verifyBalance(account.accountAddress);

  // Prepare transfer calldata
  const transferData = prepareTransferCalldata(signerKey.address as Hex);

  // Prepare call quote
  const preparedQuote = await preparePrepareCallQuote(account, transferData);

  console.log('Prepared Quote:', JSON.stringify(preparedQuote, null, 2));
  // Get signed call quote
  const quote = await getSignedCallQuote(account, preparedQuote, signerKey);

  console.log('Call Quote:', JSON.stringify(quote, null, 2));

  // Sign all origin operations
  await signOriginOperations(quote, signerKey);

  // Execute and monitor
  await executeAndMonitor(quote);
}

// Run the example
main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
