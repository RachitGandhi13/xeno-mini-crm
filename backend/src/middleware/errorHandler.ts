import { Request, Response, NextFunction } from 'express';

// ─── Typed application error ──────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Convenience factories.
export const notFound = (resource: string) =>
  new AppError(404, `${resource} not found`, 'NOT_FOUND');

export const badRequest = (message: string) =>
  new AppError(400, message, 'BAD_REQUEST');

export const conflict = (message: string) =>
  new AppError(409, message, 'CONFLICT');

// ─── Global error handler ─────────────────────────────────────────────────────

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code ?? 'APP_ERROR', message: err.message },
    });
    return;
  }

  // Map common PostgreSQL error codes to HTTP semantics so the API never
  // leaks raw DB errors to the client.
  if ('code' in err) {
    const pgCode = (err as NodeJS.ErrnoException).code;

    if (pgCode === '23505') {
      // unique_violation
      res.status(409).json({
        error: { code: 'DUPLICATE_ENTRY', message: 'A record with this value already exists.' },
      });
      return;
    }
    if (pgCode === '23503') {
      // foreign_key_violation
      res.status(400).json({
        error: { code: 'FOREIGN_KEY_VIOLATION', message: 'Referenced record does not exist.' },
      });
      return;
    }
    if (pgCode === '23502') {
      // not_null_violation
      res.status(400).json({
        error: { code: 'NULL_CONSTRAINT', message: 'A required field is missing.' },
      });
      return;
    }
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
}

// ─── Async route wrapper ──────────────────────────────────────────────────────

/**
 * Wraps an async Express route handler so that any thrown error is forwarded
 * to next() and picked up by errorHandler above.
 * Usage: router.get('/foo', asyncHandler(async (req, res) => { ... }))
 */
// Uses plain Request so req.params (ParamsDictionary) and req.query are always
// typed correctly without needing per-route generics.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) =>
    void fn(req, res, next).catch(next);
}
