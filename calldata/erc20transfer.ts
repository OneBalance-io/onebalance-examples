import { parseAbi, encodeFunctionData } from 'viem';
import {
  readOrCacheEOAKey,
  predictAddress,
  fetchUSDCBalance,
  prepareCallQuote,
  fetchCallQuote,
  executeQuote,
  signOperation,
  monitorTransactionCompletion,
} from '../helpers';
import {
  Hex,
  PrepareCallRequest,
  CallRequest,
  ContractAccountType,
  RoleBasedAccount,
} from '../helpers/types';

/**
 * Simple ERC20 transfer example using OneBalance's V1 calldata endpoints
 *
 * This example demonstrates:
 * 1. Generating and caching EOA keys (session and admin)
 * 2. Predicting smart account address before deployment
 * 3. Fetching USDC balances across all supported chains
 * 4. Executing a small ERC20 USDC transfer (1 wei)
 * 5. Monitoring transaction completion in real-time
 */

// Configuration
const CHAIN = 'eip155:42161'; // Arbitrum
const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC
const TRANSFER_AMOUNT = '100000'; // 0.1 USDC (6 decimals)

async function transferErc20OnChain(account: RoleBasedAccount, recipientAddress: Hex) {
  console.log('📋 Step 1: Checking USDC balance...');

  const usdcBalances = await fetchUSDCBalance(account.accountAddress);

  if (!usdcBalances) {
    throw new Error('No USDC balance found');
  }

  console.log('✅ USDC Balances:', usdcBalances);

  const largestUsdcBalanceEntry = usdcBalances.individualAssetBalances.reduce((max, current) => {
    return Number(current.balance) > Number(max.balance) ? current : max;
  });

  if (largestUsdcBalanceEntry.balance === '0') {
    throw new Error('No USDC balance found');
  }

  console.log(
    `✅ Largest USDC balance: ${largestUsdcBalanceEntry.balance} on ${largestUsdcBalanceEntry.assetType}\n`,
  );

  console.log('📋 Step 2: Preparing transfer calldata...');

  const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [recipientAddress, 1n], // Transfer 1 wei USDC
  });

  console.log('✅ Transfer calldata encoded\n');

  console.log('📋 Step 3: Preparing call quote...');

  const quoteRequest: PrepareCallRequest = {
    account,
    targetChain: CHAIN,
    calls: [
      {
        to: USDC_ADDRESS as Hex,
        data: transferCallData,
        value: '0x0',
      },
    ],
    tokensRequired: [
      {
        assetType: `${CHAIN}/erc20:${USDC_ADDRESS}`,
        amount: TRANSFER_AMOUNT,
      },
    ],
  };

  const preparedQuote = await prepareCallQuote(quoteRequest);

  console.log('✅ Prepared quote received');
  console.log(
    `  - Tamper Proof Signature: ${preparedQuote.tamperProofSignature.slice(0, 20)}...\n`,
  );

  console.log('📋 Step 4: Signing chain operation...');

  const sessionKey = readOrCacheEOAKey('session');
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    sessionKey.privateKey,
    ContractAccountType.RoleBased,
  );

  console.log('✅ Chain operation signed\n');

  console.log('📋 Step 5: Getting call quote...');

  const callRequest: CallRequest = {
    fromAggregatedAssetId: 'ob:usdc',
    account,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: signedChainOp,
  };

  const quote = await fetchCallQuote(callRequest);

  console.log('✅ Call quote received:');
  console.log(`  - Quote ID: ${quote.id}`);
  console.log(`  - Origin operations: ${quote.originChainsOperations.length}`);
  console.log(
    `  - Expiration: ${new Date(Number(quote.expirationTimestamp) * 1000).toISOString()}`,
  );
  console.log();

  console.log('📋 Step 6: Signing origin chain operations...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    if ('userOp' in operation && 'typedDataToSign' in operation) {
      const signedOp = await signOperation(
        operation,
        sessionKey.privateKey,
        ContractAccountType.RoleBased,
      );
      quote.originChainsOperations[i] = signedOp;
    }
  }

  console.log('✅ All operations signed\n');

  console.log('📋 Step 7: Executing quote...');

  const bundle = await executeQuote(quote as any);

  if (!bundle.success) {
    throw new Error(bundle.error || 'Bundle execution failed');
  }

  console.log('✅ Quote executed successfully!\n');

  console.log('📋 Step 8: Monitoring transaction...');
  await monitorTransactionCompletion(quote as any, 60_000, 2_000);

  console.log('\n🎉 Transaction completed successfully!');
}

async function main() {
  console.log('🚀 Starting ERC20 Transfer Example...\n');

  // Load or generate session and admin keys
  const sessionKey = readOrCacheEOAKey('session');
  const adminKey = readOrCacheEOAKey('admin');

  console.log('Session Address:', sessionKey.address);
  console.log('Admin Address:', adminKey.address);

  // Predict smart account address
  const predictedAddress = await predictAddress(sessionKey.address, adminKey.address);

  console.log('Predicted Address:', predictedAddress);
  console.log();

  // Create account object
  const account: RoleBasedAccount = {
    type: 'role-based',
    accountAddress: predictedAddress as Hex,
    sessionAddress: sessionKey.address as Hex,
    adminAddress: adminKey.address as Hex,
  };

  // Execute transfer to admin address
  await transferErc20OnChain(account, adminKey.address as Hex);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
