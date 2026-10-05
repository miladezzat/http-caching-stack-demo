
import { proxy } from '../../../lib/proxy';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => proxy(request, '/products');
export const HEAD = GET;
