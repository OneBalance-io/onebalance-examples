import { PublicKey } from '@solana/web3.js';
import { formatUnits, parseUnits } from 'viem';
import bs58 from 'bs58';
import { loadSolanaKey, monitorTransactionCompletion, fetchAggregatedBalanceV3, getQuoteV3, executeQuoteV3, signSolanaOperation } from '../helpers';

// Solana asset IDs
const SOL_ASSET_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501";
const USDC_SOLANA_ASSET_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * Check SOL balance using the v3 aggregated balance endpoint that supports Solana
 */
async function checkSOLBalance(accountAddress: string) {
  try {
    console.log('🔍 Checking account balance...');
    
    const response = await fetchAggregatedBalanceV3(
      `solana:${accountAddress}`,
      'ds:sol'
    );
    
    const solBalance = response.balanceByAggregatedAsset?.find(
      asset => asset.aggregatedAssetId === 'ds:sol'
    );
    
    if (!solBalance) {
      throw new Error('No SOL balance found');
    }
    
    const balanceInSOL = parseFloat(formatUnits(BigInt(solBalance.balance), 9));
    console.log(`💰 Available SOL balance: ${balanceInSOL.toFixed(4)} SOL`);
    
    return balanceInSOL;
    
  } catch (error) {
    console.error('Failed to check balance:', error);
    throw error;
  }
}

/**
 * Perform SOL to USDC swap within Solana
 */
async function swapSOLtoUSDC() {
  try {
    console.log('🚀 Starting SOL to USDC swap within Solana...\n');
    
    // Load Solana keypair
    const { keypair, publicKey } = loadSolanaKey();
    console.log(`Using Solana account: ${publicKey}`);
    
    // Validate address format
    try {
      new PublicKey(publicKey);
    } catch (error) {
      throw new Error('Invalid Solana address format');
    }
    
    // Check balance
    const balance = await checkSOLBalance(publicKey);
    const swapAmount = 0.0015; // 0.0015 SOL
    
    if (balance < swapAmount) {
      throw new Error(`Insufficient balance. Need ${swapAmount} SOL, have ${balance.toFixed(4)} SOL`);
    }
    
    console.log(`\n💱 Swapping ${swapAmount} SOL to USDC...`);
    
    // Step 1: Get quote for SOL → USDC within Solana
    console.log('📋 Getting quote...');
    
    const quoteRequest = {
      from: {
        accounts: [{
          type: "solana",
          accountAddress: publicKey
        }],
        asset: {
          assetId: SOL_ASSET_ID
        },
        amount: parseUnits(swapAmount.toString(), 9).toString() // SOL has 9 decimals
      },
      to: {
        asset: {
          assetId: USDC_SOLANA_ASSET_ID
        }
      }
    };

    const quote = await getQuoteV3(quoteRequest);
    
    console.log('✅ Quote received:', {
      id: quote.id,
      willReceive: `${formatUnits(quote.destinationToken.amount, 6)} USDC`,
      fiatValue: `$${quote.destinationToken.fiatValue}`
    });

    // Step 2: Sign the Solana operation
    console.log('\n🔐 Signing Solana transaction...');
    
    const solanaOperation = quote.originChainsOperations.find((op: any) => op.type === 'solana');
    if (!solanaOperation) {
      throw new Error('No Solana operation found in quote');
    }
    
    // Convert keypair to private key string for signing
    const privateKeyString = bs58.encode(keypair.secretKey);
    const signedOperation = signSolanaOperation(publicKey, privateKeyString, solanaOperation);
    console.log('✅ Transaction signed successfully');
    
    const signedQuote = {
      ...quote,
      originChainsOperations: quote.originChainsOperations.map((op: any) => 
        op.type === 'solana' ? signedOperation : op
      )
    };

    // Step 3: Execute the swap
    console.log('\n⚡ Executing swap...');
    
    const result = await executeQuoteV3(signedQuote);
    
    console.log('🎯 Swap submitted successfully!');
    console.log('Execution success:', result.success);
    
    // Step 4: Monitor completion
    await monitorTransactionCompletion(quote);
    
    console.log('\n🎉 Swap completed successfully!');
    console.log(`✨ You have USDC in your Solana account`);
    
    return result;
  } catch (error) {
    console.error('\n❌ Swap failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function to run the swap
 */
async function main() {
  try {
    await swapSOLtoUSDC();
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Export functions for use in other files
export {
  checkSOLBalance,
  swapSOLtoUSDC
};

// Run the swap if this file is executed directly
if (require.main === module) {
  main();
}
