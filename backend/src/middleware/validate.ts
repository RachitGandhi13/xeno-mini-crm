import { z, type ZodTypeAny } from 'zod';
import type { Request, Response, NextFunction } from 'express';

function formatErrors(err: z.ZodError) {
  return err.errors.map((e) => ({
    path: e.path.join('.'),
    message: e.message,
  }));
}

/** Validates req.body against a Zod schema, mutates req.body with the parsed
 *  (coerced / defaulted) result, and returns 400 on failure. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body validation failed',
          details: formatErrors(result.error),
        },
      });
      return;
    }
    req.body = result.data as z.infer<T>;
    next();
  };
}

/** Validates req.query against a Zod schema and attaches the parsed result as
 *  req.validatedQuery. Use z.coerce.number() for numeric query params. */
export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      _res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter validation failed',
          details: formatErrors(result.error),
        },
      });
      return;
    }
    (req as Request & { validatedQuery: z.infer<T> }).validatedQuery = result.data;
    next();
  };
}
