
# HTTP-First Caching Stack Demo (NestJS + Next.js + Cloudflare)

![http-caching-concept](https://github.com/user-attachments/assets/b1391b03-3e4d-4bb8-a0e9-f65e26453b15)


## Apps
- `apps/api` — NestJS origin implementing HTTP caching (ETag, Last-Modified, Cache-Control, Vary, Cache Tags)
- `apps/web` — Next.js app demonstrating proxying validators and respecting 304s

## Dev
```bash
npm i
# API
cd apps/api && cp .env.example .env && npm run start:dev
# Web
cd ../web && cp .env.example .env && npm run dev
# Open http://localhost:4000
```

## Cloudflare (purge by tags)
- Ensure responses include `Cache-Tag` headers.
- Run:
  ```bash
  CLOUDFLARE_ZONE_ID=... CLOUDFLARE_API_TOKEN=... PURGE_TAGS=product:1,products npm run purge:cloudflare
  ```
