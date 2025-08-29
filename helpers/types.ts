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
