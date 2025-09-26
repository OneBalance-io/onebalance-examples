import { readOrCacheEOAKey, loadSolanaKey } from './crypto';
import { predictBasicAddress } from './onebalance';
import { isSolanaInvolved } from './solana';
import { Account, BasicAccount, SolanaAccount, EOAKeyPair, SwapParams } from './types';
import { Keypair } from '@solana/web3.js';

/**
 * Account management utilities for OneBalance operations
 */

/**
 * Result of loading accounts for a swap operation
 */
export interface LoadAccountsResult {
  accounts: Account[];
  evmAccount: BasicAccount;
  solanaAccount: SolanaAccount | null;
  signerKey: EOAKeyPair;
  solanaKeypair: Keypair | null;
}

export interface LoadMultiChainAccountsResult {
  accounts: Account[];
  evmAccount: BasicAccount | null;
  solanaAccount: SolanaAccount | null;
  signerKey: EOAKeyPair | null;
  solanaKeypair: Keypair | null;
}

/**
 * Load and configure accounts (EVM and Solana if needed) for swap operations
 *
 * @param swapParams - The swap parameters to determine which accounts are needed
 * @param sessionKeyName - Name of the session key to use (default: 'session')
 * @returns Object containing all loaded accounts and keys
 */
export async function loadAccounts(
  swapParams: SwapParams,
  sessionKeyName: string = 'session',
): Promise<LoadAccountsResult> {
  console.log('🔑 Loading accounts...');

  // Load EVM signer key and predict account address
  const signerKey = readOrCacheEOAKey(sessionKeyName);
  const evmAccountAddress = await predictBasicAddress('kernel-v3.1-ecdsa', signerKey.address);

  console.log(`EVM Signer: ${signerKey.address}`);
  console.log(`EVM Account: ${evmAccountAddress}`);

  const evmAccount: BasicAccount = {
    type: 'kernel-v3.1-ecdsa' as const,
    signerAddress: signerKey.address as `0x${string}`,
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
    signerKey,
    solanaKeypair,
  };
}

/**
 * Load accounts for multi-chain operations with explicit account types
 *
 * @param options - Configuration options for account loading
 * @returns Object containing all loaded accounts and keys
 */
export async function loadMultiChainAccounts(options: {
  needsEvm?: boolean;
  needsSolana?: boolean;
  sessionKeyName?: string;
}): Promise<LoadMultiChainAccountsResult> {
  const { needsEvm = true, needsSolana = false, sessionKeyName = 'session' } = options;

  console.log('🔑 Loading multi-chain accounts...');

  let evmAccount: BasicAccount | null = null;
  let signerKey = null;

  if (needsEvm) {
    signerKey = readOrCacheEOAKey(sessionKeyName);
    const evmAccountAddress = await predictBasicAddress('kernel-v3.1-ecdsa', signerKey.address);

    console.log(`EVM Signer: ${signerKey.address}`);
    console.log(`EVM Account: ${evmAccountAddress}`);

    evmAccount = {
      type: 'kernel-v3.1-ecdsa' as const,
      signerAddress: signerKey.address as `0x${string}`,
      accountAddress: evmAccountAddress as `0x${string}`,
    };
  }

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

  const accounts: Account[] = [];
  if (evmAccount) accounts.push(evmAccount);
  if (solanaAccount) accounts.push(solanaAccount);

  const accountTypes = [];
  if (needsEvm) accountTypes.push('EVM');
  if (needsSolana) accountTypes.push('Solana');

  console.log(`✅ Loaded ${accounts.length} account(s): ${accountTypes.join(' + ')}`);

  return {
    accounts,
    evmAccount,
    solanaAccount,
    signerKey,
    solanaKeypair,
  };
}

/**
 * Get the appropriate account address for balance checking based on asset type
 *
 * @param assetId - The asset ID to check
 * @param evmAccount - The EVM account
 * @param solanaAccount - The Solana account (optional)
 * @returns The account address to use for balance checking
 */
export function getBalanceCheckAddress(
  assetId: string,
  evmAccount: BasicAccount,
  solanaAccount: SolanaAccount | null,
): string {
  const isSolanaAsset = assetId.startsWith('solana:') || assetId === 'ob:sol';

  if (isSolanaAsset && solanaAccount) {
    return solanaAccount.accountAddress;
  }

  return evmAccount.accountAddress;
}
