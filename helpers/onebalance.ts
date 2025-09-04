import {
  PrepareCallRequest,
  TargetCallQuote,
  CallRequest,
  Quote,
  BundleResponse,
  HistoryResponse,
  ExecutionStatusResponse,
  ChainOperation,
  Hex,
  ContractAccountType,
  DelegationSignatureType,
  SerializedUserOperation,
} from './types';
import { apiPost, apiGet } from './api';
import { PrivateKeyAccount } from 'viem';
import { entryPoint07Address, getUserOperationHash, UserOperation } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import { MessageV0, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

// OneBalance API methods
export async function prepareCallQuote(quoteRequest: PrepareCallRequest): Promise<TargetCallQuote> {
  return apiPost<PrepareCallRequest, TargetCallQuote>('/api/quotes/prepare-call-quote', quoteRequest);
}

export async function fetchCallQuote(callRequest: CallRequest): Promise<Quote> {
  return apiPost<CallRequest, Quote>('/api/quotes/call-quote', callRequest);
}

export async function executeQuote(quote: Quote): Promise<BundleResponse> {
  return apiPost<Quote, BundleResponse>('/api/quotes/execute-quote', quote);
}

// V3 quote endpoint that supports Solana and multi-account operations
export async function getQuoteV3(quoteRequest: any): Promise<any> {
  return apiPost<any, any>('/api/v3/quote', quoteRequest);
}

// V3 execute quote endpoint that supports Solana and multi-account operations
export async function executeQuoteV3(signedQuote: any): Promise<any> {
  return apiPost<any, any>('/api/v3/quote/execute-quote', signedQuote);
}

export async function fetchTransactionHistory(address: string): Promise<HistoryResponse> {
  return apiGet<{ user: string; limit: number; sortBy: string }, HistoryResponse>('/api/status/get-tx-history', {
    user: address,
    limit: 10,
    sortBy: 'createdAt',
  });
}

export async function fetchBalances(address: string) {
  const response = await apiGet<
    { address: string },
    {
      balanceByAggregatedAsset: {
        aggregatedAssetId: string;
        balance: string;
        individualAssetBalances: { 
          assetType: string; 
          balance: string; 
          fiatValue: number 
        }[];
        fiatValue: number;
      }[];
      balanceBySpecificAsset: {
        assetType: string;
        balance: string;
        fiatValue: number;
      }[];
      totalBalance: {
        fiatValue: number;
      };
    }
  >('/api/v2/balances/aggregated-balance', { address });
  return response;
}

// V3 aggregated balance that supports Solana accounts
export async function fetchAggregatedBalanceV3(
  account: string,
  aggregatedAssetId?: string,
  assetId?: string
) {
  const params: any = { account };
  
  if (aggregatedAssetId) {
    params.aggregatedAssetId = aggregatedAssetId;
  }
  
  if (assetId) {
    params.assetId = assetId;
  }

  const response = await apiGet<
    typeof params,
    {
      balanceByAggregatedAsset: {
        aggregatedAssetId: string;
        balance: string;
        individualAssetBalances: { 
          assetType: string; 
          balance: string; 
          fiatValue: number 
        }[];
        fiatValue: number;
      }[];
      balanceBySpecificAsset: {
        assetType: string;
        balance: string;
        fiatValue: number;
      }[];
      totalBalance: {
        fiatValue: number;
      };
    }
  >('/api/v3/balances/aggregated-balance', params);
  return response;
}

export async function fetchUSDCBalance(address: string) {
  const response = await fetchBalances(address);
  return response.balanceByAggregatedAsset.find((asset) => asset.aggregatedAssetId === 'ds:usdc');
}

export async function fetchExecutionStatus(quoteId: string): Promise<ExecutionStatusResponse> {
  return apiGet<{ quoteId: string }, ExecutionStatusResponse>('/api/status/get-execution-status', {
    quoteId,
  });
}

export async function monitorTransactionCompletion(quote: Quote): Promise<void> {
  console.log('\n🔍 Monitoring transaction completion...');
  console.log('Quote ID:', quote.id);
  
  const timeout = 60_000; // 60 seconds
  const startTime = Date.now();
  let completed = false;

  while (!completed && (Date.now() - startTime < timeout)) {
    try {
      const executionStatus = await fetchExecutionStatus(quote.id);
      console.log(`📊 Current status: ${executionStatus.status}`);

      if (executionStatus.status === 'COMPLETED') {
        console.log('🎉 Transaction completed successfully!');
        completed = true;
        break;
      } else if (executionStatus.status === 'FAILED' || executionStatus.status === 'REFUNDED') {
        console.log(`❌ Transaction ${executionStatus.status.toLowerCase()}`);
        throw new Error(`Transaction ${executionStatus.status.toLowerCase()}`);
      }
    } catch (error) {
      console.log('⚠️ Error checking transaction status:', error);
    }

    if (!completed) {
      console.log('⏳ Waiting 2 seconds before next check...');
      await new Promise((resolve) => setTimeout(resolve, 2_000)); // Wait 2 seconds
    }
  }

  if (!completed) {
    console.log('⏰ Transaction monitoring timeout - check status manually');
    throw new Error('Transaction monitoring timeout - check status manually');
  }
}

// Helper function to deserialize UserOp for Kernel accounts
function deserializeUserOp(userOp: SerializedUserOperation): UserOperation<'0.7'> {
  return {
    sender: userOp.sender,
    nonce: BigInt(userOp.nonce),
    factory: userOp.factory,
    factoryData: userOp.factoryData,
    callData: userOp.callData,
    callGasLimit: BigInt(userOp.callGasLimit),
    verificationGasLimit: BigInt(userOp.verificationGasLimit),
    preVerificationGas: BigInt(userOp.preVerificationGas),
    maxFeePerGas: BigInt(userOp.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
    paymaster: userOp.paymaster,
    paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit
      ? BigInt(userOp.paymasterVerificationGasLimit)
      : undefined,
    paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit ? BigInt(userOp.paymasterPostOpGasLimit) : undefined,
    paymasterData: userOp.paymasterData,
    signature: userOp.signature,
  };
}

/**
 * Signs a Solana chain operation with a private key (v3 compatible)
 *
 * @param accountAddress - The address of the account to sign the chain operation
 * @param privateKey - The private key to sign the chain operation
 * @param chainOp - The chain operation to sign
 * @returns The signed chain operation
 */
export function signSolanaOperation(
  accountAddress: string,
  privateKey: string,
  chainOp: any,
): any {
  const msgBuffer = Buffer.from(chainOp.dataToSign, 'base64');

  const message = MessageV0.deserialize(msgBuffer);

  const transaction = new VersionedTransaction(message);

  const decodedKey = bs58.decode(privateKey);
  transaction.sign([
    {
      publicKey: new PublicKey(accountAddress),
      secretKey: Buffer.from(decodedKey),
    },
  ]);

  const signature = bs58.encode(Buffer.from(transaction.signatures[transaction.signatures.length - 1]));
  return {
    ...chainOp,
    signature,
  };
}

/**
 * Signs a chain operation based on the account type.
 * For Kernel V3.1 & V3.3 ECDSA accounts, it signs the UserOperation hash.
 * For other account types (default role-based), it signs the typed data.
 */
export async function signOperation(
  operation: ChainOperation,
  key: Hex | PrivateKeyAccount,
  accountType: ContractAccountType = ContractAccountType.RoleBased,
): Promise<ChainOperation> {
  const signerAccount = typeof key === 'string' ? privateKeyToAccount(key) : key;

  if (accountType === ContractAccountType.KernelV31 || accountType === ContractAccountType.KernelV33) {
    if (!operation.userOp || !operation.typedDataToSign?.domain?.chainId) {
      throw new Error('UserOperation and Chain ID are required for Kernel signing.');
    }

    const chainId = Number(operation.typedDataToSign.domain.chainId);

    // Handle delegation signing for EIP-7702
    if (operation.delegation) {
      const authTuple = {
        contractAddress: operation.delegation.contractAddress,
        nonce: operation.delegation.nonce,
        chainId: chainId,
      };
      const signedTuple = await signerAccount.signAuthorization(authTuple);

      if (signedTuple.yParity == null) {
        throw new Error('Y parity is required');
      }

      operation.delegation.signature = {
        chainId: chainId,
        contractAddress: signedTuple.address,
        nonce: signedTuple.nonce,
        r: signedTuple.r,
        s: signedTuple.s,
        v: `0x${Number(signedTuple.v).toString(16).padStart(2, '0')}` as Hex,
        yParity: signedTuple.yParity,
        type: DelegationSignatureType.Signed,
      };
    }

    // Sign UserOperation hash for Kernel accounts
    const deserializedUserOp = deserializeUserOp(operation.userOp);
    const userOpHash = getUserOperationHash<'0.7'>({
      userOperation: deserializedUserOp,
      entryPointAddress: entryPoint07Address,
      entryPointVersion: '0.7',
      chainId: chainId,
    });
    
    return {
      ...operation,
      userOp: { 
        ...operation.userOp, 
        signature: await signerAccount.signMessage({ message: { raw: userOpHash } }) 
      },
    };
  }
  
  // For role-based accounts, sign typed data
  if (!operation.typedDataToSign) {
    throw new Error('TypedData is required for role-based account signing.');
  }
  
  return {
    ...operation,
    userOp: { 
      ...operation.userOp, 
      signature: await signerAccount.signTypedData(operation.typedDataToSign) 
    },
  };
}
