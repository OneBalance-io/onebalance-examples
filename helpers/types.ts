import { HashTypedDataParameters } from 'viem';

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

// OneBalance API Types based on OpenAPI spec

// Account Types
export interface RoleBasedAccount {
  type: 'role-based';
  sessionAddress: Hex;
  adminAddress: Hex;
  accountAddress: Hex;
}

export interface BasicAccount {
  type: 'kernel-v3.1-ecdsa';
  signerAddress: Hex;
  accountAddress: Hex;
}

export interface KernelV33Account {
  type: 'kernel-v3.3-ecdsa';
  deploymentType: 'EIP7702';
  accountAddress: Hex;
  signerAddress: Hex;
}

export interface SolanaAccount {
  type: 'solana';
  accountAddress: string;
}

export type Account = RoleBasedAccount | BasicAccount | KernelV33Account | SolanaAccount;

// Predict Address Types
export interface PredictAddressRoleBasedRequest {
  sessionAddress: Hex;
  adminAddress: Hex;
}

export interface PredictAddressBasicRequest {
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

export interface AggregatedAsset {
  aggregatedAssetId: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  aggregatedEntities: Array<{
    assetType: string;
    decimals: number;
    name: string;
    symbol: string;
  }>;
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
  fiatValue: Array<{
    assetType: string;
    fiatValue: string;
  }> | string;
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
export interface AggregatedBalanceResponseV3 {
  accounts?: {
    evm?: Hex;
    solana?: string;
  };
  balanceByAggregatedAsset: Array<{
    aggregatedAssetId: string;
    balance: string;
    individualAssetBalances: Array<{
      assetType: string;
      balance: string;
      fiatValue: number;
    }>;
    fiatValue: number;
  }>;
  balanceBySpecificAsset: Array<{
    assetType: string;
    balance: string;
    fiatValue: number;
  }>;
  totalBalance: {
    fiatValue: number;
  };
}

// Execution Status Types (updated from OpenAPI spec)
export interface OperationDetailsV3 {
  hash: string;
  chain?: string;
  chainId?: number;
  explorerUrl?: string;
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
export interface CallRequestV3 {
  account: Account;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  fromAggregatedAssetId?: string;
  slippageTolerance?: number;
}

export interface PrepareCallRequestV3 {
  account: Account;
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
  slippageTolerance?: number;
}

export interface TargetCallQuoteV3 {
  account: Account;
  chainOperation: ChainOperation;
  tamperProofSignature: string;
  callType?: string;
  sourceAssetBalances?: Array<{
    assetType: string;
    balance: string;
    decimals: number;
    fiatValue: number;
  }>;
  delegation?: Delegation;
}

export interface EvmAccount {
  type: 'kernel-v3.3-ecdsa';
  deploymentType: 'EIP7702';
  accountAddress: Hex;
  signerAddress: Hex; // Same as accountAddress for 7702
}

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

export type OperationStatus =
  | 'PENDING' // not yet begun processing but has been submitted
  | 'IN_PROGRESS' // processing the execution steps of the operation
  | 'COMPLETED' // all steps completed with success
  | 'REFUNDED' // none or some steps completed, some required step failed causing the whole operation to be refunded
  | 'FAILED'; // all steps failed

export interface OperationDetails {
  hash?: Hex;
  chainId?: number;
  explorerUrl?: string;
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
