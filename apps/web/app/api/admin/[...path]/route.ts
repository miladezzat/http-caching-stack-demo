import { proxy } from '../../../../lib/proxy';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  const joined = path.join('/');
  const allowed = request.method === 'GET' ? joined === 'status'
    : ['purge', 'scenarios'].includes(joined) || /^jobs\/[a-f0-9-]{36}\/retry$/i.test(joined);
  if (!allowed) return Response.json({ message: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return proxy(request, `/admin/${joined}`);
}
export const GET = forward;
export const POST = forward;
