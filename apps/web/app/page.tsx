
import Products from '../components/Products';
export const revalidate = 60; // ISR for the page shell
export default function Home() {
  return (
    <main>
      <h1>HTTP-First Caching — Next.js + NestJS + Cloudflare</h1>
      <p>Data is fetched via a Next.js route handler that proxies the Nest API and preserves validators.</p>
      <Products />
    </main>
  );
}
