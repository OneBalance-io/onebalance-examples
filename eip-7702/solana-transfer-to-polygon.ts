import { parseUnits } from 'viem';
import {
  readOrCacheEOAKey,
  loadSolanaKey,
  getQuoteV3,
  executeQuoteV3,
  monitorTransactionCompletion,
  signAllOperations,
  checkAssetBalance,
  displayTransferQuote,
  type EIP7702Account,
  type SolanaAccount,
  type QuoteRequestV3,
  type Hex,
  ContractAccountType,
} from '../helpers';

// Asset IDs
const USDC_SOLANA_ASSET_ID =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_POLYGON_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'; // Official Polygon USDC
const USDC_POLYGON_ASSET_ID = `eip155:137/erc20:${USDC_POLYGON_ADDRESS}`;

// Use aggregated USDC for easier cross-chain operations
const USDC_AGGREGATED = 'ob:usdc';

/**
 * Transfer USDC from Solana to Polygon using EIP-7702 account
 *
 * This demonstrates cross-chain transfer where:
 * - Source: User's Solana account
 * - Destination: User's Polygon account (EIP-7702 EOA)
 */
async function transferSolanaToPolygon(
  solanaAccount: SolanaAccount,
  eip7702Account: EIP7702Account,
  amount: number,
) {
  console.log('\n🚀 Starting Solana → Polygon USDC Transfer...');
  console.log(`   From: Solana (${solanaAccount.accountAddress}...)`);
  console.log(`   To: Polygon (${eip7702Account.accountAddress})`);
  console.log(`   Amount: ${amount} USDC\n`);

  // Step 1: Check balance
  const balance = await checkAssetBalance(
    solanaAccount.accountAddress,
    USDC_AGGREGATED,
    6, // USDC has 6 decimals
  );

  if (balance < amount) {
    throw new Error(`Insufficient balance. Need ${amount} USDC, have ${balance} USDC`);
  }

  // Step 2: Get quote for Solana → Polygon
  console.log('📋 Getting quote for Solana → Polygon transfer...');

  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [
        solanaAccount,
        eip7702Account, // Include EIP-7702 account for routing
      ],
      asset: {
        assetId: USDC_SOLANA_ASSET_ID, // Specify exact Solana USDC
      },
      amount: parseUnits(amount.toString(), 6).toString(), // USDC has 6 decimals
    },
    to: {
      asset: {
        assetId: USDC_POLYGON_ASSET_ID, // Specify exact Polygon USDC
      },
      account: `eip155:137:${eip7702Account.accountAddress}`, // CAIP-10 format for Polygon
    },
  };

  console.log(JSON.stringify(quoteRequest, null, 2));

  const quote = await getQuoteV3(quoteRequest);

  displayTransferQuote({
    quote,
    assetId: USDC_SOLANA_ASSET_ID,
    amount: parseUnits(amount.toString(), 6).toString(),
    decimals: 6,
    recipientAccount: `eip155:137:${eip7702Account.accountAddress}`,
  });

  return quote;
}

/**
 * Transfer USDC from Polygon to Solana using EIP-7702 account
 *
 * This demonstrates cross-chain transfer where:
 * - Source: User's Polygon account (EIP-7702 EOA)
 * - Destination: User's Solana account
 */
async function transferPolygonToSolana(
  eip7702Account: EIP7702Account,
  solanaAccount: SolanaAccount,
  amount: number,
) {
  console.log('\n🚀 Starting Polygon → Solana USDC Transfer...');
  console.log(`   From: Polygon (${eip7702Account.accountAddress})`);
  console.log(`   To: Solana (${solanaAccount.accountAddress}...)`);
  console.log(`   Amount: ${amount} USDC\n`);

  // Step 1: Check balance
  const balance = await checkAssetBalance(
    eip7702Account.accountAddress,
    USDC_AGGREGATED,
    6, // USDC has 6 decimals
  );

  if (balance < amount) {
    throw new Error(`Insufficient balance. Need ${amount} USDC, have ${balance} USDC`);
  }

  // Step 2: Get quote for Polygon → Solana
  console.log('📋 Getting quote for Polygon → Solana transfer...');

  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [
        eip7702Account,
        solanaAccount, // Include Solana account for routing
      ],
      asset: {
        assetId: USDC_POLYGON_ASSET_ID, // Specify exact Polygon USDC
      },
      amount: parseUnits(amount.toString(), 6).toString(), // USDC has 6 decimals
    },
    to: {
      asset: {
        assetId: USDC_SOLANA_ASSET_ID, // Specify exact Solana USDC
      },
      account: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${solanaAccount.accountAddress}`, // CAIP-10 format
    },
  };

  const quote = await getQuoteV3(quoteRequest);

  displayTransferQuote({
    quote,
    assetId: USDC_POLYGON_ASSET_ID,
    amount: parseUnits(amount.toString(), 6).toString(),
    decimals: 6,
    recipientAccount: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${solanaAccount.accountAddress}`,
  });

  return quote;
}

/**
 * Complete example: Transfer USDC from Solana to Polygon
 * Handles quote generation, signing, execution, and monitoring
 */
async function exampleSolanaToPolygon(
  solanaAccount: SolanaAccount,
  eip7702Account: EIP7702Account,
  signerKey: any,
  keypair: any,
  amount: number,
) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('Example 1: Transfer USDC from Solana to Polygon');
  console.log('═══════════════════════════════════════════════════════');

  // Get quote
  const quote = await transferSolanaToPolygon(solanaAccount, eip7702Account, amount);

  // Sign all operations (both Solana and EVM)
  console.log('\n🔐 Signing operations...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    keypair,
    solanaAccount,
    ContractAccountType.KernelV33,
  );

  // Execute transfer
  console.log('⚡ Executing transfer...');
  const result = await executeQuoteV3(signedQuote);
  console.log('✅ Transfer initiated:', result.success);

  // Monitor completion
  await monitorTransactionCompletion(quote);
  console.log('🎉 Transfer completed successfully!\n');
}

/**
 * Complete example: Transfer USDC from Polygon to Solana
 * Handles quote generation, signing, execution, and monitoring
 */
async function examplePolygonToSolana(
  eip7702Account: EIP7702Account,
  solanaAccount: SolanaAccount,
  signerKey: any,
  keypair: any,
  amount: number,
) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('Example 2: Transfer USDC from Polygon to Solana');
  console.log('═══════════════════════════════════════════════════════');

  // Get quote
  const quote = await transferPolygonToSolana(eip7702Account, solanaAccount, amount);

  // Sign all operations (both EVM and Solana)
  console.log('\n🔐 Signing operations...');
  const signedQuote = await signAllOperations(
    quote,
    signerKey,
    keypair,
    solanaAccount,
    ContractAccountType.KernelV33,
  );

  // Execute transfer
  console.log('⚡ Executing transfer...');
  const result = await executeQuoteV3(signedQuote);
  console.log('✅ Transfer initiated:', result.success);

  // Monitor completion
  await monitorTransactionCompletion(quote);
  console.log('🎉 Transfer completed successfully!\n');
}

/**
 * Main example demonstrating bidirectional transfers
 */
async function main() {
  console.log('🔐 Setting up accounts...\n');

  // Load EIP-7702 account (EOA that can delegate to smart contract)
  const signerKey = readOrCacheEOAKey('session2');
  const eip7702Account: EIP7702Account = {
    type: 'kernel-v3.3-ecdsa',
    deploymentType: 'EIP7702',
    accountAddress: signerKey.address.toLowerCase() as Hex,
    signerAddress: signerKey.address.toLowerCase() as Hex,
  };

  // Load Solana account
  const { keypair, publicKey } = loadSolanaKey();
  const solanaAccount: SolanaAccount = {
    type: 'solana',
    accountAddress: publicKey,
  };

  console.log('✅ Accounts loaded:');
  console.log(`   EIP-7702 Account: ${eip7702Account.accountAddress}`);
  console.log(`   Solana Account: ${solanaAccount.accountAddress}\n`);

  try {
    // Example 1: Solana → Polygon
    await exampleSolanaToPolygon(solanaAccount, eip7702Account, signerKey, keypair, 0.4);

    // Example 2: Polygon → Solana
    await examplePolygonToSolana(eip7702Account, solanaAccount, signerKey, keypair, 0.3);

    console.log('✨ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Gracefully shutting down...');
  process.exit(0);
});

// Run the example if this file is executed directly
if (require.main === module) {
  main();
}
