
export const metadata = { title: 'HTTP Caching Demo', description: 'Next.js + HTTP caching' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', margin: 24 }}>{children}</body>
    </html>
  );
}
