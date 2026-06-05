import mongoose, { ClientSession } from 'mongoose';

const TRANSIENT_MONGO_CODES = new Set([112, 251]);

function getMongoErrorCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as { code?: number; errorResponse?: { code?: number } };
  return err.code ?? err.errorResponse?.code;
}

export function isTransientMongoWriteError(error: unknown): boolean {
  const code = getMongoErrorCode(error);
  if (code !== undefined && TRANSIENT_MONGO_CODES.has(code)) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return /write conflict|please retry/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runInTransactionWithRetry<T>(
  handler: (session: ClientSession) => Promise<T>,
  options?: { maxAttempts?: number; baseDelayMs?: number }
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 50;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const result = await handler(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      lastError = error;

      if (!isTransientMongoWriteError(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      await sleep(baseDelayMs * (attempt + 1));
    } finally {
      session.endSession();
    }
  }

  throw lastError;
}
