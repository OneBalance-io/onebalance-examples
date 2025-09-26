import { fetchExecutionStatus } from './onebalance';
import { Quote, QuoteResponseV1, QuoteResponseV3, ExecutionStatusResponse } from './types';

/**
 * Transaction monitoring utilities for OneBalance operations
 */

/**
 * Monitor transaction completion status with polling
 *
 * @param quote - The quote to monitor (contains the quote ID)
 * @param timeout - Maximum time to wait in milliseconds (default: 60 seconds)
 * @param pollInterval - Time between status checks in milliseconds (default: 2 seconds)
 * @returns Promise that resolves when transaction completes or rejects on failure/timeout
 */
export async function monitorTransactionCompletion(
  quote: Quote | QuoteResponseV1 | QuoteResponseV3,
  timeout: number = 60_000,
  pollInterval: number = 2_000,
): Promise<void> {
  console.log('\n🔍 Monitoring transaction completion...');
  console.log('Quote ID:', quote.id);

  const startTime = Date.now();
  let completed = false;

  while (!completed && Date.now() - startTime < timeout) {
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
      console.log(`⏳ Waiting ${pollInterval / 1000} seconds before next check...`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  if (!completed) {
    console.log('⏰ Transaction monitoring timeout - check status manually');
    throw new Error('Transaction monitoring timeout - check status manually');
  }
}

/**
 * Monitor multiple transactions concurrently
 *
 * @param quotes - Array of quotes to monitor
 * @param timeout - Maximum time to wait for each transaction
 * @param pollInterval - Time between status checks
 * @returns Promise that resolves when all transactions complete
 */
export async function monitorMultipleTransactions(
  quotes: Array<Quote | QuoteResponseV1 | QuoteResponseV3>,
  timeout: number = 60_000,
  pollInterval: number = 2_000,
): Promise<void> {
  console.log(`\n🔍 Monitoring ${quotes.length} transactions...`);

  const monitoringPromises = quotes.map((quote, index) =>
    monitorTransactionCompletion(quote, timeout, pollInterval)
      .then(() => console.log(`✅ Transaction ${index + 1} completed`))
      .catch((error) => {
        console.error(`❌ Transaction ${index + 1} failed:`, error.message);
        throw error;
      }),
  );

  await Promise.all(monitoringPromises);
  console.log('🎉 All transactions completed successfully!');
}

/**
 * Get current status of a transaction without monitoring
 *
 * @param quoteId - The quote ID to check
 * @returns Promise with the current execution status
 */
export async function getTransactionStatus(quoteId: string): Promise<ExecutionStatusResponse> {
  try {
    const status = await fetchExecutionStatus(quoteId);
    console.log(`📊 Transaction ${quoteId} status: ${status.status}`);
    return status;
  } catch (error) {
    console.error(`Failed to get status for transaction ${quoteId}:`, error);
    throw error;
  }
}

/**
 * Wait for transaction with custom retry logic
 *
 * @param quote - The quote to monitor
 * @param options - Monitoring options
 * @returns Promise that resolves when transaction completes
 */
export async function waitForTransaction(
  quote: Quote | QuoteResponseV1 | QuoteResponseV3,
  options?: {
    timeout?: number;
    pollInterval?: number;
    maxRetries?: number;
    onStatusUpdate?: (status: string) => void;
  },
): Promise<void> {
  const { timeout = 60_000, pollInterval = 2_000, maxRetries = 3, onStatusUpdate } = options || {};

  let retries = 0;

  while (retries < maxRetries) {
    try {
      await monitorTransactionCompletion(quote, timeout, pollInterval);
      return; // Success, exit
    } catch (error) {
      retries++;
      console.log(`⚠️ Monitoring attempt ${retries} failed:`, (error as Error).message);

      if (retries >= maxRetries) {
        throw new Error(`Failed to monitor transaction after ${maxRetries} attempts`);
      }

      console.log(`🔄 Retrying in ${pollInterval / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}
