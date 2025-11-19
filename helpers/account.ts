import { readOrCacheEOAKey, loadSolanaKey } from './crypto';
import { predictStandardAddress } from './onebalance';
import { isSolanaInvolved } from './solana';
import {
  Account,
  StandardAccount,
  EIP7702Account,
  SolanaAccount,
  EOAKeyPair,
  SwapParams,
  Hex,
} from './types';
import { Keypair } from '@solana/web3.js';

/**
 * Account management utilities for OneBalance operations
 */

export type EvmAccountType = 'standard' | 'eip7702';

/**
 * Result of loading accounts for a swap operation
 */
export interface LoadAccountsResult {
  accounts: Account[];
  evmAccount: StandardAccount | EIP7702Account;
  solanaAccount: SolanaAccount | null;
  signerKey: EOAKeyPair;
  solanaKeypair: Keypair | null;
}

export interface LoadMultiChainAccountsResult {
  accounts: Account[];
  evmAccount: StandardAccount | null;
  solanaAccount: SolanaAccount | null;
  signerKey: EOAKeyPair | null;
  solanaKeypair: Keypair | null;
}

/**
 * Load and configure accounts (EVM and Solana if needed) for swap operations
 *
 * @param swapParams - The swap parameters to determine which accounts are needed
 * @param sessionKeyName - Name of the session key to use (default: 'session')
 * @param accountType - Type of EVM account to use: 'standard' or 'eip7702' (default: 'standard')
 * @returns Object containing all loaded accounts and keys
 */
export async function loadAccounts(
  swapParams: SwapParams,
  sessionKeyName: string = 'session',
  accountType: EvmAccountType = 'standard',
): Promise<LoadAccountsResult> {
  console.log('🔑 Loading accounts...');

  // Load EVM signer key
  const signerKey = readOrCacheEOAKey(sessionKeyName);
  console.log(`EVM Signer: ${signerKey.address}`);

  let evmAccount: StandardAccount | EIP7702Account;

  if (accountType === 'eip7702') {
    // EIP-7702: EOA is the account address
    const accountAddress = signerKey.address.toLowerCase() as Hex;
    console.log(`EIP-7702 Account: ${accountAddress}`);

    evmAccount = {
      type: 'kernel-v3.3-ecdsa' as const,
      deploymentType: 'EIP7702' as const,
      accountAddress,
      signerAddress: accountAddress,
    };
  } else {
    // Standard account: predict smart account address
    const evmAccountAddress = await predictStandardAddress('kernel-v3.1-ecdsa', signerKey.address);
    console.log(`Standard Account: ${evmAccountAddress}`);

    evmAccount = {
      type: 'kernel-v3.1-ecdsa' as const,
      signerAddress: signerKey.address as Hex,
      accountAddress: evmAccountAddress as Hex,
    };
  }

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

  const accountTypeLabel = accountType === 'eip7702' ? 'EIP-7702' : 'Standard';
  console.log(
    `✅ Loaded ${accounts.length} account(s): ${accountTypeLabel}${needsSolana ? ' + Solana' : ''}`,
  );

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

  let evmAccount: StandardAccount | null = null;
  let signerKey = null;

  if (needsEvm) {
    signerKey = readOrCacheEOAKey(sessionKeyName);
    const evmAccountAddress = await predictStandardAddress('kernel-v3.1-ecdsa', signerKey.address);

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
 * @param evmAccount - The EVM account (standard or EIP-7702)
 * @param solanaAccount - The Solana account (optional)
 * @returns The account address to use for balance checking
 */
export function getBalanceCheckAddress(
  assetId: string,
  evmAccount: StandardAccount | EIP7702Account,
  solanaAccount: SolanaAccount | null,
): string {
  const isSolanaAsset = assetId.startsWith('solana:') || assetId === 'ob:sol';

  if (isSolanaAsset && solanaAccount) {
    return solanaAccount.accountAddress;
  }

  return evmAccount.accountAddress;
}
