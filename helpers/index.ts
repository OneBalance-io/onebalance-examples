// API helpers
export { createAuthHeaders, apiRequest, apiPost, apiGet } from './api';

// Crypto helpers
export { generateEOAKey, readOrCacheEOAKey, signTypedData, generateSolanaKey, loadSolanaKey } from './crypto';

// OneBalance helpers
export {
  predictAddress,
  predictBasicAddress,
  prepareCallQuote,
  fetchCallQuote,
  getQuote,
  executeQuote,
  getQuoteV3,
  executeQuoteV3,
  fetchTransactionHistory,
  fetchBalances,
  fetchAggregatedBalanceV3,
  fetchUSDCBalance,
  fetchExecutionStatus,
  listAggregatedAssets,
  listSupportedChains,
} from './onebalance';

// Signing helpers
export { 
  signOperation, 
  signSolanaOperation, 
  signAllOperations 
} from './signing';

// Solana helpers
export { 
  isSolanaInvolved, 
  isSolanaAsset, 
  extractSolanaTokenAddress, 
  formatSolanaAssetSymbol 
} from './solana';

// Balance helpers
export { 
  checkAssetBalance, 
  checkMultipleAssetBalances, 
  formatBalanceDisplay 
} from './balance';

// Account helpers
export { 
  loadAccounts, 
  loadMultiChainAccounts, 
  getBalanceCheckAddress,
  type LoadAccountsResult,
  type LoadMultiChainAccountsResult
} from './account';

// Quote helpers
export { 
  buildQuoteRequest, 
  buildTransferRequest, 
  buildCrossChainQuoteRequest, 
  validateQuoteRequest 
} from './quote';

// Monitoring helpers
export { 
  monitorTransactionCompletion, 
  monitorMultipleTransactions, 
  getTransactionStatus, 
  waitForTransaction 
} from './monitoring';

// Types
export * from './types';
