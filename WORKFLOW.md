# Subscription Manager — Application Workflow

This document describes the main workflows implemented in the Subscription Manager project.

## 1. User access

- A user can register or log in through the authentication pages.
- Public registration creates a customer account.
- An administrator can create staff accounts.
- Access to management actions is restricted by user role.

## 2. Product and plan setup

1. An administrator or staff member creates a customer, product, or plan.
2. A product can have variants.
3. A plan defines its price, billing interval, minimum quantity, and availability dates.
4. These records are used when creating subscriptions and quotations.

## 3. Subscription creation

1. Staff or an administrator selects a customer and a plan.
2. They enter the start date, quantity, and tax rate.
3. The system validates the selected plan and quantity.
4. The subscription is created with an active status.
5. The first invoice is generated as part of the subscription-creation transaction.

## 4. Recurring billing

- The application checks active subscriptions for billing periods that are due.
- A billing run creates invoices for due periods.
- The subscription's next billing date is advanced after invoice creation.
- A unique subscription-and-period constraint helps prevent duplicate invoices.
- A billing run can also be triggered manually by an authorized staff member.

## 5. Invoice and payment handling

1. Staff can review invoices and confirm, cancel, or send them.
2. A payment is recorded against its invoice with an amount, method, and optional reference.
3. The application updates the invoice balance and payment status.
4. Outstanding and overdue invoices can be reviewed from the billing screens.

## 6. Quotations

1. Staff can prepare a quotation for a customer using a plan and optional product lines.
2. A quotation can be issued and then confirmed or rejected.
3. Only a confirmed quotation can be converted.
4. Conversion creates a subscription and its first invoice while retaining the quotation record.
5. Administrators manage reusable quotation templates.

## 7. Taxes, discounts, and reporting

- Administrators manage tax rules and discount rules.
- Applicable rules are considered during invoice calculation.
- The dashboard summarizes subscription and billing activity.
- Customers can use the portal to view their own subscriptions, invoices, and payments.

## Roles at a glance

| Action | Admin | Staff | Customer |
|---|---:|---:|---:|
| Manage products and plans | Yes | Yes | No |
| Create staff accounts | Yes | No | No |
| Create/manage subscriptions | Yes | Yes | No |
| Manage tax and discount rules | Yes | No | No |
| Manage quotations | Yes | Yes | View own |
| Record invoice payments | Yes | Yes | No |
| View own billing portal | No special need | No special need | Yes |
