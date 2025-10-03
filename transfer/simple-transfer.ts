/**
 * Simple Transfer Example with Basic Account (Kernel v3.1)
 *
 * This example shows how to transfer assets to a specific recipient account
 * using the CAIP-10 format for the recipient address.
 *
 * CAIP-10 format: <namespace>:<chain_id>:<account_address>
 * Example: eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 *          solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:4yLyrKpdwhxFcBmjqkVXdqoH1NQFyTgufxP9LFjvKT1D
 */

import { formatUnits, parseUnits } from 'viem';
import {
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  checkAssetBalance,
  buildTransferRequest,
  loadAccounts,
  signAllOperations,
  getBalanceCheckAddress,
} from '../helpers';

/**
 * Transfer parameters
 */
interface TransferParams {
  assetId: string; // Asset to transfer (e.g., 'ob:usdc', 'ob:usdt')
  amount: string; // Amount to transfer (in smallest unit)
  recipientAccount: string; // Recipient in CAIP-10 format
  decimals?: number; // For display purposes
}

/**
 * Simple transfer function using basic account (kernel-v3.1-ecdsa)
 *
 * @param transferParams - The transfer parameters
 */
async function simpleTransfer(transferParams: TransferParams) {
  try {
    console.log('🚀 Starting a transfer...\n');
    console.log(`💸 Sending ${transferParams.assetId} to ${transferParams.recipientAccount}`);

    // Step 1: Load accounts (EVM + Solana if needed)
    const { accounts, evmAccount, solanaAccount, signerKey, solanaKeypair } = await loadAccounts(
      {
        fromAssetId: transferParams.assetId,
        toAssetId: transferParams.assetId, // Same asset for transfer
        amount: transferParams.amount,
        decimals: transferParams.decimals,
      },
      'session2',
    );

    // Step 2: Check balance
    const balanceCheckAddress = getBalanceCheckAddress(
      transferParams.assetId,
      evmAccount,
      solanaAccount,
    );
    await checkAssetBalance(balanceCheckAddress, transferParams.assetId, transferParams.decimals);

    // Step 3: Build transfer request (same asset, different recipient)
    console.log('\n📋 Building transfer request...');

    const transferRequest = buildTransferRequest(
      transferParams.assetId,
      transferParams.amount,
      accounts,
      transferParams.recipientAccount, // CAIP-10 format
    );

    console.log('Transfer Request:', JSON.stringify(transferRequest, null, 2));

    // Step 4: Get quote
    console.log('\n📋 Getting quote...');
    const quote = await getQuoteV3(transferRequest);

    // Display transfer info
    const transferAmount = transferParams.decimals
      ? formatUnits(BigInt(transferParams.amount), transferParams.decimals)
      : transferParams.amount;

    console.log('✅ Quote received:', {
      id: quote.id,
      sending: `${transferAmount} ${transferParams.assetId}`,
      to: transferParams.recipientAccount,
      willReceive: quote.destinationToken
        ? `${formatUnits(BigInt(quote.destinationToken.amount), transferParams.decimals || 18)}`
        : 'Unknown amount',
      fiatValue: quote.destinationToken ? `$${quote.destinationToken.fiatValue}` : 'Unknown value',
    });

    // Step 5: Sign all operations (EVM + Solana)
    const signedQuote = await signAllOperations(quote, signerKey, solanaKeypair, solanaAccount);

    // Step 6: Execute
    console.log('\n⚡ Ready to execute transfer...');

    const result = await executeQuoteV3(signedQuote);
    console.log('🎯 Transfer submitted successfully!');
    console.log('Execution success:', result.success);

    await monitorTransactionCompletion(quote);
    console.log('\n🎉 Transfer completed successfully!');

    return result;
  } catch (error) {
    console.error('\n❌ Transfer failed:', (error as Error).message);
    throw error;
  }
}

/**
 * Main function with examples
 */
async function main() {
  try {
    // Example 1: Transfer USDC to another address on Arbitrum
    // await simpleTransfer({
    //   assetId: 'ob:usdc',
    //   amount: parseUnits('1', 6).toString(),
    //   recipientAccount: 'eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    //   decimals: 6,
    // });

    // Example 2: Transfer aggregated USDT to Avalanche address
    // await simpleTransfer({
    //   assetId: 'ob:usdt',
    //   amount: parseUnits('5', 6).toString(),
    //   recipientAccount: 'eip155:43114:0xc9c2fcc7011748e7c8a3c16e819d6859f6140ec6',
    //   decimals: 6,
    // });

    // Example 3: Transfer specific USDC on Base to another Base address
    // await simpleTransfer({
    //   assetId: 'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    //   amount: parseUnits('2', 6).toString(),
    //   recipientAccount: 'eip155:8453:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    //   decimals: 6,
    // });

    // Example 4: Transfer SOL on Solana
    // await simpleTransfer({
    //   assetId: 'ob:sol',
    //   amount: parseUnits('0.1', 9).toString(),
    //   recipientAccount: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:4yLyrKpdwhxFcBmjqkVXdqoH1NQFyTgufxP9LFjvKT1D',
    //   decimals: 9,
    // });

    // Example 5: Cross-chain transfer - aggregate USDC from any chain to Optimism
    await simpleTransfer({
      assetId: 'ob:usdc',
      amount: parseUnits('1', 6).toString(),
      recipientAccount: 'eip155:10:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      decimals: 6,
    });

    console.log('\n✨ All transfers completed successfully!');
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}
