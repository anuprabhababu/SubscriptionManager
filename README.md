# Subscriptly — Phase 1 + Phase 2 Demo

Subscription management app built with React/Vite, Tailwind, Express, Prisma/SQLite and JWT.

## Run locally

1. Install root and package dependencies: `npm install`, then `npm install --prefix server` and `npm install --prefix client`.
2. Copy `server/.env.example` to `server/.env`; set `JWT_SECRET` to a random string of at least 32 characters.
3. Initialize the database with `npm run db:generate`, `npm run db:migrate`, and `npm run db:seed` from the root. For a quick local demo, `npm run db:push` can sync the schema when Prisma migrations are unavailable.
4. Start both apps using `npm run dev` from the root. Client: http://localhost:5173; API: http://localhost:4000.

The seed creates `admin@subscriptly.local` with password `Admin123!ChangeMe`. Change it after first login. Public registration creates CUSTOMER accounts only. STAFF creation is restricted to ADMIN via `POST /api/auth/staff`.

Phase 2 demo flow: create a customer and plan, create a subscription (which immediately creates its first invoice with the selected tax rate), record one or more payments against the invoice, then view outstanding/overdue balances and payments. Active subscriptions are checked for due billing periods at startup and every minute; `npm run billing:run` also runs a billing cycle manually. The unique subscription and period constraint prevents duplicate invoices.

Client and server also run independently with `npm run dev --prefix client` and `npm run dev --prefix server`.

Customer accounts have a read-only portal scoped to their own subscriptions, invoices, and payments. Invoice payment entry is staff/admin only; this phase records payments and does not connect a payment gateway.
