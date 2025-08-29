import { encodeFunctionData, parseAbi } from 'viem';

import {
  readOrCacheEOAKey,
  prepareCallQuote,
  fetchCallQuote,
  executeQuote,
  fetchUSDCBalance,
  monitorTransactionCompletion,
  signOperation,
  type EvmAccount,
  type PrepareCallRequest,
  type CallRequest,
  type Hex,
  ContractAccountType,
} from '../helpers';

async function transferErc20WithEIP7702(
  account: EvmAccount,
  signerPrivateKey: Hex,
  usdcBalances: {
    aggregatedAssetId: string;
    balance: string;
    individualAssetBalances: { assetType: string; balance: string; fiatValue: number }[];
  },
) {
  console.log('Starting 1 USDC transfer...');

  const largestUsdcBalanceEntry = usdcBalances.individualAssetBalances.reduce((max, current) => {
    return Number(current.balance) > Number(max.balance) ? current : max;
  });

  const chain = 'eip155:42161'; // Arbitrum
  const usdcAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'; // Arbitrum USDC address
  const transferAmount = '1000000'; // 1 USDC (6 decimals)

  if (largestUsdcBalanceEntry.balance === '0') {
    throw new Error('No USDC balance found');
  }

  console.log(`Transferring 1 USDC from balance: ${largestUsdcBalanceEntry.balance}`);

  // Create transfer calldata
  const transferDefinition = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferDefinition,
    functionName: 'transfer',
    args: [account.signerAddress, BigInt(transferAmount)], // Transfer to self
  });

  // Prepare quote
  const quoteRequest: PrepareCallRequest = {
    account,
    targetChain: chain,
    calls: [
      {
        to: usdcAddress as Hex,
        data: transferCallData,
        value: '0x0',
      },
    ],
    tokensRequired: [
      {
        assetType: `${chain}/erc20:${usdcAddress}`,
        amount: transferAmount,
      },
    ],
  };

  const preparedQuote = await prepareCallQuote(quoteRequest);
  console.log('Quote prepared');

  // Sign delegation and operation
  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerPrivateKey,
    ContractAccountType.KernelV33  // Use Kernel V3.3 for EIP-7702
  );
  console.log('Operation signed successfully');

  // Get executable quote
  const callRequest: CallRequest = {
    account,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: signedChainOp,
    fromAggregatedAssetId: 'ds:usdc',
  };

  console.log('Fetching call quote...');
  const quote = await fetchCallQuote(callRequest);
  console.log('Quote received, ID:', quote.id);

  // Sign origin chain operations
  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const signedOriginChainOp = await signOperation(
      quote.originChainsOperations[i],
      signerPrivateKey,
      ContractAccountType.KernelV33
    );
    quote.originChainsOperations[i] = signedOriginChainOp;
  }

  console.log('All operations signed');

  // Execute quote
  const result = await executeQuote(quote);
  console.log('Execution initiated, success:', result.success);

  await monitorTransactionCompletion(quote);
}

async function main() {
  console.log('🚀 Starting EIP-7702 USDC Transfer Example');
  
  try {
    // Load or generate EOA key
    const signerKey = readOrCacheEOAKey('session');
    console.log('Using EOA Address:', signerKey.address);

    // Configure EIP-7702 account using the EOA address
    const account: EvmAccount = {
      type: 'kernel-v3.3-ecdsa',
      deploymentType: 'EIP7702',
      accountAddress: signerKey.address.toLowerCase() as Hex,
      signerAddress: signerKey.address.toLowerCase() as Hex,
    };

    console.log('Account Address:', account.accountAddress);

    // Check USDC balances
    const usdcBalances = await fetchUSDCBalance(account.accountAddress);
    if (!usdcBalances) {
      console.log('⚠️  No USDC balance found. Please add USDC to:', account.accountAddress);
      return;
    }

    console.log('USDC Balance:', usdcBalances.balance);
    
    await transferErc20WithEIP7702(account, signerKey.privateKey, usdcBalances);
    console.log('✅ Transfer completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Gracefully shutting down...');
  process.exit(0);
});

// Run the example
main();
