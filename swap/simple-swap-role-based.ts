/**
 * Simple Swap Example with Role-Based Account
 *
 * This implementation intelligently uses V1 and V3 endpoints based on the swap context:
 * - V1 API: For EVM-to-EVM swaps (single account, simpler structure)
 * - V3 API: When Solana is involved (multi-account support)
 *
 * This approach is optimal for production use with role-based accounts.
 *
 * Key differences from standard account version:
 * - Uses role-based account (dual-key: session + admin)
 * - Signs with EIP-712 typed data (signTypedData) instead of signMessage
 * - Requires both sessionAddress and adminAddress for account prediction
 */

import { formatUnits, parseUnits } from 'viem';
import {
  getQuote,
  executeQuote,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  checkAssetBalance,
  SwapParams,
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
 * Result of loading role-based accounts for a swap operation
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
 * Load and configure role-based accounts (EVM and Solana if needed) for swap operations
 *
 * @param swapParams - The swap parameters to determine which accounts are needed
 * @param sessionKeyName - Name of the session key to use (default: 'session')
 * @param adminKeyName - Name of the admin key to use (default: 'admin')
 * @returns Object containing all loaded accounts and keys
 */
async function loadRoleBasedAccounts(
  swapParams: SwapParams,
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

  // Check if Solana is needed and load if required
  const needsSolana = isSolanaInvolved(swapParams.fromAssetId, swapParams.toAssetId);
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
 * Signs all operations in a V1 quote for role-based accounts (EVM only)
 *
 * @param quote - The V1 quote containing operations to sign
 * @param sessionKey - Session key for signing EVM operations (role-based uses signTypedData)
 * @returns The quote with all operations signed
 */
async function signAllRoleBasedOperationsV1(
  quote: QuoteResponseV1,
  sessionKey: EOAKeyPair,
): Promise<QuoteResponseV1> {
  console.log('🔐 Signing role-based operations (V1)...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    // Sign EVM operation using role-based account (signTypedData)
    const signedOperation = await signOperation(
      operation as ChainOperation,
      sessionKey.privateKey,
      ContractAccountType.RoleBased,
    );
    quote.originChainsOperations[i] = signedOperation;
  }

  console.log('✅ All role-based operations signed successfully (V1)');
  return quote;
}

/**
 * Signs all operations in a V3 quote for role-based accounts (EVM and Solana)
 *
 * @param quote - The V3 quote containing operations to sign
 * @param sessionKey - Session key for signing EVM operations (role-based uses signTypedData)
 * @param solanaKeypair - Solana keypair for signing Solana operations
 * @param solanaAccount - Solana account information
 * @returns The quote with all operations signed
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
      // Sign Solana operation
      const privateKeyString = bs58.encode(solanaKeypair.secretKey);
      const signedOperation = signSolanaOperation(
        solanaAccount.accountAddress,
        privateKeyString,
        operation as SolanaOperation,
      );
      quote.originChainsOperations[i] = signedOperation;
    } else if ('userOp' in operation && 'typedDataToSign' in operation) {
      // Sign EVM operation using role-based account (signTypedData)
      const signedOperation = await signOperation(
        operation as ChainOperation,
        sessionKey.privateKey,
        ContractAccountType.RoleBased,
      );
      quote.originChainsOperations[i] = signedOperation;
    }
  }

  console.log('✅ All role-based operations signed successfully (V3)');
  return quote;
}

/**
 * Universal swap function using role-based account
 * Intelligently uses V1 for EVM-only swaps and V3 when Solana is involved
 */
async function simpleSwapRoleBased(swapParams: SwapParams) {
  try {
    console.log('🚀 Starting a swap with role-based account...\n');
    console.log(`💱 ${swapParams.fromAssetId} → ${swapParams.toAssetId}`);

    // Step 1: Load accounts (EVM + Solana if needed)
    const { accounts, evmAccount, solanaAccount, sessionKey, solanaKeypair } =
      await loadRoleBasedAccounts(swapParams, 'session2', 'admin2');

    // Determine if Solana is involved
    const needsSolana = isSolanaInvolved(swapParams.fromAssetId, swapParams.toAssetId);

    // Step 2: Check balance for the from asset
    const isSolanaAsset =
      swapParams.fromAssetId.startsWith('solana:') || swapParams.fromAssetId === 'ob:sol';
    const balanceCheckAddress =
      isSolanaAsset && solanaAccount ? solanaAccount.accountAddress : evmAccount.accountAddress;
    await checkAssetBalance(balanceCheckAddress, swapParams.fromAssetId, swapParams.decimals);

    // Display quote info helper
    const fromAmount = swapParams.decimals
      ? formatUnits(BigInt(swapParams.amount), swapParams.decimals)
      : swapParams.amount;

    if (needsSolana) {
      // Use V3 API when Solana is involved
      console.log('\n📋 Getting quote (V3 - Solana involved)...');

      const quoteRequestV3: QuoteRequestV3 = {
        from: {
          accounts: accounts,
          asset: { assetId: swapParams.fromAssetId },
          amount: swapParams.amount,
        },
        to: {
          asset: { assetId: swapParams.toAssetId },
        },
      };

      console.log('Quote Request (V3):', JSON.stringify(quoteRequestV3, null, 2));

      const quote = await getQuoteV3(quoteRequestV3);

      console.log('✅ Quote received (V3):', {
        id: quote.id,
        from: `${fromAmount} ${swapParams.fromAssetId}`,
        willReceive: quote.destinationToken
          ? `${formatUnits(BigInt(quote.destinationToken.amount), swapParams.decimals || 18)} ${swapParams.toAssetId}`
          : 'Unknown amount',
        fiatValue: quote.destinationToken
          ? `$${quote.destinationToken.fiatValue}`
          : 'Unknown value',
      });

      // Sign all operations (EVM with signTypedData + Solana)
      const signedQuote = await signAllRoleBasedOperationsV3(
        quote,
        sessionKey,
        solanaKeypair,
        solanaAccount,
      );

      // Execute V3
      console.log('\n⚡ Ready to execute swap (V3)...');
      const result = await executeQuoteV3(signedQuote);
      console.log('🎯 Swap submitted successfully!');
      console.log('Execution success:', result.success);

      await monitorTransactionCompletion(quote);
      console.log('\n🎉 Swap completed successfully!');

      return result;
    } else {
      // Use V1 API for EVM-only swaps
      console.log('\n📋 Getting quote (V1 - EVM only)...');

      const quoteRequestV1: QuoteRequestV1 = {
        from: {
          account: evmAccount,
          asset: { assetId: swapParams.fromAssetId },
          amount: swapParams.amount,
        },
        to: {
          asset: { assetId: swapParams.toAssetId },
        },
      };

      console.log('Quote Request (V1):', JSON.stringify(quoteRequestV1, null, 2));

      const quote = await getQuote(quoteRequestV1);

      console.log('✅ Quote received (V1):', {
        id: quote.id,
        from: `${fromAmount} ${swapParams.fromAssetId}`,
        willReceive: quote.destinationToken
          ? `${formatUnits(BigInt(quote.destinationToken.amount), 18)} ${swapParams.toAssetId}`
          : 'Unknown amount',
        fiatValue: quote.destinationToken
          ? `$${quote.destinationToken.fiatValue}`
          : 'Unknown value',
      });

      // Sign all operations (EVM only with signTypedData)
      const signedQuote = await signAllRoleBasedOperationsV1(quote, sessionKey);

      // Execute V1
      console.log('\n⚡ Ready to execute swap (V1)...');
      const result = await executeQuote(signedQuote);
      console.log('🎯 Swap submitted successfully!');
      console.log('Execution success:', result.success);

      await monitorTransactionCompletion(quote);
      console.log('\n🎉 Swap completed successfully!');

      return result;
    }
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
    // await simpleSwapRoleBased({
    //     fromAssetId: 'ob:usdc',
    //     toAssetId: 'ob:sol',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 2: Swap from aggregated USDT to Solana USDC
    // await simpleSwapRoleBased({
    //     fromAssetId: 'ob:usdt',
    //     toAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 3: Swap from USDC on Arbitrum to AAVE on Base
    // await simpleSwapRoleBased({
    //     fromAssetId: 'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 4: Swap from USDC on Optimism to AAVE on Base
    // await simpleSwapRoleBased({
    //     fromAssetId: 'eip155:10/erc20:0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    //     toAssetId: 'eip155:8453/erc20:0x63706e401c06ac8513145b7687A14804d17f814b',
    //     amount: parseUnits('0.5', 6).toString(),
    //     decimals: 6
    // });

    // Example 5: Swap from AERO on Base to aggregated USDC
    // await simpleSwapRoleBased({
    //     fromAssetId: 'eip155:8453/erc20:0x940181a94a35a4569e4529a3cdfb74e38fd98631',
    //     toAssetId: 'ob:usdc',
    //     amount: parseUnits('1.5', 18).toString(),
    //     decimals: 18
    // });

    // Example 6: Swap from aggregated USDC to SOL on Solana
    await simpleSwapRoleBased({
      fromAssetId: 'ob:usdt',
      toAssetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
      amount: parseUnits('0.5', 6).toString(),
      decimals: 6,
    });
  } catch (error) {
    console.error('Operation failed:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main();
}

export {
  simpleSwapRoleBased,
  loadRoleBasedAccounts,
  signAllRoleBasedOperationsV1,
  signAllRoleBasedOperationsV3,
};
