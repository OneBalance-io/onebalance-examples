import { formatUnits, parseUnits } from 'viem';
import { 
  readOrCacheEOAKey,
  loadSolanaKey,
  fetchAggregatedBalanceV3,
  getQuoteV3, 
  executeQuoteV3, 
  monitorTransactionCompletion,
  signOperation,
  signSolanaOperation,
  predictBasicAddress,
  ContractAccountType
} from '../helpers';
import bs58 from 'bs58';

/**
 * Interface for swap parameters
 */
interface SwapParams {
  fromAssetId: string;
  toAssetId: string;
  amount: string; // Already formatted amount as string (e.g., parseUnits result)
  decimals?: number; // For display purposes
}

/**
 * Helper function to detect if Solana is involved in the swap
 */
function isSolanaInvolved(fromAssetId: string, toAssetId: string): boolean {
  return fromAssetId.startsWith('solana:') || 
         toAssetId.startsWith('solana:') ||
         fromAssetId === 'ds:sol' ||
         toAssetId === 'ds:sol';
}

/**
 * Load and configure accounts (EVM and Solana if needed)
 */
async function loadAccounts(swapParams: SwapParams) {
  console.log('🔑 Loading accounts...');
  
  // Load EVM signer key and predict account address
  const signerKey = readOrCacheEOAKey('session2');
  const evmAccountAddress = await predictBasicAddress('kernel-v3.1-ecdsa', signerKey.address);
  
  console.log(`EVM Signer: ${signerKey.address}`);
  console.log(`EVM Account: ${evmAccountAddress}`);
  
  const evmAccount = {
    type: 'kernel-v3.1-ecdsa' as const,
    signerAddress: signerKey.address as `0x${string}`,
    accountAddress: evmAccountAddress as `0x${string}`,
  };
  
  // Check if Solana is needed and load if required
  const needsSolana = isSolanaInvolved(swapParams.fromAssetId, swapParams.toAssetId);
  let solanaAccount = null;
  let solanaKeypair = null;
  
  if (needsSolana) {
    const { keypair, publicKey } = loadSolanaKey();
    solanaKeypair = keypair;
    solanaAccount = {
      type: 'solana' as const,
      accountAddress: publicKey
    };
    console.log(`Solana Account: ${publicKey}`);
  }
  
  const accounts: any[] = [evmAccount];
  if (solanaAccount) {
    accounts.push(solanaAccount);
  }
  
  console.log(`✅ Loaded ${accounts.length} account(s): EVM${needsSolana ? ' + Solana' : ''}`);
  
  return {
    accounts,
    evmAccount,
    solanaAccount,
    signerKey,
    solanaKeypair
  };
}

/**
 * Build quote request with proper accounts array
 */
function buildQuoteRequest(swapParams: SwapParams, accounts: any[]) {
  return {
    from: {
      accounts,
      asset: {
        assetId: swapParams.fromAssetId
      },
      amount: swapParams.amount
    },
    to: {
      asset: {
        assetId: swapParams.toAssetId
      }
    }
  };
}

/**
 * Sign all operations (EVM and Solana)
 */
async function signAllOperations(quote: any, signerKey: any, solanaKeypair: any, solanaAccount: any) {
  console.log('🔐 Signing operations...');
  
  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];
    
    if (operation.type === 'solana' && solanaKeypair && solanaAccount) {
      // Sign Solana operation
      const privateKeyString = bs58.encode(solanaKeypair.secretKey);
      const signedOperation = signSolanaOperation(
        solanaAccount.accountAddress, 
        privateKeyString, 
        operation
      );
      quote.originChainsOperations[i] = signedOperation;
    } else if ('userOp' in operation && 'typedDataToSign' in operation) {
      // Sign EVM operation
      const signedOperation = await signOperation(
        operation,
        signerKey.privateKey,
        ContractAccountType.KernelV31
      );
      quote.originChainsOperations[i] = signedOperation;
    }
  }
  
  console.log('✅ All operations signed successfully');
  return quote;
}

/**
 * Universal balance checker that works with both aggregated assets and regular asset IDs
 */
async function checkAssetBalance(accountAddress: string, assetId: string, decimals: number = 18) {
  try {
    console.log(`🔍 Checking balance for asset: ${assetId}...`);
    
    // Determine account format based on asset type
    let accountIdentifier: string;
    if (assetId.startsWith('solana:') || assetId.includes('solana')) {
      // For Solana assets, use the account address directly
      accountIdentifier = accountAddress;
    } else if (assetId.startsWith('eip155:')) {
      // For chain-specific EIP-155 assets, extract the chain ID
      const chainId = assetId.split('/')[0]; // Gets 'eip155:42161' from 'eip155:42161/erc20:...'
      accountIdentifier = `${chainId}:${accountAddress}`;
    } else {
      // For aggregated assets or other cases, use Arbitrum as default chain
      accountIdentifier = `eip155:42161:${accountAddress}`;
    }
    
    // Call API with correct parameter based on asset type
    let response;
    if (assetId.startsWith('ds:')) {
      // For aggregated assets, pass as aggregatedAssetId
      response = await fetchAggregatedBalanceV3(accountIdentifier, assetId);
    } else {
      // For specific assets, pass as assetId (third parameter)
      response = await fetchAggregatedBalanceV3(accountIdentifier, undefined, assetId);
    }
    
    let balance: string | undefined;
    let assetSymbol: string = assetId;
    
    // Check if it's an aggregated asset (starts with 'ds:')
    if (assetId.startsWith('ds:')) {
      const aggregatedBalance = response.balanceByAggregatedAsset?.find(
        asset => asset.aggregatedAssetId === assetId
      );
      if (aggregatedBalance) {
        balance = aggregatedBalance.balance;
        assetSymbol = assetId.replace('ds:', '').toUpperCase();
      }
    } else {
      // For specific asset IDs, check in balanceBySpecificAsset
      const specificBalance = response.balanceBySpecificAsset?.find(
        asset => asset.assetType === assetId
      );
      if (specificBalance) {
        balance = specificBalance.balance;
        // Extract symbol from asset ID for display
        if (assetId.includes('/token:')) {
          const tokenAddress = assetId.split('/token:')[1];
          assetSymbol = `TOKEN-${tokenAddress.slice(0, 6)}...`; // Show first 6 chars of token address
        } else if (assetId.includes('/erc20:')) {
          const tokenAddress = assetId.split('/erc20:')[1];
          assetSymbol = `ERC20-${tokenAddress.slice(0, 6)}...`; // Show first 6 chars of token address
        } else if (assetId.includes('/slip44:')) {
          const slip44Code = assetId.split('/slip44:')[1];
          // Common SLIP-44 codes for display
          const slip44Map: Record<string, string> = {
            '60': 'ETH',
            '501': 'SOL',
            '0': 'BTC'
          };
          assetSymbol = slip44Map[slip44Code] || `SLIP44-${slip44Code}`;
        } else {
          assetSymbol = assetId.split(':').pop()?.toUpperCase() || assetId;
        }
      }
    }
    
    if (!balance) {
      console.log(`❌ No balance found for asset: ${assetId}`);
      return 0;
    }
    
    const formattedBalance = parseFloat(formatUnits(BigInt(balance), decimals));
    console.log(`💰 Available ${assetSymbol} balance: ${formattedBalance.toFixed(6)} ${assetSymbol}`);
    
    return formattedBalance;
    
  } catch (error) {
    console.error(`Failed to check balance for ${assetId}:`, error);
    throw error;
  }
}

/**
 * Universal swap function using basic account (kernel-v3.1-ecdsa)
 * Executes any swap payload without balance checking
 */
async function simpleSwap(swapParams: SwapParams) {
  try {
    console.log('🚀 Starting universal swap...\n');
    console.log(`💱 ${swapParams.fromAssetId} → ${swapParams.toAssetId}`);
    
    // Step 1: Load accounts (EVM + Solana if needed)
    const { accounts, evmAccount, solanaAccount, signerKey, solanaKeypair } = await loadAccounts(swapParams);
    
    // Step 2: Check balance for the from asset
    const balanceCheckAddress = swapParams.fromAssetId.startsWith('solana:') || swapParams.fromAssetId === 'ds:sol' 
      ? (solanaAccount?.accountAddress || evmAccount.accountAddress) 
      : evmAccount.accountAddress;
    await checkAssetBalance(balanceCheckAddress, swapParams.fromAssetId, swapParams.decimals);
    
    // Step 3: Get quote
    console.log('\n📋 Getting quote...');
    const quoteRequest = buildQuoteRequest(swapParams, accounts);
    console.log('Quote Request:', JSON.stringify(quoteRequest, null, 2));
    
    const quote = await getQuoteV3(quoteRequest);
    
    // Display quote info
    const fromAmount = swapParams.decimals 
      ? formatUnits(BigInt(swapParams.amount), swapParams.decimals)
      : swapParams.amount;
    
    console.log('✅ Quote received:', {
      id: quote.id,
      from: `${fromAmount} ${swapParams.fromAssetId}`,
      willReceive: quote.destinationToken 
        ? `${formatUnits(BigInt(quote.destinationToken.amount), 18)} ${swapParams.toAssetId}` 
        : 'Unknown amount',
      fiatValue: quote.destinationToken 
        ? `$${quote.destinationToken.fiatValue}` 
        : 'Unknown value'
    });

    // Step 4: Sign all operations (EVM + Solana)
    const signedQuote = await signAllOperations(quote, signerKey, solanaKeypair, solanaAccount);

    // Step 5: Execute
    console.log('\n⚡ Ready to execute swap...');

    const result = await executeQuoteV3(signedQuote);
    console.log('🎯 Swap submitted successfully!');
    console.log('Execution success:', result.success);

    await monitorTransactionCompletion(quote);
    console.log('\n🎉 Swap completed successfully!');

    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function with examples
 */
async function main() {
  try {
    // Example 1: Swap from aggregated USDC to SOL on Solana
    await simpleSwap({
        fromAssetId: 'ds:usdc',
        toAssetId: 'ds:sol', 
        amount: parseUnits('0.5', 6).toString(), // 1 USDC (6 decimals)
        decimals: 6
    });

    // Example 2: Swap from aggregated USDT to Solana USDC
    // await simpleSwap({
    //     fromAssetId: 'ds:usdt',
    //     toAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 
    //     amount: parseUnits('0.5', 6).toString(), // 1 USDT (6 decimals)
    //     decimals: 6
    // });

    // Example 3: Swap from USDC on Arbitrum to AAVE on Base
    // await simpleSwap({
    //     fromAssetId: 'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b', 
    //     amount: parseUnits('0.5', 6).toString(), // 1 USDT (6 decimals)
    //     decimals: 6
    // });

    // Example 4: Swap from USDC on Optimism to AAVE on Base
    // await simpleSwap({
    //     fromAssetId: 'eip155:10/erc20:0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b', 
    //     amount: parseUnits('0.5', 6).toString(), // 1 USDT (6 decimals)
    //     decimals: 6
    // });

    // Example 5: Swap from AERO on Base to aggregated USDC
    // await simpleSwap({
    //     fromAssetId: 'eip155:8453/erc20:0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    //     toAssetId: 'ds:usdc', 
    //     amount: parseUnits('1.5', 18).toString(), // 1.5 AERO (18 decimals)
    //     decimals: 18
    // });
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}
