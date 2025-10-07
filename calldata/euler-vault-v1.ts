import { encodeFunctionData } from 'viem';
import {
  readOrCacheEOAKey,
  predictBasicAddress,
  prepareCallQuote,
  fetchCallQuote,
  executeQuote,
  signOperation,
  checkAssetBalance,
  monitorTransactionCompletion,
} from '../helpers';
import {
  Hex,
  BasicAccount,
  PrepareCallRequest,
  CallRequest,
  ContractAccountType,
  EOAKeyPair,
  TargetCallQuote,
  Quote,
  EvmAccount,
} from '../helpers/types';
import eulerVaultAbi from '../abi/euler/eVaultImplementation.json';

/**
 * Euler Vault Deposit/Withdraw Example using V1 endpoints
 *
 * This example demonstrates both depositing and withdrawing from an Euler V2 vault:
 * - DEPOSIT: Deposit AERO tokens → Receive eAERO-1 vault tokens
 * - WITHDRAW: Redeem eAERO-1 vault tokens → Get back AERO tokens
 *
 * In Euler V2, vault shares are represented as ERC-20 tokens. When you deposit
 * assets (e.g., AERO), you receive vault tokens (e.g., eAERO-1) in return. To withdraw,
 * you call the redeem function on the vault token contract, which burns the vault tokens
 * and returns the underlying assets.
 *
 * Key points:
 * - Uses V1 calldata endpoints (/api/quotes/prepare-call-quote)
 * - V1 requires chain-specific tokens (CAIP-19 format), NOT aggregated assets
 * - Same-chain operations on Base network (requires AERO on Base)
 * - The vault token contract (eAERO-1) is both the ERC-20 token AND the vault
 * - Uses EIP-1967 Beacon Proxy pattern
 * - Switch between deposit/withdraw by changing the OPERATION constant
 */

// Configuration
const CHAIN = 'eip155:8453'; // Base
const VAULT_TOKEN_ADDRESS = '0x5Fe2DE3E565a6a501a4Ec44AAB8664b1D674ac25'; // eAERO-1 vault token (proxy) on Base
const VAULT_IMPLEMENTATION = '0x30a9A9654804F1e5b3291a86E83EdeD7cF281618'; // Implementation contract (EIP-1967 Beacon Proxy)
const AERO_TOKEN_ADDRESS = '0x940181a94A35A4569E4529A3CDfB74e38FD98631'; // AERO token on Base

// Operation to perform: 'deposit' or 'withdraw'
const OPERATION: 'deposit' | 'withdraw' = 'withdraw';

// Amounts
const DEPOSIT_AMOUNT = '500000000000000000'; // 0.5 AERO (18 decimals)
const WITHDRAW_AMOUNT = '250000000000000000'; // 0.25 eAERO-1 (18 decimals)

// The eAERO-1 contract uses EIP-1967 Beacon Proxy pattern
// Proxy: 0x5Fe2DE3E565a6a501a4Ec44AAB8664b1D674ac25
// Implementation: 0x30a9A9654804F1e5b3291a86E83EdeD7cF281618

/**
 * Step 1: Load signer key and create account
 */
async function loadAccount(): Promise<{ signerKey: EOAKeyPair; account: EvmAccount }> {
  console.log('📋 Step 1: Loading account...');

  const signerKey = readOrCacheEOAKey('session2');
  const accountAddress = await predictBasicAddress('kernel-v3.1-ecdsa', signerKey.address);

  console.log(`Signer Address: ${signerKey.address}`);
  console.log(`Account Address: ${accountAddress}\n`);

  const account: EvmAccount = {
    type: 'kernel-v3.1-ecdsa' as any, // V1 uses different account structure
    signerAddress: signerKey.address as Hex,
    accountAddress: accountAddress as Hex,
  } as EvmAccount;

  return { signerKey, account };
}

/**
 * Step 2: Verify account has required tokens for the operation
 */
async function verifyTokenBalance(
  accountAddress: string,
  operation: 'deposit' | 'withdraw',
): Promise<void> {
  console.log('📋 Step 2: Checking token balance...');

  if (operation === 'deposit') {
    // Check AERO balance on Base for deposit
    const aeroOnBase = `${CHAIN}/erc20:${AERO_TOKEN_ADDRESS.toLowerCase()}`;
    try {
      const balance = await checkAssetBalance(accountAddress, aeroOnBase, 18);

      if (balance === 0) {
        console.log('⚠️ No AERO tokens found on Base. Please fund your account with AERO on Base.');
      } else {
        console.log(`✅ AERO token balance on Base: ${balance}`);
      }
    } catch (error) {
      console.log('⚠️ Could not check AERO balance on Base');
      console.log('Proceeding with example...');
    }
  } else {
    // Check eAERO-1 balance for withdrawal
    const vaultTokenId = `${CHAIN}/erc20:${VAULT_TOKEN_ADDRESS.toLowerCase()}`;

    try {
      const balance = await checkAssetBalance(accountAddress, vaultTokenId, 18);

      if (balance === 0) {
        console.log('⚠️ No eAERO-1 tokens found. Please deposit AERO first to get vault tokens.');
      } else {
        console.log(`✅ eAERO-1 vault token balance: ${balance}`);
      }
    } catch (error) {
      console.log('⚠️ Could not check eAERO-1 balance');
      console.log('Proceeding with example...');
    }
  }

  console.log();
}

/**
 * Step 3a: Encode the deposit function call
 *
 * eAERO-1 vault token deposit function:
 * - Function: deposit(uint256 assets, address receiver)
 * - Selector: 0x6e553f65
 * - Returns: uint256 shares (amount of vault tokens minted)
 *
 * This function deposits AERO tokens and mints eAERO-1 vault tokens to the receiver.
 */
function prepareDepositCalldata(assets: string, receiver: string): Hex {
  console.log('📋 Step 3: Preparing deposit calldata...');

  const depositData = encodeFunctionData({
    abi: eulerVaultAbi,
    functionName: 'deposit',
    args: [BigInt(assets), receiver as Hex],
  });

  console.log('✅ Deposit calldata encoded');
  console.log(`  - Function: deposit(${assets}, ${receiver})`);
  console.log(`  - Selector: ${depositData.slice(0, 10)} (0x6e553f65)`);
  console.log(`  - Full data: ${depositData.slice(0, 20)}...\n`);

  return depositData;
}

/**
 * Step 3b: Encode the redeem function call
 *
 * eAERO-1 vault token redeem function:
 * - Function: redeem(uint256 amount, address receiver, address owner)
 * - Selector: 0xba087652
 * - Returns: uint256 assets (amount of underlying AERO tokens transferred)
 *
 * This function burns the vault tokens (shares) and returns the underlying AERO tokens to the receiver.
 */
function prepareRedeemCalldata(shares: string, receiver: string, owner: string): Hex {
  console.log('📋 Step 3: Preparing redeem calldata...');

  const redeemData = encodeFunctionData({
    abi: eulerVaultAbi,
    functionName: 'redeem',
    args: [BigInt(shares), receiver as Hex, owner as Hex],
  });

  console.log('✅ Redeem calldata encoded');
  console.log(`  - Function: redeem(${shares}, ${receiver}, ${owner})`);
  console.log(`  - Selector: ${redeemData.slice(0, 10)} (0xba087652)`);
  console.log(`  - Full data: ${redeemData.slice(0, 20)}...\n`);

  return redeemData;
}

/**
 * Step 4: Prepare the call quote using V1 endpoint
 *
 * This prepares a same-chain vault operation (deposit or withdraw).
 */
async function preparePrepareCallQuote(
  account: EvmAccount,
  calldata: Hex,
  operation: 'deposit' | 'withdraw',
): Promise<TargetCallQuote> {
  console.log('📋 Step 4: Preparing call quote (V1)...');

  let prepareRequest: PrepareCallRequest;

  if (operation === 'deposit') {
    // For deposit: need AERO tokens on Base chain (V1 doesn't support aggregated assets)
    prepareRequest = {
      account,
      targetChain: CHAIN,
      calls: [
        {
          to: VAULT_TOKEN_ADDRESS as Hex,
          data: calldata,
          value: '0x0',
        },
      ],
      tokensRequired: [
        {
          assetType: `${CHAIN}/erc20:${AERO_TOKEN_ADDRESS.toLowerCase()}`, // V1 requires CAIP-19 format
          amount: DEPOSIT_AMOUNT,
        },
      ],
      // Allowance for vault to spend AERO on Base chain
      allowanceRequirements: [
        {
          assetType: `${CHAIN}/erc20:${AERO_TOKEN_ADDRESS.toLowerCase()}`,
          amount: DEPOSIT_AMOUNT,
          spender: VAULT_TOKEN_ADDRESS as Hex,
        },
      ],
    };
  } else {
    // For withdraw: need eAERO-1 vault tokens
    prepareRequest = {
      account,
      targetChain: CHAIN,
      calls: [
        {
          to: VAULT_TOKEN_ADDRESS as Hex,
          data: calldata,
          value: '0x0',
        },
      ],
      tokensRequired: [
        {
          // Workaround for vault tokens without third-party services pricing:
          // Set native token with amount 0 to bypass backend fiat price checks.
          // For same-chain withdrawals, the actual vault token doesn't need to be in tokensRequired.
          assetType: `${CHAIN}/slip44:60`,
          amount: '0',

          // DON'T USE THIS - IT WILL FAIL
          // assetType: `${CHAIN}/erc20:${VAULT_TOKEN_ADDRESS.toLowerCase()}`,
          // amount: WITHDRAW_AMOUNT,
        },
      ],
      // Allowance for vault to burn eAERO-1 tokens
      allowanceRequirements: [
        {
          assetType: `${CHAIN}/erc20:${VAULT_TOKEN_ADDRESS.toLowerCase()}`,
          amount: WITHDRAW_AMOUNT,
          spender: VAULT_TOKEN_ADDRESS as Hex,
        },
      ],
    };
  }

  console.log('Request payload:');
  console.log(JSON.stringify(prepareRequest, null, 2));
  console.log();

  const preparedQuote = await prepareCallQuote(prepareRequest);

  console.log('✅ Prepared quote received');
  console.log(`  - Tamper Proof Signature: ${preparedQuote.tamperProofSignature.slice(0, 20)}...`);
  console.log();

  return preparedQuote;
}

/**
 * Step 5-6: Sign the chain operation and get the final call quote
 */
async function getSignedCallQuote(
  account: EvmAccount,
  preparedQuote: TargetCallQuote,
  signerKey: EOAKeyPair,
): Promise<Quote> {
  console.log('📋 Step 5: Signing chain operation...');

  const signedChainOp = await signOperation(
    preparedQuote.chainOperation,
    signerKey.privateKey,
    ContractAccountType.KernelV31,
  );

  console.log('✅ Chain operation signed\n');

  // ========================================================================
  // WORKAROUND ATTEMPT for SUP-200 (COMMENTED OUT - DOESN'T WORK)
  // ========================================================================
  // We tried patching fiatValue locally and sending it to the backend, but:
  // 1. The backend IGNORES client-provided sourceAssetBalances
  // 2. The backend INDEPENDENTLY fetches relay pricing (even for same-chain ops)
  // 3. No client-side workaround can fix this - backend must be changed
  //
  // const preparedQuoteWithBalances = preparedQuote as TargetCallQuote & {
  //   sourceAssetBalances?: Array<{
  //     assetType: string;
  //     balance: string;
  //     decimals: number;
  //     fiatValue: number;
  //   }>;
  // };
  //
  // if (preparedQuoteWithBalances.sourceAssetBalances) {
  //   const zeroFiatAsset = preparedQuoteWithBalances.sourceAssetBalances.find(
  //     (asset) => asset.fiatValue === 0 || asset.fiatValue === null,
  //   );
  //
  //   if (zeroFiatAsset) {
  //     const fallbackPrice = 1.09;
  //     const balance = Number(zeroFiatAsset.balance) / Math.pow(10, zeroFiatAsset.decimals);
  //     zeroFiatAsset.fiatValue = balance * fallbackPrice;
  //   }
  // }
  // ========================================================================

  console.log('📋 Step 6: Getting call quote...');

  const callRequest: CallRequest = {
    account,
    chainOperation: signedChainOp,
    tamperProofSignature: preparedQuote.tamperProofSignature,
  };

  const quote = await fetchCallQuote(callRequest);

  console.log('✅ Call quote received:');
  console.log(`  - Quote ID: ${quote.id}`);
  console.log(`  - Origin operations: ${quote.originChainsOperations.length}`);
  console.log(
    `  - Expiration: ${new Date(Number(quote.expirationTimestamp) * 1000).toISOString()}`,
  );
  console.log();

  return quote;
}

/**
 * Step 7: Sign all origin chain operations
 */
async function signOriginOperations(quote: Quote, signerKey: EOAKeyPair): Promise<void> {
  console.log('📋 Step 7: Signing origin chain operations...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    if ('userOp' in operation && 'typedDataToSign' in operation) {
      const signedOp = await signOperation(
        operation,
        signerKey.privateKey,
        ContractAccountType.KernelV31,
      );
      quote.originChainsOperations[i] = signedOp;
    }
  }

  console.log('✅ All operations signed\n');
}

/**
 * Step 8-9: Execute the quote and monitor completion
 */
async function executeAndMonitor(quote: Quote, operation: 'deposit' | 'withdraw'): Promise<void> {
  console.log('📋 Step 8: Executing quote...');

  const result = await executeQuote(quote as any);

  if (!result.success) {
    throw new Error(result.error || 'Quote execution failed');
  }

  console.log('✅ Quote executed successfully!\n');

  console.log('📋 Step 9: Monitoring transaction...');
  await monitorTransactionCompletion(quote as any, 60_000, 2_000);

  console.log(
    `\n🎉 Vault ${operation === 'deposit' ? 'deposit' : 'withdrawal'} completed successfully!`,
  );
}

/**
 * Main function - orchestrates the entire vault withdrawal flow
 */
async function main() {
  console.log('🚀 Starting V1 Euler Vault Flow...\n');

  if (OPERATION === 'deposit') {
    console.log('📝 Operation: DEPOSIT AERO → Get eAERO-1 vault tokens');
  } else {
    console.log('📝 Operation: WITHDRAW eAERO-1 → Get back AERO tokens');
  }

  console.log('   Using V1 calldata endpoints on Base network\n');
  console.log('Token Details:');
  console.log('   - AERO on Base: 0x940181a94A35A4569E4529A3CDfB74e38FD98631');
  console.log('   - Vault Token (eAERO-1): 0x5Fe2DE3E565a6a501a4Ec44AAB8664b1D674ac25');
  console.log('   - Implementation: 0x30a9A9654804F1e5b3291a86E83EdeD7cF281618');
  console.log('   - Proxy Pattern: EIP-1967 Beacon Proxy');
  console.log('   ⚠️  Note: V1 requires AERO tokens on Base chain (no cross-chain routing)\n');

  if (OPERATION === 'deposit') {
    console.log('   - Function: deposit() [0x6e553f65]');
    console.log(`   - Depositing: ${DEPOSIT_AMOUNT} wei AERO (~0.5 AERO)`);
    console.log('   - Requires AERO on Base chain\n');
  } else {
    console.log('   - Function: redeem() [0xba087652]');
    console.log(`   - Withdrawing: ${WITHDRAW_AMOUNT} wei eAERO-1 (~0.25 eAERO-1)\n`);
  }

  try {
    // Load account and signer key
    const { signerKey, account } = await loadAccount();

    // Verify token balance
    await verifyTokenBalance(account.accountAddress, OPERATION);

    let calldata: Hex;

    if (OPERATION === 'deposit') {
      // Prepare deposit calldata
      calldata = prepareDepositCalldata(
        DEPOSIT_AMOUNT,
        account.accountAddress, // receiver
      );
    } else {
      // Prepare redeem calldata
      calldata = prepareRedeemCalldata(
        WITHDRAW_AMOUNT,
        account.accountAddress, // receiver
        account.accountAddress, // owner
      );
    }

    console.log('Calldata:', JSON.stringify(calldata, null, 2));

    // Prepare call quote (V1)
    const preparedQuote = await preparePrepareCallQuote(account, calldata, OPERATION);

    console.log('Prepared Quote:', JSON.stringify(preparedQuote, null, 2));

    // Get signed call quote
    const quote = await getSignedCallQuote(account, preparedQuote, signerKey);

    console.log('Signed Call Quote:', JSON.stringify(quote, null, 2));

    // Sign all origin operations
    await signOriginOperations(quote, signerKey);

    // Execute and monitor
    await executeAndMonitor(quote, OPERATION);
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
