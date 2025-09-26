import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import axios, { AxiosResponse } from 'axios';
import { HashTypedDataParameters, encodeFunctionData, parseAbi } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const BASE_URL = 'https://be.onebalance.io';

// Note: Using the production API endpoint will produce a different predicted address
const PUBLIC_API_KEY = '42bb629272001ee1163ca0dbbbc07bcbb0ef57a57baf16c4b1d4672db4562c11';

// Helper function to create authenticated headers
function createAuthHeaders(): Record<string, string> {
  return {
    'x-api-key': PUBLIC_API_KEY,
  };
}

async function apiRequest<RequestData, ResponseData>(
  method: 'get' | 'post',
  endpoint: string,
  data: RequestData,
  isParams = false,
): Promise<ResponseData> {
  try {
    const config = {
      headers: createAuthHeaders(),
      ...(isParams ? { params: data } : {}),
    };

    const url = `${BASE_URL}${endpoint}`;

    const response: AxiosResponse<ResponseData> =
      method === 'post'
        ? await axios.post(url, data, config)
        : await axios.get(url, { ...config, params: data });

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// API methods
async function apiPost<RequestData, ResponseData>(
  endpoint: string,
  data: RequestData,
): Promise<ResponseData> {
  return apiRequest<RequestData, ResponseData>('post', endpoint, data);
}

async function apiGet<RequestData, ResponseData>(
  endpoint: string,
  params: RequestData,
): Promise<ResponseData> {
  return apiRequest<RequestData, ResponseData>('get', endpoint, params, true);
}

// Generate session key pair
function generateEOAKey() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    privateKey,
    address: account.address,
  };
}

function readOrCacheEOAKey(key: string) {
  if (existsSync(`${key}-key.json`)) {
    const cachedKeys = readFileSync(`${key}-key.json`, 'utf8');
    return JSON.parse(cachedKeys);
  }

  const keys = generateEOAKey();
  writeFileSync(`${key}-key.json`, JSON.stringify(keys, null, 2));

  return keys;
}

// Usage example
const sessionKey = readOrCacheEOAKey('session');

console.log('Session Address:', sessionKey.address);

const adminKey = readOrCacheEOAKey('admin');

console.log('Admin Address:', adminKey.address);

async function predictAddress(sessionAddress: string, adminAddress: string): Promise<string> {
  const response = await apiPost<
    { sessionAddress: string; adminAddress: string },
    { predictedAddress: string }
  >('/api/account/predict-address', {
    sessionAddress,
    adminAddress,
  });

  return response.predictedAddress;
}

async function fetchBalances(address: string) {
  const response = await apiGet<
    { address: string },
    {
      balanceByAggregatedAsset: {
        aggregatedAssetId: string;
        balance: string;
        individualAssetBalances: {
          assetType: string;
          balance: string;
          fiatValue: number;
        }[];
        fiatValue: number;
      }[];
      balanceBySpecificAsset: {
        assetType: string;
        balance: string;
        fiatValue: number;
      }[];
      totalBalance: {
        fiatValue: number;
      };
    }
  >('/api/v2/balances/aggregated-balance', { address });
  return response;
}

async function fetchUSDCBalance(address: string) {
  const response = await fetchBalances(address);
  return response.balanceByAggregatedAsset.find((asset) => asset.aggregatedAssetId === 'ob:usdc');
}

type Hex = `0x${string}`;

interface EvmAccount {
  accountAddress: Hex;
  sessionAddress: Hex;
  adminAddress: Hex;
}

interface EvmCall {
  to: Hex;
  value?: Hex;
  data?: Hex;
}

interface TokenRequirement {
  assetType: string;
  amount: string;
}

interface TokenAllowanceRequirement extends TokenRequirement {
  spender: Hex;
}

type StateMapping = {
  [slot: Hex]: Hex;
};

type StateDiff = {
  stateDiff?: StateMapping;
  code?: Hex;
  balance?: Hex;
};

type Override = StateDiff & {
  address: Hex;
};

interface PrepareCallRequest {
  account: EvmAccount;
  targetChain: string; // CAIP-2
  calls: EvmCall[];
  tokensRequired: TokenRequirement[];
  allowanceRequirements?: TokenAllowanceRequirement[];
  overrides?: Override[];
  // permits
  validAfter?: string;
  validUntil?: string;
}

interface SerializedUserOperation {
  sender: Hex;
  nonce: string;
  factory?: Hex;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  paymaster?: Hex;
  paymasterVerificationGasLimit?: string;
  paymasterPostOpGasLimit?: string;
  paymasterData?: Hex;
  signature: Hex;
  initCode?: Hex;
  paymasterAndData?: Hex;
}

interface ChainOperationBasic {
  userOp: SerializedUserOperation;
  typedDataToSign: HashTypedDataParameters;
}

interface ChainOperation extends ChainOperationBasic {
  assetType: string;
  amount: string;
}

interface TargetCallQuote {
  account: EvmAccount;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
}

interface CallRequest {
  account: EvmAccount;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  fromAggregatedAssetId: string;
}

interface AssetUsed {
  aggregatedAssetId: string;
  assetType: string[] | string;
  amount: string;
  minimumAmount?: string;
}

interface FiatValue {
  fiatValue: string;
  amount: string;
}

interface OriginAssetUsed extends AssetUsed {
  assetType: string[];
  fiatValue: FiatValue[];
}

interface DestinationAssetUsed extends AssetUsed {
  assetType: string;
  fiatValue: string;
  minimumAmount?: string;
  minimumFiatValue?: string;
}

interface Quote {
  id: string;
  account: EvmAccount;
  originChainsOperations: ChainOperation[];
  destinationChainOperation?: ChainOperation;

  originToken?: OriginAssetUsed;
  destinationToken?: DestinationAssetUsed;

  validUntil?: string; // block number, if empty the valid until will be MAX_UINT256
  validAfter?: string; // block number, if empty the valid after will be 0

  expirationTimestamp: string;
  tamperProofSignature: string;
}

interface OpGuarantees {
  non_equivocation: boolean;
  reorg_protection: boolean;
  valid_until?: number;
  valid_after?: number;
}

type BundleGuarantees = Record<Hex, OpGuarantees>;

interface BundleResponse {
  success: boolean;
  guarantees: BundleGuarantees | null;
  error: string | null;
}

type TransactionType = 'SWAP' | 'TRANSFER' | 'CALL';

type OperationStatus =
  | 'PENDING' // not yet begun processing but has been submitted
  | 'IN_PROGRESS' // processing the execution steps of the operation
  | 'COMPLETED' // all steps completed with success
  | 'REFUNDED' // none or some steps completed, some required step failed causing the whole operation to be refunded
  | 'FAILED'; // all steps failed

interface OperationDetails {
  hash?: Hex;
  chainId?: number;
  explorerUrl?: string;
}

interface HistoryTransaction {
  quoteId: string;
  type: TransactionType;

  originToken?: OriginAssetUsed;
  destinationToken?: DestinationAssetUsed;

  status: OperationStatus;

  user: Hex;
  recipientAccountId: string; // the caip-10 address of the recipient

  // if type is SWAP or TRANSFER
  originChainOperations?: OperationDetails[]; // the asset(s) that were sent from the source
  destinationChainOperations?: OperationDetails[]; // the asset that was received to the final destination
}

interface HistoryResponse {
  transactions: HistoryTransaction[];
  continuation?: string;
}

async function prepareCallQuote(quoteRequest: PrepareCallRequest): Promise<TargetCallQuote> {
  return apiPost<PrepareCallRequest, TargetCallQuote>(
    '/api/quotes/prepare-call-quote',
    quoteRequest,
  );
}

async function fetchCallQuote(callRequest: CallRequest): Promise<Quote> {
  return apiPost<CallRequest, Quote>('/api/quotes/call-quote', callRequest);
}

async function executeQuote(quote: Quote): Promise<BundleResponse> {
  return apiPost<Quote, BundleResponse>('/api/quotes/execute-quote', quote);
}

async function fetchTransactionHistory(address: string): Promise<HistoryResponse> {
  return apiGet<{ user: string; limit: number; sortBy: string }, HistoryResponse>(
    '/api/status/get-tx-history',
    {
      user: address,
      limit: 1,
      sortBy: 'createdAt',
    },
  );
}

async function signOperation(operation: ChainOperation, key: Hex): Promise<ChainOperation> {
  return {
    ...operation,
    userOp: {
      ...operation.userOp,
      signature: await privateKeyToAccount(key).signTypedData(operation.typedDataToSign),
    },
  };
}

// Usage example

async function transferErc20OnChain(
  account: EvmAccount,
  usdcBalances: {
    aggregatedAssetId: string;
    balance: string;
    individualAssetBalances: { assetType: string; balance: string; fiatValue: number }[];
  },
) {
  const largestUsdcBalanceEntry = usdcBalances.individualAssetBalances.reduce((max, current) => {
    return Number(current.balance) > Number(max.balance) ? current : max;
  });

  const chain = 'eip155:42161'; // Arbitrum
  const usdcAddress = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // Arbitrum USDC address

  if (largestUsdcBalanceEntry.balance === '0') {
    throw new Error('No USDC balance found');
  }

  const transferDefinition = parseAbi([
    'function transfer(address to, uint256 amount) returns (bool)',
  ]);

  const transferCallData = encodeFunctionData({
    abi: transferDefinition,
    functionName: 'transfer',
    args: [adminKey.address, 1n],
  });

  const quoteRequest: PrepareCallRequest = {
    account,

    targetChain: chain,

    calls: [
      {
        to: usdcAddress as Hex,
        data: transferCallData,
        value: '0x0',
      },
    ],

    tokensRequired: [
      {
        assetType: `${chain}/erc20:${usdcAddress}`,
        amount: '100000',
      },
    ],
  };

  console.log(quoteRequest);

  const preparedQuote = await prepareCallQuote(quoteRequest);

  const signedChainOp = await signOperation(preparedQuote.chainOperation, sessionKey.privateKey);

  const callRequest: CallRequest = {
    fromAggregatedAssetId: 'ob:usdc',
    account,
    tamperProofSignature: preparedQuote.tamperProofSignature,
    chainOperation: signedChainOp,
  };

  console.log('callRequest', callRequest);

  const quote = await fetchCallQuote(callRequest);

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const callQuoteSignedChainOperation = await signOperation(
      quote.originChainsOperations[i],
      sessionKey.privateKey,
    );
    quote.originChainsOperations[i] = callQuoteSignedChainOperation;
  }

  console.log('quote', quote);

  const bundle = await executeQuote(quote);

  if (bundle.success) {
    console.log('Bundle executed');

    const timeout = 60_000;

    let completed = false;
    const startTime = Date.now();

    while (!completed) {
      try {
        console.log('fetching transaction history...');
        const transactionHistory = await fetchTransactionHistory(quote.account.accountAddress);

        console.log('transactionHistory', transactionHistory);

        if (transactionHistory.transactions.length > 0) {
          const [tx] = transactionHistory.transactions;

          if (tx.quoteId === quote.id) {
            if (tx.status === 'COMPLETED') {
              console.log('Transaction completed and operation executed');
              completed = true;
              break;
            }
            console.log('Transaction status: ', tx.status);
          }
        }
      } catch {}

      if (Date.now() - startTime > timeout) {
        throw new Error('Transaction not completed in time');
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } else {
    console.log('Bundle execution failed');
  }
}

async function main() {
  const predictedAddress = await predictAddress(sessionKey.address, adminKey.address);

  console.log('Predicted Address:', predictedAddress);

  const usdcBalances = await fetchUSDCBalance(predictedAddress);

  console.log('USDC Balances:', usdcBalances);

  if (!usdcBalances) {
    throw new Error('No USDC balance found');
  }

  await transferErc20OnChain(
    {
      accountAddress: predictedAddress as Hex,
      sessionAddress: sessionKey.address as Hex,
      adminAddress: adminKey.address as Hex,
    },
    usdcBalances,
  );
}

main();
