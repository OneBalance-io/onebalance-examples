import { formatUnits } from 'viem';
import { QuoteResponseV3, QuoteResponseV1 } from './types';

/**
 * Display utilities for OneBalance operations
 */

interface SwapQuoteDisplayParams {
  quote: QuoteResponseV3 | QuoteResponseV1;
  fromAssetId: string;
  toAssetId: string;
  fromAmount: string;
  fromDecimals?: number;
  toDecimals?: number;
}

interface TransferQuoteDisplayParams {
  quote: QuoteResponseV3 | QuoteResponseV1;
  assetId: string;
  amount: string;
  decimals?: number;
  recipientAccount: string;
}

/**
 * Display swap quote information in a consistent format
 *
 * @param params - The swap quote display parameters
 */
export function displaySwapQuote(params: SwapQuoteDisplayParams): void {
  const { quote, fromAssetId, toAssetId, fromAmount, fromDecimals, toDecimals } = params;

  const formattedFromAmount = fromDecimals
    ? formatUnits(BigInt(fromAmount), fromDecimals)
    : fromAmount;

  const destinationDecimals = toDecimals || quote.destinationToken?.decimals || 18;

  const willReceive = quote.destinationToken
    ? `${formatUnits(BigInt(quote.destinationToken.amount), destinationDecimals)} ${toAssetId}`
    : 'Unknown amount';

  const fiatValue = quote.destinationToken
    ? `$${quote.destinationToken.fiatValue}`
    : 'Unknown value';

  console.log('✅ Quote received:', {
    id: quote.id,
    from: `${formattedFromAmount} ${fromAssetId}`,
    willReceive,
    fiatValue,
  });
}

/**
 * Display transfer quote information in a consistent format
 *
 * @param params - The transfer quote display parameters
 */
export function displayTransferQuote(params: TransferQuoteDisplayParams): void {
  const { quote, assetId, amount, decimals, recipientAccount } = params;

  const formattedAmount = decimals ? formatUnits(BigInt(amount), decimals) : amount;

  const willReceive = quote.destinationToken
    ? formatUnits(BigInt(quote.destinationToken.amount), decimals || 18)
    : 'Unknown amount';

  const fiatValue = quote.destinationToken
    ? `$${quote.destinationToken.fiatValue}`
    : 'Unknown value';

  console.log('✅ Quote received:', {
    id: quote.id,
    sending: `${formattedAmount} ${assetId}`,
    to: recipientAccount,
    willReceive,
    fiatValue,
  });
}
