import {
  PrepareCallRequest,
  TargetCallQuote,
  CallRequest,
  Quote,
  BundleResponse,
  HistoryResponse,
  ExecutionStatusResponse,
  Hex,
  PredictAddressRoleBasedRequest,
  PredictAddressStandardRequest,
  PredictAddressResponse,
  QuoteRequestV1,
  QuoteResponseV1,
  QuoteRequestV3,
  QuoteResponseV3,
  AggregatedBalanceResponseV2,
  AggregatedBalanceRequestV3,
  AggregatedBalanceResponseV3,
  AggregatedAsset,
  AggregatedAssetBalance,
  SupportedChain,
  PrepareCallRequestV3,
  TargetCallQuoteV3,
  CallRequestV3,
  CallQuoteResponseV3,
} from './types';
import { apiPost, apiGet } from './api';

// OneBalance API methods
export async function predictAddress(
  sessionAddress: string,
  adminAddress: string,
): Promise<string> {
  const response = await apiPost<PredictAddressRoleBasedRequest, PredictAddressResponse>(
    '/api/account/predict-address',
    {
      sessionAddress: sessionAddress as Hex,
      adminAddress: adminAddress as Hex,
    },
  );

  return response.predictedAddress;
}

export async function predictStandardAddress(type: string, signerAddress: string): Promise<string> {
  const response = await apiPost<PredictAddressStandardRequest, PredictAddressResponse>(
    '/api/account/predict-address',
    {
      type,
      signerAddress: signerAddress as Hex,
    },
  );

  return response.predictedAddress;
}

export async function prepareCallQuote(quoteRequest: PrepareCallRequest): Promise<TargetCallQuote> {
  return apiPost<PrepareCallRequest, TargetCallQuote>(
    '/api/quotes/prepare-call-quote',
    quoteRequest,
  );
}

export async function fetchCallQuote(callRequest: CallRequest): Promise<Quote> {
  return apiPost<CallRequest, Quote>('/api/quotes/call-quote', callRequest);
}

export async function getQuote(quoteRequest: QuoteRequestV1): Promise<QuoteResponseV1> {
  return apiPost<QuoteRequestV1, QuoteResponseV1>('/api/v1/quote', quoteRequest);
}

export async function executeQuote(quote: QuoteResponseV1): Promise<BundleResponse> {
  return apiPost<QuoteResponseV1, BundleResponse>('/api/quotes/execute-quote', quote);
}

// V3 quote endpoint that supports Solana and multi-account operations
export async function getQuoteV3(quoteRequest: QuoteRequestV3): Promise<QuoteResponseV3> {
  return apiPost<QuoteRequestV3, QuoteResponseV3>('/api/v3/quote', quoteRequest);
}

// V3 execute quote endpoint that supports Solana and multi-account operations
export async function executeQuoteV3(signedQuote: QuoteResponseV3): Promise<BundleResponse> {
  return apiPost<QuoteResponseV3, BundleResponse>('/api/v3/quote/execute-quote', signedQuote);
}

export async function fetchTransactionHistory(address: string): Promise<HistoryResponse> {
  return apiGet<{ user: string; limit: number; sortBy: string }, HistoryResponse>(
    '/api/status/get-tx-history',
    {
      user: address,
      limit: 10,
      sortBy: 'createdAt',
    },
  );
}

export async function fetchBalances(address: string): Promise<AggregatedBalanceResponseV2> {
  const response = await apiGet<{ address: string }, AggregatedBalanceResponseV2>(
    '/api/v2/balances/aggregated-balance',
    { address },
  );
  return response;
}

// V3 aggregated balance that supports Solana accounts
export async function fetchAggregatedBalanceV3(
  account: string,
  aggregatedAssetId?: string,
  assetId?: string,
): Promise<AggregatedBalanceResponseV3> {
  const params: AggregatedBalanceRequestV3 = { account };

  if (aggregatedAssetId) {
    params.aggregatedAssetId = aggregatedAssetId;
  }

  if (assetId) {
    params.assetId = assetId;
  }

  const response = await apiGet<AggregatedBalanceRequestV3, AggregatedBalanceResponseV3>(
    '/api/v3/balances/aggregated-balance',
    params,
  );
  return response;
}

export async function fetchUSDCBalance(
  address: string,
): Promise<AggregatedAssetBalance | undefined> {
  const response = await fetchBalances(address);
  return response.balanceByAggregatedAsset.find((asset) => asset.aggregatedAssetId === 'ob:usdc');
}

export async function fetchExecutionStatus(quoteId: string): Promise<ExecutionStatusResponse> {
  return apiGet<{ quoteId: string }, ExecutionStatusResponse>('/api/status/get-execution-status', {
    quoteId,
  });
}

// List all aggregated assets
export async function listAggregatedAssets(): Promise<AggregatedAsset[]> {
  return apiGet<{}, AggregatedAsset[]>('/api/assets/list', {});
}

// List supported chains
export async function listSupportedChains(): Promise<SupportedChain[]> {
  return apiGet<{}, SupportedChain[]>('/api/chains/supported-list', {});
}

// V3 calldata endpoints
export async function prepareCallQuoteV3(
  quoteRequest: PrepareCallRequestV3,
): Promise<TargetCallQuoteV3> {
  return apiPost<PrepareCallRequestV3, TargetCallQuoteV3>(
    '/api/v3/quote/prepare-call-quote',
    quoteRequest,
  );
}

export async function fetchCallQuoteV3(callRequest: CallRequestV3): Promise<CallQuoteResponseV3> {
  return apiPost<CallRequestV3, CallQuoteResponseV3>('/api/v3/quote/call-quote', callRequest);
}
