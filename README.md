# Subscriptly

Subscription management application built with React, Vite, Tailwind CSS, Express, Prisma, PostgreSQL, and JWT authentication.

## Run locally

1. Install dependencies with `npm install`, `npm install --prefix server`, and `npm install --prefix client`.
2. Copy `server/.env.example` to `server/.env`. Set `DATABASE_URL` to a PostgreSQL database, `JWT_SECRET` to a random secret of at least 32 characters, and `ADMIN_EMAIL` plus `ADMIN_PASSWORD` for the initial administrator. The admin password must be at least 9 characters and include uppercase, lowercase, and a special character.
3. Run `npm run db:generate`, `npm run db:deploy`, and `npm run db:seed` from the repository root.
4. Run `npm run dev`. The client is at http://localhost:5173 and the API is at http://localhost:4000.

Public registration creates CUSTOMER accounts only. ADMIN can create STAFF accounts. Customer data is restricted to the signed-in customer. Subscriptions create invoices, and the billing service applies eligible discounts and taxes, records partial or full payments, and prevents duplicate recurring invoices.

## SQLite preservation and PostgreSQL migration

The original SQLite database remains at `server/prisma/dev.db`. Before changing the Prisma provider, a verified backup was created at `server/prisma/dev.db.before-postgresql-20261103.bak`. The old SQLite schema and migration history are preserved under `server/prisma/sqlite-archive/`; they are not used by the PostgreSQL Prisma schema.

The PostgreSQL baseline migration is in `server/prisma/migrations/`. The SQLite database contents have not been copied into PostgreSQL. Keep the original database and backup until you decide whether existing local records need a separate import.

## Free deployment: Neon, Render, and Vercel

1. Create a PostgreSQL database in Neon and keep its connection URL private.
2. Connect the GitHub repository to Render using the `render.yaml` Blueprint. Provide the Neon URL as `DATABASE_URL`, then set `CLIENT_ORIGIN`, `ADMIN_EMAIL`, and a strong `ADMIN_PASSWORD`. Render generates `JWT_SECRET`. The service applies migrations and creates the first administrator at startup.
3. Import the same repository into Vercel with `client/` as the project root. Set `VITE_API_URL` to the Render API's HTTPS origin. `client/vercel.json` enables React Router deep links.
4. Set Render's `CLIENT_ORIGIN` to the deployed Vercel origin and redeploy the API.

Free hosting has usage and availability limits. Render's free API service can spin down after inactivity, and Neon applies limits to free database compute and storage. Check the providers' current plans before relying on the deployment for long-term use.

## Quotations

ADMIN and STAFF can create and manage quotations. ADMIN can manage reusable quotation templates. Only confirmed quotations can be converted; conversion preserves the quotation and atomically creates a subscription and its first invoice.
