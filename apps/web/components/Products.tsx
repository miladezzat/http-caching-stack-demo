
export const dynamic = 'force-dynamic'; // run on server

async function getProducts() {
  const res = await fetch('http://localhost:4000/api/products', { cache: 'no-store' });
  if (res.status === 304) return { data: [], updatedAt: new Date().toISOString() };
  return res.json();
}

export default async function Products() {
  const data = await getProducts();
  return (
    <section>
      <h2>Products</h2>
      <pre style={{ background: '#f6f6f6', padding: 12, borderRadius: 8 }}>{JSON.stringify(data, null, 2)}</pre>
      <p style={{fontSize:12,opacity:.7}}>Open DevTools → Network to inspect ETag/Last-Modified/Cache-Control.</p>
    </section>
  );
}
