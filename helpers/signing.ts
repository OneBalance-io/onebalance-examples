import { PrivateKeyAccount } from 'viem';
import { entryPoint07Address, getUserOperationHash, UserOperation } from 'viem/account-abstraction';
import { privateKeyToAccount } from 'viem/accounts';
import { MessageV0, PublicKey, VersionedTransaction, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import {
  Hex,
  ContractAccountType,
  DelegationSignatureType,
  SerializedUserOperation,
  ChainOperation,
  SolanaOperation,
  QuoteResponseV3,
  EOAKeyPair,
  SolanaAccount,
} from './types';

/**
 * Helper function to deserialize UserOp for Kernel accounts
 */
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
    paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit
      ? BigInt(userOp.paymasterPostOpGasLimit)
      : undefined,
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
  chainOp: SolanaOperation,
): SolanaOperation {
  if (!chainOp.dataToSign) {
    throw new Error('dataToSign is required for Solana operation signing');
  }

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

  const signature = bs58.encode(
    Buffer.from(transaction.signatures[transaction.signatures.length - 1]),
  );
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

  if (
    accountType === ContractAccountType.KernelV31 ||
    accountType === ContractAccountType.KernelV33
  ) {
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
        signature: await signerAccount.signMessage({ message: { raw: userOpHash } }),
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
      signature: await signerAccount.signTypedData(operation.typedDataToSign),
    },
  };
}

/**
 * Signs all operations in a quote (EVM and Solana)
 *
 * @param quote - The quote containing operations to sign
 * @param signerKey - EVM signer key for signing EVM operations
 * @param solanaKeypair - Solana keypair for signing Solana operations
 * @param solanaAccount - Solana account information
 * @returns The quote with all operations signed
 */
export async function signAllOperations(
  quote: QuoteResponseV3,
  signerKey: EOAKeyPair,
  solanaKeypair: Keypair | null,
  solanaAccount: SolanaAccount | null,
): Promise<QuoteResponseV3> {
  console.log('🔐 Signing operations...');

  for (let i = 0; i < quote.originChainsOperations.length; i++) {
    const operation = quote.originChainsOperations[i];

    if ('type' in operation && operation.type === 'solana' && solanaKeypair && solanaAccount) {
      // Sign Solana operation
      const privateKeyString = bs58.encode(solanaKeypair.secretKey);
      const signedOperation = signSolanaOperation(
        solanaAccount.accountAddress,
        privateKeyString,
        operation as SolanaOperation,
      );
      quote.originChainsOperations[i] = signedOperation;
    } else if ('userOp' in operation && 'typedDataToSign' in operation) {
      // Sign EVM operation
      const signedOperation = await signOperation(
        operation,
        signerKey.privateKey,
        ContractAccountType.KernelV31,
      );
      quote.originChainsOperations[i] = signedOperation;
    }
  }

  console.log('✅ All operations signed successfully');
  return quote;
}
