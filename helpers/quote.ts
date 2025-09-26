import { Account, QuoteRequestV3, SwapParams } from './types';

/**
 * Quote building utilities for OneBalance operations
 */


/**
 * Build quote request with proper accounts array for V3 API
 * 
 * @param swapParams - The swap parameters defining the assets and amount
 * @param accounts - Array of accounts to use for the swap
 * @param options - Additional options for the quote request
 * @returns Formatted quote request object for V3 API
 */
export function buildQuoteRequest(
  swapParams: SwapParams, 
  accounts: Account[], 
  options?: {
    slippageTolerance?: number;
    recipientAccount?: string;
  }
): QuoteRequestV3 {
  const quoteRequest: QuoteRequestV3 = {
    from: {
      accounts,
      asset: {
        assetId: swapParams.fromAssetId
      },
      amount: swapParams.amount
    },
    to: {
      asset: {
        assetId: swapParams.toAssetId
      }
    }
  };

  // Add optional parameters if provided
  if (options?.slippageTolerance) {
    quoteRequest.slippageTolerance = options.slippageTolerance;
  }

  if (options?.recipientAccount) {
    quoteRequest.to.account = options.recipientAccount;
  }

  return quoteRequest;
}

/**
 * Build a simple transfer quote request (same asset, different recipient)
 * 
 * @param assetId - The asset to transfer
 * @param amount - The amount to transfer
 * @param accounts - Array of accounts to use for the transfer
 * @param recipientAccount - The recipient account address
 * @param options - Additional options for the quote request
 * @returns Formatted transfer quote request object
 */
export function buildTransferRequest(
  assetId: string,
  amount: string,
  accounts: Account[],
  recipientAccount: string,
  options?: {
    slippageTolerance?: number;
  }
): QuoteRequestV3 {
  return buildQuoteRequest(
    { fromAssetId: assetId, toAssetId: assetId, amount },
    accounts,
    { 
      recipientAccount,
      ...options 
    }
  );
}

/**
 * Build quote request for cross-chain operations
 * 
 * @param swapParams - The swap parameters
 * @param accounts - Array of accounts (typically includes both EVM and Solana)
 * @param options - Additional options
 * @returns Formatted cross-chain quote request
 */
export function buildCrossChainQuoteRequest(
  swapParams: SwapParams,
  accounts: Account[],
  options?: {
    slippageTolerance?: number;
    recipientAccount?: string;
  }
): QuoteRequestV3 {
  // Ensure we have the right account types for cross-chain operations
  const hasEvm = accounts.some(acc => acc.type === 'kernel-v3.1-ecdsa');
  const hasSolana = accounts.some(acc => acc.type === 'solana');
  
  if (!hasEvm && !hasSolana) {
    throw new Error('At least one EVM or Solana account required for cross-chain operations');
  }

  return buildQuoteRequest(swapParams, accounts, options);
}

/**
 * Validate quote request parameters
 * 
 * @param quoteRequest - The quote request to validate
 * @throws Error if validation fails
 */
export function validateQuoteRequest(quoteRequest: QuoteRequestV3): void {
  if (!quoteRequest.from?.accounts?.length) {
    throw new Error('At least one account is required');
  }

  if (!quoteRequest.from.asset?.assetId) {
    throw new Error('Source asset ID is required');
  }

  if (!quoteRequest.to.asset?.assetId) {
    throw new Error('Destination asset ID is required');
  }

  if (!quoteRequest.from.amount || quoteRequest.from.amount === '0') {
    throw new Error('Amount must be greater than 0');
  }

  // Validate slippage tolerance if provided
  if (quoteRequest.slippageTolerance !== undefined) {
    if (quoteRequest.slippageTolerance < 0 || quoteRequest.slippageTolerance > 100) {
      throw new Error('Slippage tolerance must be between 0 and 100');
    }
  }
}
