import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { Keypair, PublicKey, MessageV0, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { privateKeyToAccount } from 'viem/accounts';

// OneBalance configuration
const BASE_URL = 'https://be.onebalance.io';
const PUBLIC_API_KEY = '42bb629272001ee1163ca0dbbbc07bcbb0ef57a57baf16c4b1d4672db4562c11';

// Helper function to create authenticated headers
function createAuthHeaders(): Record<string, string> {
  return {
    'x-api-key': PUBLIC_API_KEY,
    'Content-Type': 'application/json',
  };
}

// Generic API request function
async function apiRequest<RequestData, ResponseData>(
  method: 'get' | 'post',
  endpoint: string,
  data?: RequestData,
  isParams = false,
): Promise<ResponseData> {
  try {
    const config = {
      headers: createAuthHeaders(),
      ...(isParams && data ? { params: data } : {}),
    };

    const url = `${BASE_URL}${endpoint}`;

    const response: AxiosResponse<ResponseData> =
      method === 'post' 
        ? await axios.post(url, data, config) 
        : await axios.get(url, { ...config, ...(isParams && data ? { params: data } : {}) });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Load EVM keys
function loadEVMKeys() {
  const adminKey = JSON.parse(readFileSync('admin-key.json', 'utf8'));
  const sessionKey = JSON.parse(readFileSync('session-key.json', 'utf8'));
  
  return { adminKey, sessionKey };
}

// Predict EVM smart account address
async function predictEVMAddress(sessionAddress: string, adminAddress: string): Promise<string> {
  const response = await apiRequest<{ sessionAddress: string; adminAddress: string }, { predictedAddress: string }>(
    'post', 
    '/api/account/predict-address',
    { sessionAddress, adminAddress }
  );
  
  return response.predictedAddress;
}

// Generate or load Solana keypair
function generateSolanaKeypair() {
  const keypair = Keypair.generate();
  
  return {
    publicKey: keypair.publicKey.toString(),
    secretKey: Array.from(keypair.secretKey),
    keypair,
  };
}

function readOrCacheSolanaKey(keyName: string) {
  const filename = `${keyName}-solana-key.json`;
  
  if (existsSync(filename)) {
    const cachedKeys = readFileSync(filename, 'utf8');
    const parsed = JSON.parse(cachedKeys);
    
    // Reconstruct keypair from secret key
    const keypair = Keypair.fromSecretKey(new Uint8Array(parsed.secretKey));
    
    return {
      ...parsed,
      keypair,
    };
  }

  const keys = generateSolanaKeypair();
  writeFileSync(filename, JSON.stringify({
    publicKey: keys.publicKey,
    secretKey: keys.secretKey,
  }, null, 2));

  return keys;
}

// Solana-specific signing function (based on working e2e test)
async function signSolanaOperation(dataToSign: string, keypair: Keypair): Promise<string> {
  try {
    // 1. Convert base64 data to message buffer
    const msgBuffer = Buffer.from(dataToSign, 'base64');
    
    // 2. Deserialize into MessageV0
    const message = MessageV0.deserialize(msgBuffer);
    
    // 3. Create versioned transaction
    const transaction = new VersionedTransaction(message);
    
    // 4. Sign with keypair
    transaction.sign([
      {
        publicKey: keypair.publicKey,
        secretKey: keypair.secretKey,
      },
    ]);
    
    // 5. Extract signature and encode as base58 - get the last signature
    const signature = bs58.encode(Buffer.from(transaction.signatures[transaction.signatures.length - 1]));
    
    return signature;
  } catch (error) {
    console.error('Error signing Solana operation:', error);
    throw error;
  }
}

// TypeScript interfaces for v3 API
// TODO: Install @one-backend/shared-types package for proper types
// npm install @one-backend/shared-types
// For now, we'll define minimal types locally
enum ContractAccountType {
  Solana = 'solana',
  RoleBased = 'role-based',
  KernelV31 = 'kernel-v3.1-ecdsa',
  KernelV33 = 'kernel-v3.3-ecdsa',
}

enum ChainType {
  Evm = 'evm',
  Solana = 'solana',
}

type AggregatedAssetId = string;
type AssetIdType = string;

// Chain identifiers based on CAIP-2 format
const CHAIN_IDS = {
  SOLANA: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // Mainnet
  ARBITRUM: 'eip155:42161',
  ETHEREUM: 'eip155:1',
  POLYGON: 'eip155:137',
  OPTIMISM: 'eip155:10',
  BASE: 'eip155:8453',
} as const;

// Helper to create CAIP-10 account identifier
function createAccountId(chain: keyof typeof CHAIN_IDS, address: string): string {
  return `${CHAIN_IDS[chain]}:${address}`;
}

// Helper to parse CAIP-10 account identifier
function parseAccountId(accountId: string): { chain: string; address: string } {
  const [chain, address] = accountId.split(':').slice(-2);
  return { chain, address };
}

// Quote validation helper based on test patterns
function validateQuote(quote: QuoteResponseV3, expectedFromAsset?: string, expectedToAsset?: string): void {
  // Basic structure validation
  if (!quote.id) throw new Error('Quote missing ID');
  if (!quote.originChainsOperations || quote.originChainsOperations.length === 0) {
    throw new Error('Quote missing origin chain operations');
  }
  if (!quote.expirationTimestamp) throw new Error('Quote missing expiration timestamp');
  if (!quote.tamperProofSignature) throw new Error('Quote missing tamper proof signature');
  
  // Token validation
  if (!quote.originToken) throw new Error('Quote missing origin token');
  if (!quote.destinationToken) throw new Error('Quote missing destination token');
  
  // Asset type validation if expected values provided
  if (expectedFromAsset && quote.originToken.assetType) {
    const originAssetTypes = Array.isArray(quote.originToken.assetType) 
      ? quote.originToken.assetType 
      : [quote.originToken.assetType];
    if (!originAssetTypes.includes(expectedFromAsset)) {
      console.warn(`Origin asset mismatch. Expected: ${expectedFromAsset}, Got: ${originAssetTypes}`);
    }
  }
  
  if (expectedToAsset && quote.destinationToken.assetType !== expectedToAsset) {
    console.warn(`Destination asset mismatch. Expected: ${expectedToAsset}, Got: ${quote.destinationToken.assetType}`);
  }
  
  console.log('✅ Quote validation passed');
}

// Common asset types based on test patterns
const ASSET_TYPES = {
  // Native tokens
  SOL_NATIVE: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', // Native SOL
  ETH_NATIVE: 'eip155:1/slip44:60', // Native ETH
  ARB_NATIVE: 'eip155:42161/slip44:60', // Native ARB
  
  // Stablecoins
  SOL_USDC: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
  ARB_USDC: 'eip155:42161/erc20:0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
  
  // Aggregated assets
  USDC_AGGREGATED: 'ds:usdc',
  ETH_AGGREGATED: 'ds:eth',
  SOL_AGGREGATED: 'ds:sol',
} as const;

// Use proper typed interfaces
interface SolanaAccount {
  type: ContractAccountType.Solana;
  accountAddress: string;
}

interface EVMAccount {
  type: ContractAccountType;
  accountAddress: string;
  signerAddress?: string;
  deploymentType?: string;
  adminAddress?: string;
  sessionAddress?: string;
}

interface Asset {
  assetId: AggregatedAssetId | AssetIdType;
}

interface QuoteRequestV3 {
  from: {
    accounts: (SolanaAccount | EVMAccount)[];
    asset: Asset;
    amount: string;
  };
  to: {
    asset: Asset;
    account?: string; // CAIP-10 format
  };
}

// Solana operation type
interface SolanaChainOperation {
  type: 'solana';
  dataToSign: string;
  signature?: string;
  amount: string;
  assetType: string;
}

// EVM operation type
interface EvmChainOperation {
  type: string; // Can be 'kernel-v3.1-ecdsa', 'role-based', etc.
  userOp: any;
  typedDataToSign: any;
  signature?: string;
  amount: string;
  assetType: string;
  delegation?: any;
}

interface QuoteResponseV3 {
  id: string;
  accounts: (SolanaAccount | EVMAccount)[];
  originChainsOperations: (SolanaChainOperation | EvmChainOperation)[];
  destinationChainOperation?: SolanaChainOperation | EvmChainOperation;
  originToken: {
    assetType: string | string[];
    amount: string;
    fiatValue: number;
    aggregatedAssetId?: AggregatedAssetId;
  };
  destinationToken: {
    assetType: string;
    minimumAmount: string;
    minimumFiatValue: number;
    fiatValue: number;
  };
  expirationTimestamp: string;
  tamperProofSignature: string;
  fees?: {
    cumulativeUSD?: number;
  };
}

interface BalanceResponseV3 {
  balanceByAggregatedAsset: Array<{
    aggregatedAssetId: string;
    balance: string;
    individualAssetBalances: Array<{
      assetType: string;
      balance: string;
      fiatValue: number;
    }>;
    fiatValue: number;
  }>;
  balanceBySpecificAsset: Array<{
    assetType: string;
    balance: string;
    fiatValue: number;
  }>;
  totalBalance: {
    fiatValue: number;
  };
}

// API functions using v3 endpoints
async function getQuoteV3(quoteRequest: QuoteRequestV3): Promise<QuoteResponseV3> {
  return apiRequest<QuoteRequestV3, QuoteResponseV3>('post', '/api/v3/quote', quoteRequest);
}

async function executeQuoteV3(quote: QuoteResponseV3): Promise<any> {
  return apiRequest<QuoteResponseV3, any>('post', '/api/v3/quote/execute', quote);
}

async function getAggregatedBalanceV3(accounts: string[], assetIds?: string[]): Promise<BalanceResponseV3> {  
  const params: any = {
    account: accounts.join(','),
  };
  
  if (assetIds && assetIds.length > 0) {
    params.assetId = assetIds.join(',');
  }
  
  console.log('📊 Balance request params:', params);
  
  return apiRequest<any, BalanceResponseV3>('get', '/api/v3/balances/aggregated-balance', params, true);
}

async function getQuoteStatusV3(quoteId: string): Promise<any> {
  return apiRequest<any, any>('get', '/api/v3/status/get-execution-status', { quoteId }, true);
}

// Example: SOL to USDC swap on Solana
async function swapSolToUSDC(evmAccount: EVMAccount, solanaAccount: SolanaAccount, amount: string) {
  console.log('🔄 Starting SOL to USDC swap...');
  
  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [solanaAccount, evmAccount],
      asset: {
        assetId: ASSET_TYPES.SOL_NATIVE, // Using constant
      },
      amount,
    },
    to: {
      asset: {
        assetId: ASSET_TYPES.SOL_USDC, // Using constant
      },
      // Optional: specify recipient account in CAIP-10 format
      // account: createAccountId('SOLANA', solanaAccount.accountAddress),
    },
  };

  console.log('📝 Quote request:', JSON.stringify(quoteRequest, null, 2));

  try {
    const quote = await getQuoteV3(quoteRequest);
    console.log('💰 Quote received:', quote.id);
    console.log('📊 Origin token:', quote.originToken);
    console.log('📊 Destination token:', quote.destinationToken);
    
    // Validate quote similar to tests
    if (!quote.id || !quote.originChainsOperations || quote.originChainsOperations.length === 0) {
      throw new Error('Invalid quote response');
    }

    return quote;
  } catch (error) {
    console.error('❌ Error getting quote:', error);
    throw error;
  }
}

// Example: Cross-chain operation (Solana to EVM)
async function crossChainTransfer(
  solanaAccount: SolanaAccount, 
  evmDestination: string,
  amount: string
) {
  console.log('🌉 Starting cross-chain transfer...');
  
  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [solanaAccount],
      asset: {
        assetId: 'ds:usdc', // Aggregated USDC
      },
      amount,
    },
    to: {
      asset: {
        assetId: 'ds:usdc', // Aggregated USDC
      },
      account: evmDestination, // CAIP-10 format like eip155:1:0x...
    },
  };

  console.log('📝 Cross-chain quote request:', JSON.stringify(quoteRequest, null, 2));

  try {
    const quote = await getQuoteV3(quoteRequest);
    console.log('💰 Cross-chain quote received:', quote.id);
    
    return quote;
  } catch (error) {
    console.error('❌ Error getting cross-chain quote:', error);
    throw error;
  }
}

// Example: EVM USDC to Solana SOL swap using aggregated assets
async function swapUSDCToSOL(evmAccount: EVMAccount, solanaAccount: SolanaAccount, amount: string) {
  console.log('💱 Starting USDC to SOL cross-chain swap...');
  
  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [solanaAccount, evmAccount], // Include both accounts for aggregated assets
      asset: {
        assetId: 'ds:usdc', // Aggregated USDC across all chains
      },
      amount,
    },
    to: {
      asset: {
        assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', // SOL
        // assetId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
      },
    },
  };

  console.log('📝 USDC to SOL quote request:', JSON.stringify(quoteRequest, null, 2));

  try {
    const quote = await getQuoteV3(quoteRequest);
    console.log({ quote });
    console.log('💰 USDC to SOL quote received:', quote.id);
    console.log('📊 Origin token:', quote.originToken);
    console.log('📊 Destination token:', quote.destinationToken);
    
    return quote;
  } catch (error) {
    console.error('❌ Error getting USDC to SOL quote:', error);
    throw error;
  }
}

// Sign EVM operation
async function signEVMOperation(operation: EvmChainOperation, privateKey: string): Promise<EvmChainOperation> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const signature = await account.signTypedData(operation.typedDataToSign);
  
  return {
    ...operation,
    userOp: {
      ...operation.userOp,
      signature,
    },
  };
}

// Sign and execute a quote (supports both Solana and EVM)
async function signAndExecuteQuote(
  quote: QuoteResponseV3, 
  solanaKeypair?: Keypair, 
  evmSessionPrivateKey?: string
): Promise<any> {
  console.log('✍️  Signing quote operations...');

  // Sign all operations
  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];
    console.log({ operation });
    
    if (operation.type === 'solana') {
      if (!solanaKeypair) {
        throw new Error('Solana keypair required for Solana operations');
      }
      
      const solanaOp = operation as SolanaChainOperation;
      console.log(`🔐 Signing Solana operation ${i + 1}...`);
      
      const signature = await signSolanaOperation(solanaOp.dataToSign, solanaKeypair);
      quote.originChainsOperations[i] = {
        ...solanaOp,
        signature,
      };
    } else {
      if (!evmSessionPrivateKey) {
        throw new Error('EVM session private key required for EVM operations');
      }
      
      const evmOp = operation as EvmChainOperation;
      console.log(`🔐 Signing EVM operation ${i + 1} (type: ${operation.type})...`);
      
      quote.originChainsOperations[i] = await signEVMOperation(evmOp, evmSessionPrivateKey);
    }
  }

  console.log('🚀 Executing quote...');
  
  try {
    console.log('🚀 Quote to execute:');
    console.log(JSON.stringify(quote, null, 2));
    
    const result = await executeQuoteV3(quote);
    console.log('✅ Quote executed successfully:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Error executing quote:', error);
    throw error;
  }
}

// Monitor quote execution status (based on test patterns)
async function monitorQuoteExecution(quoteId: string, timeoutMs = 90000): Promise<void> {
  console.log(`👀 Monitoring quote execution [${quoteId}]...`);
  
  const startTime = Date.now();
  let lastStatus: string | undefined;
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const status = await getQuoteStatusV3(quoteId);
      const currentStatus = status.status || 'UNKNOWN';
      
      // Only log if status changed
      if (currentStatus !== lastStatus) {
        console.log(`📊 Quote [...${quoteId}] ${currentStatus} 🔄`);
        lastStatus = currentStatus;
      }
      
      // Check for final states
      switch (currentStatus) {
        case 'COMPLETED':
          console.log('🎉 Quote execution completed!');
          if (status.transactionHash) {
            console.log('🔗 Transaction hash:', status.transactionHash);
          }
          return;
          
        case 'FAILED':
          throw new Error(`Quote ${quoteId} failed`);
          
        case 'REFUNDED':
          throw new Error(`Quote ${quoteId} refunded`);
      }
      
    } catch (error) {
      if (error instanceof Error && (error.message.includes('failed') || error.message.includes('refunded'))) {
        throw error;
      }
      console.log('⚠️  Error checking status, retrying...');
    }
    
    // Wait 1 second before checking again (based on test pattern)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error(`Quote ${quoteId} timed out waiting for status`);
}

// Helper to find specific balance from response (based on test patterns)
function getBalance(assetId: string, balances: BalanceResponseV3): { balance: bigint; fiatValue: number; assetId: string } | null {
  // Check aggregated assets
  for (const aggregatedAsset of balances.balanceByAggregatedAsset) {
    // Check if this is the aggregated asset we're looking for
    if (aggregatedAsset.aggregatedAssetId === assetId) {
      return {
        assetId,
        balance: BigInt(aggregatedAsset.balance),
        fiatValue: aggregatedAsset.fiatValue,
      };
    }
    
    // Check individual assets within aggregated
    for (const individual of aggregatedAsset.individualAssetBalances) {
      if (individual.assetType === assetId) {
        return {
          assetId,
          balance: BigInt(individual.balance),
          fiatValue: individual.fiatValue,
        };
      }
    }
  }
  
  // Check specific assets
  for (const specificAsset of balances.balanceBySpecificAsset) {
    if (specificAsset.assetType === assetId) {
      return {
        assetId,
        balance: BigInt(specificAsset.balance),
        fiatValue: specificAsset.fiatValue,
      };
    }
  }
  
  return null;
}

// Helper to wait for balance update (based on test patterns)
async function waitForBalance(
  accounts: string[], 
  assetId?: string, 
  timeoutMs = 90000
): Promise<{ balance: bigint; fiatValue: number }> {
  console.log(`⏳ Waiting for balance update ${assetId ? `for ${assetId}` : ''} on ${accounts.join(', ')}...`);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const balances = await getAggregatedBalanceV3(accounts, assetId ? [assetId] : undefined);
      
      if (assetId) {
        const specificBalance = getBalance(assetId, balances);
        if (specificBalance && specificBalance.balance > 0n) {
          console.log(`💰 ${assetId} Balance: ${specificBalance.balance.toString()}`);
          return { balance: specificBalance.balance, fiatValue: specificBalance.fiatValue };
        }
      } else if (balances.totalBalance.fiatValue > 0) {
        // Return total balance if no specific asset requested
        const totalBalance = balances.balanceByAggregatedAsset.reduce(
          (sum, asset) => sum + BigInt(asset.balance), 
          0n
        );
        return { balance: totalBalance, fiatValue: balances.totalBalance.fiatValue };
      }
    } catch (error) {
      console.log(`⚠️  Balance fetch error: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Timeout waiting for balance');
}

// Example: Multi-account aggregated swap (based on test patterns)
async function multiAccountAggregatedSwap(
  evmAccount: EVMAccount,
  solanaAccount: SolanaAccount,
  fromAssetId: string,
  toAssetId: string,
  amount: string,
  recipientAccountId?: string
): Promise<QuoteResponseV3> {
  console.log('🔄 Starting multi-account aggregated swap...');
  console.log(`📊 From: ${fromAssetId} -> To: ${toAssetId}`);
  
  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts: [evmAccount, solanaAccount], // Both accounts can contribute
      asset: {
        assetId: fromAssetId as AggregatedAssetId,
      },
      amount,
    },
    to: {
      asset: {
        assetId: toAssetId as AssetIdType,
      },
      ...(recipientAccountId && { account: recipientAccountId }),
    },
  };
  
  try {
    const quote = await getQuoteV3(quoteRequest);
    console.log('💰 Multi-account quote received:', quote.id);
    console.log('📊 Accounts involved:', quote.accounts.length);
    console.log('🔗 Operations:', quote.originChainsOperations.length);
    
    // Validate the quote
    validateQuote(quote, fromAssetId, toAssetId);
    
    return quote;
  } catch (error) {
    console.error('❌ Error getting multi-account quote:', error);
    throw error;
  }
}

// Main demo function
async function main() {
  console.log('🚀 OneBalance Solana Integration Demo');
  console.log('=====================================');

  // Load EVM keys
  const { adminKey, sessionKey } = loadEVMKeys();
  console.log('🔑 EVM Session Address:', sessionKey.address);
  console.log('🔑 EVM Admin Address:', adminKey.address);

  // Generate or load Solana keypair
  const solanaKey = readOrCacheSolanaKey('demo');
  console.log('🔑 Solana Public Key:', solanaKey.publicKey);

  // Predict EVM smart account address
  const evmSmartAccount = await predictEVMAddress(sessionKey.address, adminKey.address);
  console.log('🏦 EVM Smart Account:', evmSmartAccount);

  const solanaAccount: SolanaAccount = {
    type: ContractAccountType.Solana,
    accountAddress: solanaKey.publicKey,
  };

  const evmAccount2: EVMAccount = {
    type: ContractAccountType.KernelV31,
    accountAddress: evmSmartAccount,
    signerAddress: sessionKey.address,
    deploymentType: 'ERC4337',
  };

  const evmAccount: EVMAccount = {
    type: ContractAccountType.RoleBased,
    accountAddress: evmSmartAccount,
    sessionAddress: sessionKey.address,
    adminAddress: adminKey.address,
    deploymentType: 'ERC4337',
  };

  try {
    // 1. Check Solana balances
    console.log('\n📊 Checking Solana balances...');
    const solanaBalances = await getAggregatedBalanceV3([`solana:${solanaKey.publicKey}`]);
    console.log({ solanaBalances });
    console.log('💰 Solana Total fiat value:', solanaBalances.totalBalance.fiatValue);
    console.log('📈 Solana Aggregated assets:', solanaBalances.balanceByAggregatedAsset.length);
    
    // Display Solana balance details
    if (solanaBalances.balanceByAggregatedAsset.length > 0) {
        console.log('\n💎 Solana Asset balances:');
        solanaBalances.balanceByAggregatedAsset.forEach(asset => {
            console.log(`  ${asset.aggregatedAssetId}: ${asset.balance} $${asset.fiatValue.toFixed(2)}`);
        });
    }
    
    // 2. Check EVM balances
    console.log('\n📊 Checking EVM balances...');
    const evmBalances = await getAggregatedBalanceV3([`eip155:42161:${evmSmartAccount}`]);
    console.log('💰 EVM Total fiat value:', evmBalances.totalBalance.fiatValue);
    console.log('📈 EVM Aggregated assets:', evmBalances.balanceByAggregatedAsset.length);
    
    // Display EVM balance details
    if (evmBalances.balanceByAggregatedAsset.length > 0) {
      console.log('\n💎 EVM Asset balances:');
      evmBalances.balanceByAggregatedAsset.forEach(asset => {
        console.log(`  ${asset.aggregatedAssetId}: ${asset.balance} $${asset.fiatValue.toFixed(2)}`);
      });
    }

    // 3. Example: Get a quote for SOL to USDC swap
    // console.log('\n📝 Getting SOL to USDC quote...');
    // try {
    //   const quote = await swapSolToUSDC(evmAccount, solanaAccount, '3000000'); // 0.003 SOL
    //   console.log('💰 Quote ID:', quote.id);
    //   console.log('⏰ Expires at:', new Date(parseInt(quote.expirationTimestamp) * 1000).toISOString());
      
    //   // Validate the quote
    //   validateQuote(quote, ASSET_TYPES.SOL_NATIVE, ASSET_TYPES.SOL_USDC);
      
    //   // Execute the quote
    //   console.log('🚀 Executing quote...');
    //   const result = await signAndExecuteQuote(quote, solanaKey.keypair);
    //   await monitorQuoteExecution(quote.id);
      
    //   // Wait for balance update
    //   console.log('⏳ Waiting for USDC balance...');
    //   const newBalance = await waitForBalance(
    //     [createAccountId('SOLANA', solanaAccount.accountAddress)],
    //     ASSET_TYPES.SOL_USDC,
    //     30000 // 30 second timeout
    //   );
    //   console.log('✅ New USDC balance:', newBalance.balance.toString());
      
    // } catch (error) {
    //   console.log('ℹ️  SOL to USDC quote failed:', error instanceof Error ? error.message : error);
    // }

    // 4. NEW: Example: USDC to SOL cross-chain swap
    // console.log('\n💱 Getting USDC to SOL cross-chain quote...');
    // try {
    //     const usdcToSolQuote = await swapUSDCToSOL(
    //         evmAccount,
    //         solanaAccount, // Solana account for aggregated balance
    //         '800000' // 0.8 USDC
    //     );
    //     console.log('💰 USDC to SOL Quote ID:', usdcToSolQuote.id);
    //     console.log('⏰ Expires at:', new Date(parseInt(usdcToSolQuote.expirationTimestamp) * 1000).toISOString());
        
    //     // Uncomment to execute the swap:
    //     console.log('🚀 Executing USDC to SOL swap...');
    //     const result = await signAndExecuteQuote(usdcToSolQuote, solanaKey.keypair, sessionKey.privateKey);
    //     await monitorQuoteExecution(usdcToSolQuote.id);
    // } catch (error) {
    //     console.log('ℹ️  USDC to SOL quote failed (might be due to insufficient USDC balance)');
    //     console.log('💡 Tip: Make sure your EVM smart account has USDC balance');
    // }

    // 5. Example: Cross-chain quote (Solana to Ethereum)
    // console.log('\n🌉 Getting cross-chain quote...');
    // try {
    //   const crossChainQuote = await crossChainTransfer(
    //     solanaAccount,
    //     'eip155:1:0x742F2c0c6b8fC7e53bb68C0F00FC6b66C0B7f6A4', // Example Ethereum address
    //     '1000000' // 1 USDC
    //   );
    //   console.log('🌉 Cross-chain quote ID:', crossChainQuote.id);
      
    // } catch (error) {
    //   console.log('ℹ️  Cross-chain quote failed (might be due to insufficient balance)');
    // }

    // 6. NEW: Multi-account aggregated swap example
    console.log('\n🔄 Example: Multi-account aggregated swap...');
    try {
      // Check if we have USDC balance across accounts
      const combinedAccounts = [
        createAccountId('ARBITRUM', evmAccount.accountAddress),
        createAccountId('SOLANA', solanaAccount.accountAddress)
      ];
      
      const aggregatedBalances = await getAggregatedBalanceV3(combinedAccounts);
      const usdcBalance = getBalance(ASSET_TYPES.USDC_AGGREGATED, aggregatedBalances);
      
      if (usdcBalance && usdcBalance.balance > 0n) {
        console.log('💰 Found aggregated USDC balance:', usdcBalance.balance.toString());
        
        // Get quote for aggregated USDC to SOL
        const multiAccountQuote = await multiAccountAggregatedSwap(
          evmAccount,
          solanaAccount,
          ASSET_TYPES.USDC_AGGREGATED,
          ASSET_TYPES.SOL_NATIVE,
          '1000000', // 1 USDC
          // createAccountId('SOLANA', 'H1nVFuuwtJED31LhdXdNty78HCPMmkRcQB1RrGBRPe6Z'),
          createAccountId('SOLANA', 'CAW6urzY9sziuBfzjboqp8VcYieQryWUfCVJqNLCYwMq')
        );
        
        console.log('📊 Multi-account quote details:');
        console.log({ multiAccountQuote });
        console.log('  - Accounts involved:', multiAccountQuote.accounts.length);
        console.log('  - Operations needed:', multiAccountQuote.originChainsOperations.length);
        console.log('  - Quote ID:', multiAccountQuote.id);
        
        // Uncomment to execute:
        await signAndExecuteQuote(multiAccountQuote, solanaKey.keypair, sessionKey.privateKey);
        await monitorQuoteExecution(multiAccountQuote.id);
      } else {
        console.log('ℹ️  No aggregated USDC balance found across accounts');
      }
    } catch (error) {
      console.log('ℹ️  Multi-account swap example failed:', error instanceof Error ? error.message : error);
    }

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }

  console.log('\n✨ Demo completed!');
  console.log('\n📚 Next steps:');
  console.log('  - Check out IMPROVEMENTS.md for details on all enhancements');
  console.log('  - Fund your accounts to test actual swaps');
  console.log('  - Try the USDC to SOL cross-chain swap');
  console.log('  - Try multi-account aggregated swaps');
  console.log('  - Explore different asset combinations');
}

// Run the demo
if (require.main === module) {
  main().catch(console.error);
}
