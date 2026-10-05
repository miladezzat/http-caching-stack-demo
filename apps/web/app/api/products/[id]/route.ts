import { proxy } from '../../../../lib/proxy';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function forward(request: Request, context: Context) {
  const { id } = await context.params;
  return proxy(request, `/products/${encodeURIComponent(id)}`);
}
export const GET = forward;
export const HEAD = forward;
export const PATCH = forward;
