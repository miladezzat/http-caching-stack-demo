import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    for (const header of ['ETag', 'Last-Modified', 'Cache-Tag', 'Cloudflare-CDN-Cache-Control']) res.removeHeader(header);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const body = error instanceof HttpException ? error.getResponse() : { message: 'Internal server error' };
    if (status === 500) Logger.error('Unhandled origin error', 'ErrorFilter');
    res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body);
  }
}
