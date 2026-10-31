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

## Quotation workflow

ADMIN and STAFF can create quotations from a customer, plan, and optional product lines. New quotations start as Draft; issue them as Quotation, then mark them Confirmed or Rejected. Expired issued quotations are marked Expired when quotation lists or details are read after their `validUntil` date. Quotation `expiryDate` is the planned subscription end date; `validUntil` is the offer deadline.

ADMIN can create, edit, and delete reusable quotation templates. STAFF can select templates while drafting. Customers can view only quotations linked to their own account and cannot change quotation state.

Only Confirmed quotations can be converted. Conversion preserves the quotation and atomically creates one subscription and its first invoice. Product lines and tax carry into the invoice and recurring subscription billing. A unique quotation conversion link and the invoice unique period constraint prevent duplicate conversion and invoices. Subscription and invoice screens continue to support direct subscription creation, invoice viewing, and payment recording.

For databases that already have the Phase 2 schema, apply the quotation migration with `npx prisma migrate deploy` from `server/` after setting `DATABASE_URL` for that database. Then regenerate Prisma Client with `npm run db:generate` from the project root.
