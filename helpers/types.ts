import { HashTypedDataParameters } from 'viem';
import { Keypair } from '@solana/web3.js';

export type Hex = `0x${string}`;

export enum DelegationSignatureType {
  Signed = 'Signed',
  Unsigned = 'Unsigned',
}

export enum ContractAccountType {
  RoleBased = 'role-based',
  KernelV31 = 'kernel-v3.1-ecdsa',
  KernelV33 = 'kernel-v3.3-ecdsa',
  Solana = 'solana',
}

// OneBalance API Types

// Account Types
export interface RoleBasedAccount {
  type: 'role-based';
  sessionAddress: Hex;
  adminAddress: Hex;
  accountAddress: Hex;
}

export interface StandardAccount {
  type: 'kernel-v3.1-ecdsa';
  signerAddress: Hex;
  accountAddress: Hex;
}

export interface EIP7702Account {
  type: 'kernel-v3.3-ecdsa';
  deploymentType: 'EIP7702';
  accountAddress: Hex;
  signerAddress: Hex;
}

export interface SolanaAccount {
  type: 'solana';
  accountAddress: string;
}

export type Account = RoleBasedAccount | StandardAccount | EIP7702Account | SolanaAccount;

// Predict Address Types
export interface PredictAddressRoleBasedRequest {
  sessionAddress: Hex;
  adminAddress: Hex;
}

export interface PredictAddressStandardRequest {
  type: string;
  signerAddress: Hex;
}

export interface PredictAddressResponse {
  predictedAddress: Hex;
}

// Asset Types
export interface Asset {
  assetId: string;
}

// Swap operation parameters
export interface SwapParams {
  fromAssetId: string;
  toAssetId: string;
  amount: string;
  decimals?: number;
  slippageTolerance?: number;
  recipientAccount?: string;
}

// Aggregated asset information
export interface AggregatedAsset {
  aggregatedAssetId: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  aggregatedEntities: IndividualAsset[];
}

// Quote Request Types (V1)
export interface QuoteRequestV1 {
  from: {
    account: Account;
    asset: Asset;
    amount: string;
  };
  to: {
    asset: Asset;
    account?: string;
  };
  slippageTolerance?: number;
}

// Quote Request Types (V3)
export interface QuoteRequestV3 {
  from: {
    accounts: Account[];
    asset: Asset;
    amount: string;
  };
  to: {
    asset: Asset;
    account?: string;
  };
  slippageTolerance?: number;
}

// Token Information
export interface OriginTokenInfo {
  aggregatedAssetId: string;
  amount: string;
  assetType: string[] | string;
  fiatValue:
    | Array<{
        assetType: string;
        fiatValue: string;
      }>
    | string;
}

export interface DestinationTokenInfo {
  aggregatedAssetId: string;
  amount: string;
  assetType: string;
  fiatValue: string;
  minimumAmount?: string;
  minimumFiatValue?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  recipientAccount?: string;
}

// Quote Response Types (V1)
export interface QuoteResponseV1 {
  id: string;
  account: Account;
  originChainsOperations: ChainOperation[];
  destinationChainOperation?: ChainOperation;
  originToken?: OriginTokenInfo;
  destinationToken?: DestinationTokenInfo;
  validUntil?: string;
  validAfter?: string;
  expirationTimestamp: string;
  tamperProofSignature: string;
}

// Quote Response Types (V3)
export interface QuoteResponseV3 {
  id: string;
  accounts: Account[];
  originChainsOperations: Array<ChainOperation | SolanaOperation>;
  destinationChainOperation?: ChainOperation;
  originToken?: OriginTokenInfo;
  destinationToken?: DestinationTokenInfo;
  expirationTimestamp: string;
  slippage?: {
    origin: {
      percent: string;
      usd: string;
      value: string;
    };
    destination: {
      percent: string;
      usd: string;
      value: string;
    };
  };
  fees?: {
    assets: Record<string, string>;
    cumulativeUSD: string;
  };
  tamperProofSignature: string;
}

// Solana Operation Types
export interface SolanaOperation {
  type: 'solana';
  instructions: Array<{
    keys: Array<{
      pubkey: string;
      isSigner: boolean;
      isWritable: boolean;
    }>;
    programId: string;
    data: string;
  }>;
  recentBlockHash: string;
  feePayer: string;
  signature?: string;
  addressLookupTableAddresses?: string[];
  assetType: string;
  amount: string;
  dataToSign?: string;
}

// Balance Types

// Individual asset within an aggregated asset
export interface IndividualAsset {
  assetType: string;
  decimals: number;
  name: string;
  symbol: string;
}

// Individual asset balance within an aggregated asset
export interface IndividualAssetBalance {
  assetType: string;
  balance: string;
  fiatValue: number;
}

// Aggregated asset balance entry
export interface AggregatedAssetBalance {
  aggregatedAssetId: string;
  balance: string;
  individualAssetBalances: IndividualAssetBalance[];
  fiatValue: number;
}

// Specific asset balance entry
export interface SpecificAssetBalance {
  assetType: string;
  balance: string;
  fiatValue: number;
}

// Total balance summary
export interface TotalBalance {
  fiatValue: number;
}

// V2 aggregated balance response
export interface AggregatedBalanceResponseV2 {
  balanceByAggregatedAsset: AggregatedAssetBalance[];
  balanceBySpecificAsset: SpecificAssetBalance[];
  totalBalance: TotalBalance;
}

// V3 aggregated balance request parameters
export interface AggregatedBalanceRequestV3 {
  account: string;
  aggregatedAssetId?: string;
  assetId?: string;
}

// V3 aggregated balance response
export interface AggregatedBalanceResponseV3 {
  accounts?: {
    evm?: string;
    solana?: string;
  };
  balanceByAggregatedAsset: AggregatedAssetBalance[];
  balanceBySpecificAsset: SpecificAssetBalance[];
  totalBalance: TotalBalance;
}

// Operation details for V3 endpoints
export interface OperationDetailsV3 {
  hash: string;
  chain: string;
  explorerUrl: string;
}

export interface ExecutionStatusResponseV3 {
  quoteId: string;
  status: OperationStatus;
  user: string;
  recipientAccountId: string;
  failReason?: string;
  originChainOperations: OperationDetailsV3[];
  destinationChainOperations?: OperationDetailsV3[];
}

// Transaction History Types
export interface HistoryTransactionV3 {
  quoteId: string;
  status: OperationStatus;
  user: string;
  recipientAccountId: string;
  originChainOperations: OperationDetailsV3[];
  destinationChainOperations?: OperationDetailsV3[];
  type: TransactionType;
  originToken?: OriginTokenInfo;
  destinationToken?: DestinationTokenInfo;
  timestamp: string;
}

export interface HistoryResponseV3 {
  transactions: HistoryTransactionV3[];
  continuation?: string;
}

// Chain Types
export interface ChainInfo {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
  testnet?: boolean;
}

// Call Quote Types (V3)
export interface PrepareCallRequestV3 {
  accounts: Account[];
  targetChain: string;
  calls: Array<{
    to: Hex;
    data?: Hex;
    value?: Hex;
  }>;
  tokensRequired?: Array<{
    assetType: string;
    amount: string;
  }>;
  allowanceRequirements?: Array<{
    assetType: string;
    amount: string;
    spender: Hex;
  }>;
  overrides?: Array<{
    address: Hex;
    balance?: Hex;
    code?: Hex;
    stateDiff?: Record<Hex, Hex>;
  }>;
  validAfter?: string;
  validUntil?: string;
  fromAssetId?: string;
  slippageTolerance?: number;
}

export enum CallType {
  SameChainExcludeSolver = 'same_chain_exclude_solver',
  CrossChainWithSolver = 'cross_chain_with_solver',
  SameChainWithSolver = 'same_chain_with_solver',
  CrossChainWithSolverAndSwaps = 'cross_chain_with_solver_and_swaps',
}

export interface TargetCallQuoteV3 {
  accounts: Account[];
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  callType?: CallType | string;
  sourceAssetBalances?: Array<{
    assetType: string;
    balance: string;
    decimals: number;
    fiatValue: number;
  }>;
  delegation?: Delegation;
}

export interface CallRequestV3 {
  accounts: Account[];
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  fromAggregatedAssetId?: string;
  fromAssetId?: string;
  slippageTolerance?: number;
}

export interface CallQuoteResponseV3 {
  id: string;
  accounts: Account[];
  originChainsOperations: Array<ChainOperation | SolanaOperation>;
  destinationChainOperation?: ChainOperation;
  originToken?: OriginTokenInfo;
  destinationToken?: DestinationTokenInfo;
  expirationTimestamp: string;
  slippage?: {
    origin: {
      percent: string;
      usd: string;
      value: string;
    };
    destination: {
      percent: string;
      usd: string;
      value: string;
    };
  };
  fees?: {
    assets: Record<string, string>;
    cumulativeUSD: string;
  };
  tamperProofSignature: string;
}

export type EvmAccount = RoleBasedAccount | StandardAccount | EIP7702Account;

export interface EvmCall {
  to: Hex;
  value?: Hex;
  data?: Hex;
}

export interface TokenRequirement {
  assetType: string;
  amount: string;
}

export interface TokenAllowanceRequirement extends TokenRequirement {
  spender: Hex;
}

export type StateMapping = {
  [slot: Hex]: Hex;
};

export type StateDiff = {
  stateDiff?: StateMapping;
  code?: Hex;
  balance?: Hex;
};

export type Override = StateDiff & {
  address: Hex;
};

export interface DelegationSignature {
  chainId: number;
  contractAddress: Hex;
  nonce: number;
  r: Hex;
  s: Hex;
  v: Hex;
  yParity: number;
  type: DelegationSignatureType;
}

export interface Delegation {
  contractAddress: Hex;
  nonce: number;
  signature?: DelegationSignature;
}

export interface SerializedUserOperation {
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

export interface ChainOperation {
  userOp: SerializedUserOperation;
  typedDataToSign: HashTypedDataParameters;
  assetType: string;
  amount: string;
  delegation?: Delegation;
}

export interface PrepareCallRequest {
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

export interface TargetCallQuote {
  account: EvmAccount;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
}

export interface CallRequest {
  account: EvmAccount;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  fromAggregatedAssetId?: string;
}

export interface AssetUsed {
  aggregatedAssetId: string;
  assetType: string[] | string;
  amount: string;
  minimumAmount?: string;
}

export interface FiatValue {
  fiatValue: string;
  amount: string;
}

export interface OriginAssetUsed extends AssetUsed {
  assetType: string[];
  fiatValue: FiatValue[];
}

export interface DestinationAssetUsed extends AssetUsed {
  assetType: string;
  fiatValue: string;
  minimumAmount?: string;
  minimumFiatValue?: string;
}

export interface Quote {
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

export interface OpGuarantees {
  non_equivocation: boolean;
  reorg_protection: boolean;
  valid_until?: number;
  valid_after?: number;
}

export type BundleGuarantees = Record<Hex, OpGuarantees>;

export interface BundleResponse {
  success: boolean;
  guarantees: BundleGuarantees | null;
  error: string | null;
}

export type TransactionType = 'SWAP' | 'TRANSFER' | 'CALL';

// Operation execution status
export type OperationStatus =
  | 'PENDING' // Operation has been submitted but processing has not yet begun
  | 'IN_PROGRESS' // Currently processing the execution steps of the operation
  | 'EXECUTED' // Transaction has been executed on the destination chain but origin chain operations may still be pending
  | 'COMPLETED' // All operations on both origin and destination chains have been completed successfully
  | 'REFUNDED' // Operation failed at some step, causing the whole operation to be refunded
  | 'FAILED'; // All steps of the operation failed

// Operation transaction details
export interface OperationDetails {
  hash: string;
  chainId: number;
  chain: string;
  explorerUrl: string;
}

export interface HistoryTransaction {
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

export interface HistoryResponse {
  transactions: HistoryTransaction[];
  continuation?: string;
}

export interface ExecutionStatusResponse {
  id: string;
  status: OperationStatus;
  createdAt: string;
  updatedAt: string;
}

// Chain Types

// Chain entity identifier
export interface ChainEntity {
  chain: string; // CAIP-2 format like "eip155:42161"
  namespace: string; // e.g., "eip155", "solana"
  reference: string; // e.g., "42161", "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
}

// Supported blockchain network
export interface SupportedChain {
  chain: ChainEntity;
  isTestnet: boolean;
}

// Crypto Key Types
export interface EOAKeyPair {
  privateKey: Hex;
  address: Hex;
}

export interface SolanaKeyPair {
  keypair: Keypair;
  publicKey: string;
  secretKey: number[];
}
