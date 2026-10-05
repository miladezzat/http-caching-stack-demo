
import Products from '../components/Products';
export default function Home() {
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">A reference architecture you can inspect</p>
        <h1>The caching laboratory.</h1>
        <p>Follow a response from origin to browser. Change the data, revalidate it, and watch invalidation recover.</p>
        <div className="flow"><span>Browser HTTP cache</span><b>→</b><span>Cloudflare edge</span><b>→</b><span>Next.js proxy</span><b>→</b><span>NestJS + PostgreSQL</span></div>
      </header>
      <Products />
    </main>
  );
}
