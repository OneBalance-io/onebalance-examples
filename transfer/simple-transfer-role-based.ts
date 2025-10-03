/**
 * Simple Transfer Example with Role-Based Account
 *
 * This example shows how to transfer assets to a specific recipient account
 * using role-based accounts and CAIP-10 format for the recipient address.
 *
 * Uses V1 for EVM-only transfers and V3 when Solana is involved.
 *
 * CAIP-10 format: <namespace>:<chain_id>:<account_address>
 * Example: eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
 *          solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:4yLyrKpdwhxFcBmjqkVXdqoH1NQFyTgufxP9LFjvKT1D
 */

import { formatUnits, parseUnits } from 'viem';
import {
  getQuote,
  executeQuote,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  checkAssetBalance,
  predictAddress,
  RoleBasedAccount,
  SolanaAccount,
  Account,
  QuoteResponseV1,
  QuoteResponseV3,
  QuoteRequestV1,
  QuoteRequestV3,
  readOrCacheEOAKey,
  loadSolanaKey,
  isSolanaInvolved,
  signOperation,
  ContractAccountType,
  signSolanaOperation,
  EOAKeyPair,
  ChainOperation,
  SolanaOperation,
} from '../helpers';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

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
 * Result of loading role-based accounts for a transfer operation
 */
interface LoadRoleBasedAccountsResult {
  accounts: Account[];
  evmAccount: RoleBasedAccount;
  solanaAccount: SolanaAccount | null;
  sessionKey: EOAKeyPair;
  adminKey: EOAKeyPair;
  solanaKeypair: Keypair | null;
}

/**
 * Load role-based accounts for transfer
 */
async function loadRoleBasedAccounts(
  assetId: string,
  sessionKeyName: string = 'session',
  adminKeyName: string = 'admin',
): Promise<LoadRoleBasedAccountsResult> {
  console.log('🔑 Loading role-based accounts...');

  // Load session and admin keys
  const sessionKey = readOrCacheEOAKey(sessionKeyName);
  const adminKey = readOrCacheEOAKey(adminKeyName);

  // Predict role-based account address
  const evmAccountAddress = await predictAddress(sessionKey.address, adminKey.address);

  console.log(`Session Address: ${sessionKey.address}`);
  console.log(`Admin Address: ${adminKey.address}`);
  console.log(`EVM Account: ${evmAccountAddress}`);

  const evmAccount: RoleBasedAccount = {
    type: 'role-based' as const,
    sessionAddress: sessionKey.address as `0x${string}`,
    adminAddress: adminKey.address as `0x${string}`,
    accountAddress: evmAccountAddress as `0x${string}`,
  };

  // Check if Solana is needed
  const needsSolana = assetId.startsWith('solana:') || assetId === 'ob:sol';
  let solanaAccount: SolanaAccount | null = null;
  let solanaKeypair = null;

  if (needsSolana) {
    const { keypair, publicKey } = loadSolanaKey();
    solanaKeypair = keypair;
    solanaAccount = {
      type: 'solana' as const,
      accountAddress: publicKey,
    };
    console.log(`Solana Account: ${publicKey}`);
  }

  const accounts: Account[] = [evmAccount];
  if (solanaAccount) {
    accounts.push(solanaAccount);
  }

  console.log(`✅ Loaded ${accounts.length} account(s): EVM${needsSolana ? ' + Solana' : ''}`);

  return {
    accounts,
    evmAccount,
    solanaAccount,
    sessionKey,
    adminKey,
    solanaKeypair,
  };
}

/**
 * Sign V1 operations (EVM only)
 */
async function signAllRoleBasedOperationsV1(
  quote: QuoteResponseV1,
  sessionKey: EOAKeyPair,
): Promise<QuoteResponseV1> {
  console.log('🔐 Signing role-based operations (V1)...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];
    const signedOperation = await signOperation(
      operation as ChainOperation,
      sessionKey.privateKey,
      ContractAccountType.RoleBased,
    );
    quote.originChainsOperations[i] = signedOperation;
  }

  console.log('✅ All operations signed (V1)');
  return quote;
}

/**
 * Sign V3 operations (EVM + Solana)
 */
async function signAllRoleBasedOperationsV3(
  quote: QuoteResponseV3,
  sessionKey: EOAKeyPair,
  solanaKeypair: Keypair | null,
  solanaAccount: SolanaAccount | null,
): Promise<QuoteResponseV3> {
  console.log('🔐 Signing role-based operations (V3)...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    if ('type' in operation && operation.type === 'solana' && solanaKeypair && solanaAccount) {
      const privateKeyString = bs58.encode(solanaKeypair.secretKey);
      const signedOperation = signSolanaOperation(
        solanaAccount.accountAddress,
        privateKeyString,
        operation as SolanaOperation,
      );
      quote.originChainsOperations[i] = signedOperation;
    } else if ('userOp' in operation && 'typedDataToSign' in operation) {
      const signedOperation = await signOperation(
        operation as ChainOperation,
        sessionKey.privateKey,
        ContractAccountType.RoleBased,
      );
      quote.originChainsOperations[i] = signedOperation;
    }
  }

  console.log('✅ All operations signed (V3)');
  return quote;
}

/**
 * Simple transfer function using role-based account
 * Uses V1 for EVM-only and V3 when Solana is involved
 */
async function simpleTransferRoleBased(transferParams: TransferParams) {
  try {
    console.log('🚀 Starting a transfer with role-based account...\n');
    console.log(`💸 Sending ${transferParams.assetId} to ${transferParams.recipientAccount}`);

    // Step 1: Load accounts
    const { accounts, evmAccount, solanaAccount, sessionKey, solanaKeypair } =
      await loadRoleBasedAccounts(transferParams.assetId, 'session2', 'admin2');

    // Determine if Solana is involved
    const needsSolana = isSolanaInvolved(transferParams.assetId, transferParams.assetId);

    // Step 2: Check balance
    const isSolanaAsset =
      transferParams.assetId.startsWith('solana:') || transferParams.assetId === 'ob:sol';
    const balanceCheckAddress =
      isSolanaAsset && solanaAccount ? solanaAccount.accountAddress : evmAccount.accountAddress;

    await checkAssetBalance(balanceCheckAddress, transferParams.assetId, transferParams.decimals);

    // Display transfer info
    const transferAmount = transferParams.decimals
      ? formatUnits(BigInt(transferParams.amount), transferParams.decimals)
      : transferParams.amount;

    if (needsSolana) {
      // Use V3 API when Solana is involved
      console.log('\n📋 Building transfer request (V3)...');

      const transferRequestV3: QuoteRequestV3 = {
        from: {
          accounts: accounts,
          asset: { assetId: transferParams.assetId },
          amount: transferParams.amount,
        },
        to: {
          asset: { assetId: transferParams.assetId },
          account: transferParams.recipientAccount,
        },
      };

      console.log('Transfer Request (V3):', JSON.stringify(transferRequestV3, null, 2));

      const quote = await getQuoteV3(transferRequestV3);

      console.log('✅ Quote received (V3):', {
        id: quote.id,
        sending: `${transferAmount} ${transferParams.assetId}`,
        to: transferParams.recipientAccount,
        willReceive: quote.destinationToken
          ? `${formatUnits(BigInt(quote.destinationToken.amount), transferParams.decimals || 18)}`
          : 'Unknown amount',
        fiatValue: quote.destinationToken ? `$${quote.destinationToken.fiatValue}` : 'Unknown',
      });

      const signedQuote = await signAllRoleBasedOperationsV3(
        quote,
        sessionKey,
        solanaKeypair,
        solanaAccount,
      );

      console.log('\n⚡ Ready to execute transfer (V3)...');
      const result = await executeQuoteV3(signedQuote);
      console.log('🎯 Transfer submitted successfully!');
      console.log('Execution success:', result.success);

      await monitorTransactionCompletion(quote);
      console.log('\n🎉 Transfer completed successfully!');

      return result;
    } else {
      // Use V1 API for EVM-only transfers
      console.log('\n📋 Building transfer request (V1)...');

      const transferRequestV1: QuoteRequestV1 = {
        from: {
          account: evmAccount,
          asset: { assetId: transferParams.assetId },
          amount: transferParams.amount,
        },
        to: {
          asset: { assetId: transferParams.assetId },
          account: transferParams.recipientAccount,
        },
      };

      console.log('Transfer Request (V1):', JSON.stringify(transferRequestV1, null, 2));

      const quote = await getQuote(transferRequestV1);

      console.log('✅ Quote received (V1):', {
        id: quote.id,
        sending: `${transferAmount} ${transferParams.assetId}`,
        to: transferParams.recipientAccount,
        willReceive: quote.destinationToken
          ? `${formatUnits(BigInt(quote.destinationToken.amount), transferParams.decimals || 18)}`
          : 'Unknown amount',
        fiatValue: quote.destinationToken ? `$${quote.destinationToken.fiatValue}` : 'Unknown',
      });

      const signedQuote = await signAllRoleBasedOperationsV1(quote, sessionKey);

      console.log('\n⚡ Ready to execute transfer (V1)...');
      const result = await executeQuote(signedQuote);
      console.log('🎯 Transfer submitted successfully!');
      console.log('Execution success:', result.success);

      await monitorTransactionCompletion(quote);
      console.log('\n🎉 Transfer completed successfully!');

      return result;
    }
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
    // await simpleTransferRoleBased({
    //   assetId: 'ob:usdc',
    //   amount: parseUnits('1', 6).toString(),
    //   recipientAccount: 'eip155:42161:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    //   decimals: 6,
    // });

    // Example 2: Transfer aggregated USDT to Avalanche address
    await simpleTransferRoleBased({
      assetId: 'ob:usdt',
      amount: parseUnits('1', 6).toString(),
      recipientAccount: 'eip155:43114:0xc457113e5ca31d44655958B0dccfd69C5368285B',
      decimals: 6,
    });

    // Example 3: Cross-chain transfer - aggregate USDC from any chain to Optimism
    // await simpleTransferRoleBased({
    //   assetId: 'ob:usdc',
    //   amount: parseUnits('1', 6).toString(),
    //   recipientAccount: 'eip155:10:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    //   decimals: 6,
    // });

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
