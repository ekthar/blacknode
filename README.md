# Black Node Vault (MVP)

Personal access vault built with:
- Next.js (TypeScript, App Router)
- PostgreSQL + Prisma (minimal metadata schema)
- Cloudflare R2 (private object storage)
- Password auth + TOTP 2FA
- Vercel hosting target

## Features Included

- Register + login (`password`)
- Optional 2FA setup + enable + verification (`TOTP`)
- HTTP-only session cookies
- Signed upload/download URLs for R2 (short-lived)
- Protected `/vault` route via middleware
- File metadata stored in PostgreSQL, file blobs stored in R2

## 1) Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with real PostgreSQL and R2 values.

## 2) Database

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

## 3) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Core Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/enable`
- `POST /api/auth/2fa/verify`
- `GET /api/vault/files`
- `POST /api/vault/sign-upload`
- `POST /api/vault/sign-download`

## Security Notes

- Keep R2 bucket private.
- Use long random `AUTH_JWT_SECRET` in production.
- Set production domain + HTTPS on Vercel.
- Add rate limiting and login attempt throttling before production launch.
- Add device/session management and alerting for hardened production use.
