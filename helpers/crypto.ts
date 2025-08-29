import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { HashTypedDataParameters } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

export type Hex = `0x${string}`;

// Generate session key pair
export function generateEOAKey() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  return {
    privateKey,
    address: account.address,
  };
}

export function readOrCacheEOAKey(key: string) {
  // Always use the centralized keys directory in helpers/keys/
  const keysDir = join(__dirname, 'keys');
  const keyPath = join(keysDir, `${key}-key.json`);
  
  // Ensure keys directory exists
  if (!existsSync(keysDir)) {
    mkdirSync(keysDir, { recursive: true });
  }

  if (existsSync(keyPath)) {
    const cachedKeys = readFileSync(keyPath, 'utf8');
    return JSON.parse(cachedKeys);
  }

  const keys = generateEOAKey();
  writeFileSync(keyPath, JSON.stringify(keys, null, 2));

  return keys;
}

// Helper to sign typed data operations
export async function signTypedData(typedData: HashTypedDataParameters, privateKey: Hex): Promise<Hex> {
  const account = privateKeyToAccount(privateKey);
  return await account.signTypedData(typedData);
}
