import {
  evmAddress,
  chainId,
  AaveClient,
  EvmAddress,
  ChainId,
  Vault,
  PaginatedVaultsResult,
  PageSize,
  MarketUserReserveSupplyPosition,
  MarketUserReserveBorrowPosition,
} from '@aave/client';
import { vault, vaults, userVaults, userSupplies, userBorrows } from '@aave/client/actions';
import { AaveV3Arbitrum } from '@bgd-labs/aave-address-book';
import { loadMultiChainAccounts } from '../helpers';

const client = AaveClient.create();

/**
 * Display vault details
 */
function displayVaultDetails(v: Vault): void {
  console.log('✅ Vault found:');
  console.log(`  - Address: ${v.address}`);
  console.log(`  - Owner: ${v.owner}`);
  console.log(`  - Name: ${v.shareName}`);
  console.log(`  - Symbol: ${v.shareSymbol}`);
  console.log(`  - Chain ID: ${v.chainId}`);
  console.log(`  - Balance: ${v.balance.amount.value}`);
  console.log(`  - Balance (USD): $${v.balance.usd}`);
  console.log(`  - Fee: ${v.fee.formatted}%`);
  console.log(`  - Total Fee Revenue: ${v.totalFeeRevenue.amount.value}`);
  console.log(`  - Vault APR: ${v.vaultApr.formatted}%`);

  if (v.userShares) {
    console.log(`\n  👤 Your Position:`);
    console.log(`    - Shares: ${v.userShares.shares.amount.value}`);
    console.log(`    - Balance: ${v.userShares.balance.amount.value}`);
    console.log(`    - Balance (USD): $${v.userShares.balance.usd}`);
  } else {
    console.log('\n  ⚠️  You have no shares in this vault');
  }
}

/**
 * Fetch specific vault by address
 */
async function fetchVaultByAddress(
  vaultAddress: EvmAddress,
  userAddress: EvmAddress,
  targetChainId: ChainId,
): Promise<Vault | null> {
  console.log(`📊 Fetching vault: ${vaultAddress}\n`);

  const vaultResult = await vault(client, {
    by: {
      address: vaultAddress,
    },
    chainId: targetChainId,
    user: userAddress,
  });

  if (vaultResult.isErr()) {
    console.error('❌ Error fetching vault:', vaultResult.error);
    return null;
  }

  if (!vaultResult.value) {
    console.log('⚠️  Vault not found');
    return null;
  }

  displayVaultDetails(vaultResult.value);
  return vaultResult.value;
}

/**
 * Display vault summary
 */
function displayVaultSummary(v: Vault, index: number): void {
  console.log(`📦 Vault ${index + 1}:`);
  console.log(`  - Address: ${v.address}`);
  console.log(`  - Symbol: ${v.shareSymbol}`);
  console.log(`  - Balance: ${v.balance.amount.value}`);
  console.log(`  - APR: ${v.vaultApr.formatted}%`);
  console.log(`  - Fee: ${v.fee.formatted}%`);

  if (v.userShares) {
    console.log(`  - Your shares: ${v.userShares.shares.amount.value}`);
    console.log(`  - Your balance: ${v.userShares.balance.amount.value}`);
  }
  console.log('');
}

/**
 * List vaults owned by user with pagination
 */
async function listVaultsOwnedBy(
  ownerAddress: EvmAddress,
  userAddress: EvmAddress,
  pageSize: PageSize = PageSize.Ten,
): Promise<PaginatedVaultsResult> {
  console.log(`\n📊 Listing vaults owned by: ${ownerAddress}...\n`);

  const vaultsResult = await vaults(client, {
    criteria: {
      ownedBy: [ownerAddress],
    },
    user: userAddress,
    pageSize,
  });

  if (vaultsResult.isErr()) {
    console.error('❌ Error fetching vaults:', vaultsResult.error);
    throw vaultsResult.error;
  }

  const vaultsList: PaginatedVaultsResult = vaultsResult.value;
  console.log(`✅ Found ${vaultsList.items.length} vault(s)\n`);

  vaultsList.items.forEach((v, index) => {
    displayVaultSummary(v, index);
  });

  if (vaultsList.items.length === 0) {
    console.log('⚠️  No vaults found for this owner');
  }

  // Display pagination info
  if (vaultsList.pageInfo.next) {
    console.log(`📄 More results available (cursor: ${vaultsList.pageInfo.next})`);
  }
  if (vaultsList.pageInfo.prev) {
    console.log(`📄 Previous page available (cursor: ${vaultsList.pageInfo.prev})`);
  }

  return vaultsList;
}

/**
 * List specific vaults by addresses
 */
async function listSpecificVaults(
  vaultAddresses: EvmAddress[],
  userAddress: EvmAddress,
): Promise<Vault[]> {
  console.log(`\n📊 Listing ${vaultAddresses.length} specific vault(s)...\n`);

  const vaultsResult = await vaults(client, {
    criteria: {
      vaults: vaultAddresses.map((addr) => ({
        chainId: chainId(42161), // Arbitrum
        address: addr,
      })),
    },
    user: userAddress,
  });

  if (vaultsResult.isErr()) {
    console.error('❌ Error fetching vaults:', vaultsResult.error);
    return [];
  }

  const vaultsList: PaginatedVaultsResult = vaultsResult.value;
  console.log(`✅ Found ${vaultsList.items.length} vault(s)\n`);

  vaultsList.items.forEach((v, index) => {
    displayVaultSummary(v, index);
  });

  return vaultsList.items;
}

/**
 * List vaults where user has shares (participated vaults)
 */
async function listUserVaultPositions(
  userAddress: EvmAddress,
  pageSize: PageSize = PageSize.Fifty,
): Promise<PaginatedVaultsResult> {
  console.log(`\n📊 Listing vaults where you have shares...\n`);

  const vaultsResult = await userVaults(client, {
    user: userAddress,
    pageSize,
  });

  if (vaultsResult.isErr()) {
    console.error('❌ Error fetching user vaults:', vaultsResult.error);
    throw vaultsResult.error;
  }

  const vaultsList: PaginatedVaultsResult = vaultsResult.value;
  console.log(`✅ Found ${vaultsList.items.length} vault(s) with your shares\n`);

  vaultsList.items.forEach((v, index) => {
    displayVaultSummary(v, index);

    // Show participation details
    if (v.userShares) {
      const sharePercentage =
        (parseFloat(v.userShares.shares.amount.value) / parseFloat(v.balance.amount.value)) * 100;
      console.log(`  💡 Your share of vault: ${sharePercentage.toFixed(4)}%`);
    }
    console.log('');
  });

  if (vaultsList.items.length === 0) {
    console.log('⚠️  You have no vault positions yet');
  }

  // Display pagination info
  if (vaultsList.pageInfo.next) {
    console.log(`📄 More results available (cursor: ${vaultsList.pageInfo.next})`);
  }

  return vaultsList;
}

/**
 * List user supply positions across markets
 */
async function listUserSupplyPositions(
  marketAddress: EvmAddress,
  targetChainId: ChainId,
  userAddress: EvmAddress,
): Promise<MarketUserReserveSupplyPosition[]> {
  console.log(`\n📊 Fetching your supply positions...\n`);

  const suppliesResult = await userSupplies(client, {
    markets: [{ chainId: targetChainId, address: marketAddress }],
    user: userAddress,
  });

  if (suppliesResult.isErr()) {
    console.error('❌ Error fetching supplies:', suppliesResult.error);
    return [];
  }

  const supplies = suppliesResult.value;
  console.log(`✅ Found ${supplies.length} supply position(s)\n`);

  supplies.forEach((position, index) => {
    console.log(`💰 Supply ${index + 1}:`);
    console.log(`  - Market: ${position.market.name}`);
    console.log(`  - Asset: ${position.currency.symbol}`);
    console.log(`  - Balance: ${position.balance.amount.value} ${position.currency.symbol}`);
    console.log(`  - Value (USD): $${position.balance.usd}`);
    console.log(`  - APY: ${position.apy.formatted}%`);
    console.log(`  - Is Collateral: ${position.isCollateral ? 'Yes' : 'No'}`);
    console.log('');
  });

  if (supplies.length === 0) {
    console.log('⚠️  No supply positions found');
  }

  return supplies;
}

/**
 * List user borrow positions across markets
 */
async function listUserBorrowPositions(
  marketAddress: EvmAddress,
  targetChainId: ChainId,
  userAddress: EvmAddress,
): Promise<MarketUserReserveBorrowPosition[]> {
  console.log(`\n📊 Fetching your borrow positions...\n`);

  const borrowsResult = await userBorrows(client, {
    markets: [{ chainId: targetChainId, address: marketAddress }],
    user: userAddress,
  });

  if (borrowsResult.isErr()) {
    console.error('❌ Error fetching borrows:', borrowsResult.error);
    return [];
  }

  const borrows = borrowsResult.value;
  console.log(`✅ Found ${borrows.length} borrow position(s)\n`);

  borrows.forEach((position, index) => {
    console.log(`💳 Borrow ${index + 1}:`);
    console.log(`  - Market: ${position.market.name}`);
    console.log(`  - Asset: ${position.currency.symbol}`);
    console.log(`  - Debt: ${position.debt.amount.value} ${position.currency.symbol}`);
    console.log(`  - Value (USD): $${position.debt.usd}`);
    console.log(`  - APY: ${position.apy.formatted}%`);
    console.log('');
  });

  if (borrows.length === 0) {
    console.log('⚠️  No borrow positions found');
  }

  return borrows;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🚀 Testing AAVE Earn Vault Data\n');

  // Load EVM account
  const { evmAccount } = await loadMultiChainAccounts({
    needsEvm: true,
    needsSolana: false,
    sessionKeyName: 'session',
    evmAccountType: 'eip7702',
  });

  if (!evmAccount) {
    throw new Error('EVM account is required');
  }

  const userAddress = evmAddress(evmAccount.accountAddress);
  console.log(`👤 User: ${userAddress}\n`);
  console.log('='.repeat(60));

  // Example 1: List your supply positions on AAVE Arbitrum
  console.log('\n📋 Example 1: Supply Positions');
  const supplies = await listUserSupplyPositions(
    evmAddress(AaveV3Arbitrum.POOL),
    chainId(42161),
    userAddress,
  );
  console.log('📄 JSON Output:');
  console.log(JSON.stringify(supplies, null, 2));

  // Example 2: List your borrow positions on AAVE Arbitrum
  console.log('\n📋 Example 2: Borrow Positions');
  const borrows = await listUserBorrowPositions(
    evmAddress(AaveV3Arbitrum.POOL),
    chainId(42161),
    userAddress,
  );
  console.log('📄 JSON Output:');
  console.log(JSON.stringify(borrows, null, 2));

  // Example 3: List vaults where you have shares (participated vaults)
  console.log('\n📋 Example 3: User Vault Positions (vaults with your shares)');
  const userVaultPositions = await listUserVaultPositions(userAddress, PageSize.Ten);
  console.log('📄 JSON Output:');
  console.log(JSON.stringify(userVaultPositions, null, 2));

  // Example 4: List vaults owned by you
  console.log('\n📋 Example 4: Vaults Owned By You');
  const ownedVaults = await listVaultsOwnedBy(userAddress, userAddress, PageSize.Ten);
  console.log('📄 JSON Output:');
  console.log(JSON.stringify(ownedVaults, null, 2));

  // Example 5: Fetch specific vault by address (replace with real vault address)
  // Note: This will likely return null unless you have a specific vault address
  console.log('\n📋 Example 5: Fetch Specific Vault');
  const specificVault = await fetchVaultByAddress(
    evmAddress('0x1234567890abcdef1234567890abcdef12345678'),
    userAddress,
    chainId(42161), // Arbitrum
  );
  console.log('📄 JSON Output:');
  console.log(JSON.stringify(specificVault, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Summary:`);
  console.log(`  - Supply positions: ${supplies.length}`);
  console.log(`  - Borrow positions: ${borrows.length}`);
  console.log(`  - Vaults with shares: ${userVaultPositions.items.length}`);
  console.log(`  - Vaults owned: ${ownedVaults.items.length}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });
}
