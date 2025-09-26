/**
 * Solana-specific utility functions for OneBalance operations
 */

/**
 * Helper function to detect if Solana is involved in a swap operation
 *
 * @param fromAssetId - The source asset ID to check
 * @param toAssetId - The destination asset ID to check
 * @returns True if any of the assets involve Solana
 */
export function isSolanaInvolved(fromAssetId: string, toAssetId: string): boolean {
  return (
    fromAssetId.startsWith('solana:') ||
    toAssetId.startsWith('solana:') ||
    fromAssetId === 'ds:sol' ||
    toAssetId === 'ds:sol'
  );
}

/**
 * Checks if a given asset ID is a Solana-based asset
 *
 * @param assetId - The asset ID to check
 * @returns True if the asset is Solana-based
 */
export function isSolanaAsset(assetId: string): boolean {
  return assetId.startsWith('solana:') || assetId === 'ds:sol';
}

/**
 * Extracts Solana token address from asset ID
 *
 * @param assetId - Solana asset ID in format 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
 * @returns Token address or null if not a valid Solana token asset
 */
export function extractSolanaTokenAddress(assetId: string): string | null {
  if (!assetId.startsWith('solana:')) {
    return null;
  }

  const parts = assetId.split('/token:');
  return parts.length === 2 ? parts[1] : null;
}

/**
 * Formats Solana asset symbol for display purposes
 *
 * @param assetId - The Solana asset ID
 * @returns Formatted symbol for display
 */
export function formatSolanaAssetSymbol(assetId: string): string {
  if (assetId === 'ds:sol') {
    return 'SOL';
  }

  if (assetId.startsWith('solana:')) {
    const tokenAddress = extractSolanaTokenAddress(assetId);
    if (tokenAddress) {
      return `SOL-${tokenAddress.slice(0, 6)}...`;
    }

    // Handle SLIP-44 format
    if (assetId.includes('/slip44:')) {
      const slip44Code = assetId.split('/slip44:')[1];
      const slip44Map: Record<string, string> = {
        '501': 'SOL',
        '0': 'BTC',
        '60': 'ETH',
      };
      return slip44Map[slip44Code] || `SLIP44-${slip44Code}`;
    }
  }

  return assetId;
}
