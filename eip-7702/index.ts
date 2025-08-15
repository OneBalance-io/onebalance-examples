import { encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  readOrCacheEOAKey,
  prepareCallQuote,
  fetchCallQuote,
  executeQuote,
  fetchTransactionHistory,
  fetchUSDCBalance,
  signOperation,
  type EvmAccount,
  type PrepareCallRequest,
  type CallRequest,
  type ChainOperation,
  type Hex,
  type Quote,
  type DelegationSignature,
  DelegationSignatureType,
} from '../helpers';

// EIP-7702 specific helper: Sign delegation authorization (in-place modification)
async function signDelegation(
  chainOperation: ChainOperation,
  signerPrivateKey: Hex
): Promise<void> {
  if (!chainOperation.delegation) {
    console.log('No delegation needed for this operation');
    return;
  }

  const chainId = Number(chainOperation.typedDataToSign.domain?.chainId);
  const signerAccount = privateKeyToAccount(signerPrivateKey);

  console.log(`Signing delegation for chain ${chainId}...`);

  // Create the authorization tuple for EIP-7702
  const authTuple = {
    contractAddress: chainOperation.delegation.contractAddress,
    nonce: chainOperation.delegation.nonce,
    chainId: chainId,
  };

  console.log('Auth tuple to sign:', authTuple);

  // Sign the authorization using the signer account
  const signedTuple = await signerAccount.signAuthorization(authTuple);

  console.log('Signed authorization tuple:', signedTuple);

  if (signedTuple.yParity == null) {
    throw new Error('Y parity is required for EIP-7702 delegation');
  }

  // Create the delegation signature and assign it directly (in-place)
  chainOperation.delegation.signature = {
    chainId: chainId,
    contractAddress: signedTuple.address,
    nonce: signedTuple.nonce,
    r: signedTuple.r,
    s: signedTuple.s,
    v: `0x${Number(signedTuple.v).toString(16).padStart(2, '0')}` as Hex,
    yParity: signedTuple.yParity,
    type: DelegationSignatureType.Signed,
  };

  console.log('Delegation signed successfully:', {
    contractAddress: chainOperation.delegation.contractAddress,
    nonce: chainOperation.delegation.nonce,
    chainId,
    signature: chainOperation.delegation.signature,
  });

  console.log('Final delegation object:', JSON.stringify(chainOperation.delegation, null, 2));
}

// Execute a cross-chain ERC20 transfer using EIP-7702 atomic delegation
async function transferErc20WithEIP7702(
  account: EvmAccount,
  signerPrivateKey: Hex,
  usdcBalances: {
    aggregatedAssetId: string;
    balance: string;
    individualAssetBalances: { assetType: string; balance: string; fiatValue: number }[];
  },
) {
  console.log('\n=== Starting EIP-7702 Atomic Transfer ===');

  const largestUsdcBalanceEntry = usdcBalances.individualAssetBalances.reduce((max, current) => {
    return Number(current.balance) > Number(max.balance) ? current : max;
  });

  const chain = 'eip155:42161'; // Arbitrum
  const usdcAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC address
  const transferAmount = '500000'; // 0.5 USDC (6 decimals)

  if (largestUsdcBalanceEntry.balance === '0') {
    throw new Error('No USDC balance found');
  }

  console.log(`Transferring ${transferAmount} from largest balance: ${largestUsdcBalanceEntry.balance}`);

  // Create transfer calldata
  const transferDefinition = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);
  const transferCallData = encodeFunctionData({
    abi: transferDefinition,
    functionName: 'transfer',
    args: [account.signerAddress, BigInt(transferAmount)], // Transfer to self as example
  });

  // Step 1: Prepare the call quote
  console.log('\n1. Preparing call quote...');
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
  console.log('Quote prepared successfully');

  // Step 2: Sign delegation (if needed) and the operation
  console.log('\n2. Signing delegation and operation...');
  console.log({ preparedQuote, chainOperation: preparedQuote.chainOperation });
  
  // Sign delegation if present (in-place modification)
  await signDelegation(preparedQuote.chainOperation, signerPrivateKey);
  
  // Sign the user operation (inline EIP-712 signing)
  console.log('Typed data to sign:', JSON.stringify(preparedQuote.chainOperation.typedDataToSign, null, 2));
  
  const signerAccount = privateKeyToAccount(signerPrivateKey);
  
  // Extract the typed data parameters correctly for viem
  const { domain, types, primaryType, message } = preparedQuote.chainOperation.typedDataToSign;
  
  console.log('Signing with params:', {
    account: signerAccount.address,
    domain,
    primaryType,
    message
  });
  
  const signature = await signerAccount.signTypedData({
    domain,
    types,
    primaryType,
    message
  } as any);
  
  // Update userOp signature in-place
  preparedQuote.chainOperation.userOp.signature = signature;
  
  console.log('Operation signed successfully');
  console.log('UserOp signature:', preparedQuote.chainOperation.userOp.signature);
  console.log('UserOp sender:', preparedQuote.chainOperation.userOp.sender);
  console.log('Account signerAddress:', account.signerAddress);
  
  // Verify the signature locally
  const { verifyTypedData } = await import('viem');
  const isValid = await verifyTypedData({
    address: preparedQuote.chainOperation.userOp.sender as `0x${string}`,
    domain,
    types,
    primaryType,
    message,
    signature
  });
  console.log('Local signature verification:', isValid);
  
  // Also try with the signerAddress
  const isValidWithSigner = await verifyTypedData({
    address: account.signerAddress,
    domain,
    types,
    primaryType,
    message,
    signature
  });
  console.log('Signature valid for signerAddress:', isValidWithSigner);

  // Step 3: Get the executable call quote
  console.log('\n3. Fetching executable quote...');
  const callRequest: CallRequest = {
    account,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: preparedQuote.chainOperation,  // Use the original object with in-place modifications
    fromAggregatedAssetId: 'ds:usdc',  // ✅ Correct for public API key
  };

  console.log('Call request details:', {
    account: callRequest.account,
    hasSignature: !!callRequest.chainOperation.userOp.signature,
    hasDelegation: !!callRequest.chainOperation.delegation,
    hasDelegationSignature: !!callRequest.chainOperation.delegation?.signature,
  });

  // Log the EXACT payload being sent to the API
  console.log('Full chainOperation being sent:', JSON.stringify(callRequest.chainOperation, null, 2));
  console.log('UserOp signature hex:', callRequest.chainOperation.userOp.signature);
  
  if (callRequest.chainOperation.delegation?.signature) {
    console.log('Delegation signature details:', JSON.stringify(callRequest.chainOperation.delegation.signature, null, 2));
  }

  const quote = await fetchCallQuote(callRequest);
  console.log('Executable quote received:', quote.id);

  // Sign all origin chain operations (for multi-chain scenarios)
  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    // Sign delegation if present (in-place modification)
    await signDelegation(quote.originChainsOperations[i], signerPrivateKey);
    
    // Sign the user operation (inline EIP-712 signing)
    const originSignerAccount = privateKeyToAccount(signerPrivateKey);
    const originSignature = await originSignerAccount.signTypedData(quote.originChainsOperations[i].typedDataToSign);
    
    // Update userOp signature in-place
    quote.originChainsOperations[i].userOp.signature = originSignature;
  }

  console.log('All operations signed successfully');

  // Step 4: Execute the atomic operation
//   console.log('\n4. Executing atomic operation...');
//   const bundle = await executeQuote(quote);

//   if (bundle.success) {
//     console.log('✅ Bundle executed successfully!');
//     console.log('Atomic operation completed:', {
//       delegation: 'Completed atomically',
//       bridging: 'Completed atomically', 
//       execution: 'Completed atomically',
//     });

//     // Monitor transaction completion
//     await monitorTransactionCompletion(quote);
//   } else {
//     console.log('❌ Bundle execution failed:', bundle.error);
//     throw new Error(`Bundle execution failed: ${bundle.error}`);
//   }
}

// Monitor transaction completion
async function monitorTransactionCompletion(quote: Quote): Promise<void> {
  console.log('\n5. Monitoring transaction completion...');
  
  const timeout = 60_000; // 60 seconds
  const startTime = Date.now();
  let completed = false;

  while (!completed && (Date.now() - startTime < timeout)) {
    try {
      const transactionHistory = await fetchTransactionHistory(quote.account.accountAddress);

      if (transactionHistory.transactions.length > 0) {
        const [tx] = transactionHistory.transactions;

        if (tx.quoteId === quote.id) {
          console.log(`Transaction status: ${tx.status}`);
          
          if (tx.status === 'COMPLETED') {
            console.log('🎉 Transaction completed successfully!');
            completed = true;
            break;
          } else if (tx.status === 'FAILED' || tx.status === 'REFUNDED') {
            throw new Error(`Transaction ${tx.status.toLowerCase()}`);
          }
        }
      }
    } catch (error) {
      console.log('Error checking transaction status:', error);
    }

    if (!completed) {
      await new Promise((resolve) => setTimeout(resolve, 2_000)); // Wait 2 seconds
    }
  }

  if (!completed) {
    throw new Error('Transaction monitoring timeout - check status manually');
  }
}

// Main execution function
async function main() {
  console.log('🚀 Starting EIP-7702 Atomic Cross-Chain Example');
  
  try {
    // Generate or load EOA keys (no prediction needed for 7702!)
    const sessionKey = readOrCacheEOAKey('session');
    console.log('Session EOA Address:', sessionKey.address);

    // For EIP-7702, account address is the same as signer address
    // Ensure consistent address formatting (lowercase to match UserOp sender)
    const normalizedAddress = sessionKey.address.toLowerCase() as Hex;
    const account: EvmAccount = {
      type: 'kernel-v3.3-ecdsa',
      deploymentType: 'EIP7702',
      accountAddress: normalizedAddress,
      signerAddress: normalizedAddress, // Same address - no prediction!
    };

    console.log('EIP-7702 Account Configuration:', account);

    // Check USDC balances
    console.log('\nChecking USDC balances...');
    const usdcBalances = await fetchUSDCBalance(account.accountAddress);

    if (!usdcBalances) {
      console.log('⚠️  No USDC balance found. Please add some USDC to your account to test.');
      console.log('Account address:', account.accountAddress);
      return;
    }

    console.log('USDC Balances found:', {
      total: usdcBalances.balance,
      chains: usdcBalances.individualAssetBalances.map(b => ({
        assetType: b.assetType,
        balance: b.balance,
      })),
    });

    // Execute the EIP-7702 atomic transfer
    await transferErc20WithEIP7702(account, sessionKey.privateKey, usdcBalances);

    console.log('\n✅ EIP-7702 example completed successfully!');

  } catch (error) {
    console.error('❌ Error running EIP-7702 example:', error);
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
