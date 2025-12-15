import { formatUnits } from 'viem';
import { fetchAggregatedBalanceV3 } from './onebalance';
import { isSolanaAsset, formatSolanaAssetSymbol } from './solana';

/**
 * Balance-related utility functions for OneBalance operations
 */

/**
 * Helper to detect if an address is a Solana address
 * Solana addresses are base58 encoded and don't start with 0x
 */
function isSolanaAddress(address: string): boolean {
  // Ethereum addresses start with 0x and are 42 characters
  // Solana addresses are base58 and typically 32-44 characters without 0x
  return !address.startsWith('0x') && address.length >= 32 && address.length <= 44;
}

/**
 * Universal balance checker that works with both aggregated assets and regular asset IDs
 * Supports both EVM and Solana accounts automatically
 *
 * @param accountAddress - The account address to check balance for
 * @param assetId - The asset ID to check (aggregated or specific)
 * @param decimals - Number of decimals for the asset (default: 18)
 * @returns The formatted balance as a number
 */
export async function checkAssetBalance(
  accountAddress: string,
  assetId: string,
  decimals: number = 18,
): Promise<number> {
  try {
    console.log(`🔍 Checking balance for asset: ${assetId}...`);

    // Determine account format based on account address type
    let accountIdentifier: string;
    const isSolana = isSolanaAddress(accountAddress);

    if (isSolana) {
      // For Solana accounts, use solana: prefix
      accountIdentifier = accountAddress.startsWith('solana:')
        ? accountAddress
        : `solana:${accountAddress}`;
    } else if (assetId.startsWith('eip155:')) {
      // For chain-specific EIP-155 assets, extract the chain ID
      const chainId = assetId.split('/')[0]; // Gets 'eip155:42161' from 'eip155:42161/erc20:...'
      accountIdentifier = `${chainId}:${accountAddress}`;
    } else {
      // For aggregated assets or other cases, use Arbitrum as default chain for EVM
      accountIdentifier = `eip155:42161:${accountAddress}`;
    }

    // Call API with correct parameter based on asset type
    let response;
    if (assetId.startsWith('ob:')) {
      // For aggregated assets, pass as aggregatedAssetId
      response = await fetchAggregatedBalanceV3(accountIdentifier, assetId);
    } else {
      // For specific assets, pass as assetId (third parameter)
      response = await fetchAggregatedBalanceV3(accountIdentifier, undefined, assetId);
    }

    let balance: string | undefined;
    let assetSymbol: string = assetId;

    // Check if it's an aggregated asset (starts with 'ob:')
    if (assetId.startsWith('ob:')) {
      const aggregatedBalance = response.balanceByAggregatedAsset?.find(
        (asset) => asset.aggregatedAssetId === assetId,
      );
      if (aggregatedBalance) {
        balance = aggregatedBalance.balance;
        assetSymbol = assetId.replace('ob:', '').toUpperCase();
      }
    } else {
      // For specific asset IDs, check in balanceBySpecificAsset
      const specificBalance = response.balanceBySpecificAsset?.find(
        (asset) => asset.assetType === assetId,
      );
      if (specificBalance) {
        balance = specificBalance.balance;

        // Format symbol based on asset type
        if (isSolanaAsset(assetId)) {
          assetSymbol = formatSolanaAssetSymbol(assetId);
        } else {
          // Extract symbol from EVM asset ID for display
          if (assetId.includes('/token:')) {
            const tokenAddress = assetId.split('/token:')[1];
            assetSymbol = `TOKEN-${tokenAddress.slice(0, 6)}...`; // Show first 6 chars of token address
          } else if (assetId.includes('/erc20:')) {
            const tokenAddress = assetId.split('/erc20:')[1];
            assetSymbol = `ERC20-${tokenAddress.slice(0, 6)}...`; // Show first 6 chars of token address
          } else if (assetId.includes('/slip44:')) {
            const slip44Code = assetId.split('/slip44:')[1];
            // Common SLIP-44 codes for display
            const slip44Map: Record<string, string> = {
              '60': 'ETH',
              '501': 'SOL',
              '0': 'BTC',
            };
            assetSymbol = slip44Map[slip44Code] || `SLIP44-${slip44Code}`;
          } else {
            assetSymbol = assetId.split(':').pop()?.toUpperCase() || assetId;
          }
        }
      }
    }

    if (!balance) {
      console.log(`❌ No balance found for asset: ${assetId}`);
      return 0;
    }

    const formattedBalance = parseFloat(formatUnits(BigInt(balance), decimals));
    console.log(
      `💰 Available ${assetSymbol} balance: ${formattedBalance.toFixed(6)} ${assetSymbol}`,
    );

    return formattedBalance;
  } catch (error) {
    console.error(`Failed to check balance for ${assetId}:`, error);
    throw error;
  }
}

/**
 * Checks asset balance across both EVM and Solana accounts
 * Supports both aggregated assets (ob:usdc) and specific assets (chain:address/token:address)
 *
 * @param evmAccountAddress - The EVM account address
 * @param solanaAccountAddress - The Solana account address
 * @param assetId - The asset ID to check (aggregated or specific)
 * @param decimals - Number of decimals for the asset (default: 18)
 * @returns The total balance across both chains
 */
export async function checkCrossChainBalance(
  evmAccountAddress: string,
  solanaAccountAddress: string,
  assetId: string,
  decimals: number = 18,
): Promise<number> {
  try {
    console.log(`🔍 Checking cross-chain balance for ${assetId}...`);

    // Format account identifier for multi-chain query
    const accountIdentifier = `eip155:42161:${evmAccountAddress},solana:${solanaAccountAddress}`;

    // Determine if this is an aggregated asset or specific asset
    const isAggregatedAsset = assetId.startsWith('ob:');

    // Call API with correct parameter based on asset type
    let response;
    if (isAggregatedAsset) {
      response = await fetchAggregatedBalanceV3(accountIdentifier, assetId);
    } else {
      response = await fetchAggregatedBalanceV3(accountIdentifier, undefined, assetId);
    }

    let balance: string | undefined;
    let symbol: string = assetId;

    if (isAggregatedAsset) {
      // Handle aggregated asset response
      const aggregatedBalance = response.balanceByAggregatedAsset?.find(
        (asset) => asset.aggregatedAssetId === assetId,
      );

      if (!aggregatedBalance) {
        console.log(`❌ No balance found for ${assetId}`);
        return 0;
      }

      balance = aggregatedBalance.balance;
      symbol = assetId.replace('ob:', '').toUpperCase();

      const formattedBalance = parseFloat(formatUnits(BigInt(balance), decimals));

      console.log(`💰 Total ${symbol} balance: ${formattedBalance.toFixed(6)}`);
      console.log(`   EVM chains: ${response.accounts?.evm || evmAccountAddress}`);
      console.log(`   Solana: ${response.accounts?.solana || solanaAccountAddress}`);

      // Show breakdown by chain
      if (aggregatedBalance.individualAssetBalances?.length > 0) {
        console.log(`\n   Distribution:`);
        aggregatedBalance.individualAssetBalances.forEach((chainBalance) => {
          if (parseFloat(chainBalance.balance) > 0) {
            const amount = parseFloat(formatUnits(BigInt(chainBalance.balance), decimals));
            const chainName = chainBalance.assetType.includes('solana')
              ? 'Solana'
              : chainBalance.assetType.split('/')[0].replace('eip155:', 'Chain ');
            console.log(`     ${chainName}: ${amount.toFixed(6)} ${symbol}`);
          }
        });
      }

      return formattedBalance;
    } else {
      // Handle specific asset response
      const specificBalance = response.balanceBySpecificAsset?.find(
        (asset) => asset.assetType === assetId,
      );

      if (!specificBalance) {
        console.log(`❌ No balance found for ${assetId}`);
        return 0;
      }

      balance = specificBalance.balance;

      // Format symbol based on asset type
      if (isSolanaAsset(assetId)) {
        symbol = formatSolanaAssetSymbol(assetId);
      } else if (assetId.includes('/erc20:')) {
        const tokenAddress = assetId.split('/erc20:')[1];
        symbol = `ERC20-${tokenAddress.slice(0, 6)}...`;
      } else if (assetId.includes('/token:')) {
        const tokenAddress = assetId.split('/token:')[1];
        symbol = `TOKEN-${tokenAddress.slice(0, 6)}...`;
      } else if (assetId.includes('/slip44:')) {
        const slip44Code = assetId.split('/slip44:')[1];
        const slip44Map: Record<string, string> = {
          '60': 'ETH',
          '501': 'SOL',
          '0': 'BTC',
        };
        symbol = slip44Map[slip44Code] || `SLIP44-${slip44Code}`;
      }

      const formattedBalance = parseFloat(formatUnits(BigInt(balance), decimals));

      console.log(`💰 Available ${symbol} balance: ${formattedBalance.toFixed(6)}`);
      console.log(`   Asset: ${assetId}`);

      return formattedBalance;
    }
  } catch (error) {
    console.error(`Failed to check cross-chain balance:`, error);
    throw error;
  }
}

/**
 * Checks multiple asset balances concurrently
 *
 * @param accountAddress - The account address to check balances for
 * @param assets - Array of assets to check, each with assetId and optional decimals
 * @returns Array of balance results with assetId and balance
 */
export async function checkMultipleAssetBalances(
  accountAddress: string,
  assets: Array<{ assetId: string; decimals?: number }>,
): Promise<Array<{ assetId: string; balance: number; symbol: string }>> {
  const balancePromises = assets.map(async (asset) => {
    try {
      const balance = await checkAssetBalance(accountAddress, asset.assetId, asset.decimals);
      let symbol = asset.assetId;

      if (asset.assetId.startsWith('ob:')) {
        symbol = asset.assetId.replace('ob:', '').toUpperCase();
      } else if (isSolanaAsset(asset.assetId)) {
        symbol = formatSolanaAssetSymbol(asset.assetId);
      }

      return {
        assetId: asset.assetId,
        balance,
        symbol,
      };
    } catch (error) {
      console.error(`Failed to check balance for ${asset.assetId}:`, error);
      return {
        assetId: asset.assetId,
        balance: 0,
        symbol: asset.assetId,
      };
    }
  });

  return Promise.all(balancePromises);
}

/**
 * Formats a balance for display with appropriate decimal places
 *
 * @param balance - The balance as a number
 * @param symbol - The asset symbol
 * @param maxDecimals - Maximum number of decimal places to show (default: 6)
 * @returns Formatted balance string
 */
export function formatBalanceDisplay(
  balance: number,
  symbol: string,
  maxDecimals: number = 6,
): string {
  return `${balance.toFixed(maxDecimals)} ${symbol}`;
}
