# Subscription Manager — Manual Testing Checklist

Use this checklist during the hackathon demo to verify the main user journeys. Run it against the local demo database and record any failures before presenting.

## Authentication and roles

- [ ] Register a new customer account.
- [ ] Log in with valid credentials.
- [ ] Confirm that an unauthenticated visitor cannot access protected pages.
- [ ] Confirm that a customer cannot access staff/admin-only actions.
- [ ] Log in as an administrator and verify that staff creation is available.

## Products and plans

- [ ] Create a product.
- [ ] Create a plan with a billing interval and price.
- [ ] Try a quantity below the plan's minimum quantity and confirm that validation prevents it.
- [ ] Verify that the product and plan appear in the relevant selection lists.

## Subscription and invoice flow

- [ ] Create a subscription for a customer using an available plan.
- [ ] Verify that the subscription appears in the subscription list.
- [ ] Verify that the first invoice is generated automatically.
- [ ] Check that the invoice contains the expected customer, plan, quantity, tax, and total.
- [ ] Pause an active subscription and resume it.
- [ ] Cancel a subscription and verify that its status changes.

## Payments

- [ ] Record a payment against an invoice.
- [ ] Verify that the payment appears in the payment list and invoice details.
- [ ] Verify that a fully paid invoice displays a paid status.
- [ ] If partial payments are supported in the demo data, verify that the remaining balance is correct.

## Quotations

- [ ] Create a quotation for a customer.
- [ ] Issue the quotation.
- [ ] Confirm the quotation.
- [ ] Convert the confirmed quotation into a subscription.
- [ ] Verify that the new subscription and first invoice are present.

## Dashboard and customer portal

- [ ] Verify that dashboard totals load.
- [ ] Apply invoice date and status filters and confirm that the displayed figures respond.
- [ ] Log in as a customer and verify that the portal shows only that customer's billing information.

## Demo readiness

- [ ] Confirm that the backend and frontend both start successfully.
- [ ] Confirm that the database is seeded with demo records.
- [ ] Keep one administrator login and one customer login ready.
- [ ] Prepare one short end-to-end demo: create subscription → inspect invoice → record payment → show dashboard.
