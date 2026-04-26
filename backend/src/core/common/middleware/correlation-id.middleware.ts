import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Express Request augmentado con `correlationId` por este middleware. */
interface RequestWithCorrelation extends Request {
  correlationId?: string;
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const id = (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();
    req.headers[CORRELATION_ID_HEADER] = id;
    (req as RequestWithCorrelation).correlationId = id;
    next();
  }
}
