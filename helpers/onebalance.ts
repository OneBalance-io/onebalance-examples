import {
  PrepareCallRequest,
  TargetCallQuote,
  CallRequest,
  Quote,
  BundleResponse,
  HistoryResponse,
  ChainOperation,
  Hex,
} from './types';
import { apiPost, apiGet } from './api';
import { signTypedData } from './crypto';

// OneBalance API methods
export async function prepareCallQuote(quoteRequest: PrepareCallRequest): Promise<TargetCallQuote> {
  return apiPost<PrepareCallRequest, TargetCallQuote>('/api/quotes/prepare-call-quote', quoteRequest);
}

export async function fetchCallQuote(callRequest: CallRequest): Promise<Quote> {
  return apiPost<CallRequest, Quote>('/api/quotes/call-quote', callRequest);
}

export async function executeQuote(quote: Quote): Promise<BundleResponse> {
  return apiPost<Quote, BundleResponse>('/api/quotes/execute-quote', quote);
}

export async function fetchTransactionHistory(address: string): Promise<HistoryResponse> {
  return apiGet<{ user: string; limit: number; sortBy: string }, HistoryResponse>('/api/status/get-tx-history', {
    user: address,
    limit: 1,
    sortBy: 'createdAt',
  });
}

export async function fetchBalances(address: string) {
  const response = await apiGet<
    { address: string },
    {
      balanceByAggregatedAsset: {
        aggregatedAssetId: string;
        balance: string;
        individualAssetBalances: { 
          assetType: string; 
          balance: string; 
          fiatValue: number 
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

export async function fetchUSDCBalance(address: string) {
  const response = await fetchBalances(address);
  return response.balanceByAggregatedAsset.find((asset) => asset.aggregatedAssetId === 'ds:usdc');
}

// Sign a chain operation's typed data
export async function signOperation(operation: ChainOperation, privateKey: Hex): Promise<ChainOperation> {
  const signature = await signTypedData(operation.typedDataToSign, privateKey);
  return {
    ...operation,
    userOp: { 
      ...operation.userOp, 
      signature 
    },
  };
}
