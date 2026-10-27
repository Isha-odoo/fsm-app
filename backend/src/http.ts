import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const uuidParam = z.string().uuid();

/** Async route wrapper: HttpError => its status, anything else (incl. ZodError) => central error handler. */
export const handle = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err) => (err instanceof HttpError ? res.status(err.status).json({ error: err.message }) : next(err)));
