
import './globals.css';
export const metadata = { title: 'The Caching Laboratory', description: 'Inspect browser caching, HTTP validators, and durable CDN invalidation.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
