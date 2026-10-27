# shopee-affiliate.context.md

Simulation: `shopee-affiliate`
Created: 2026-10-25
Source: Shopee Affiliate GraphQL queries (`getPaymentPayoutBillingList`, `getPaymentSummaryBillFeeInvoiceList`) and REST billing endpoint (`/api/v3/payment/billing_list`) reverse-engineered from portal network traces and repository fixtures.

## Purpose

Stands in for `affiliate.shopee.vn` portal APIs (`/api/v3/gql`, `/api/v3/payment/billing_list`, `/api/v3/config/website`). Unblocks local integration testing of injected fetch routines across `tax_report.js`, `popup.js`, and `affiliate_content.js`: multi-page bounded pagination, token-rotation / 403 CSRF recovery, and partial-error fallback without hitting live Shopee endpoints or needing live authentication sessions.

## Execution

- **Precondition**: Postman CLI >= 1.70.
- **Start simulation**:
  ```bash
  postman simulation run postman/simulations/shopee-affiliate/shopee-affiliate.sim.yaml --port auto --no-history --output ndjson > /dev/null 2>&1 &
  SIM_PID=$!
  ```
- **Stop simulation**:
  ```bash
  kill -INT "$SIM_PID" 2>/dev/null && wait "$SIM_PID" 2>/dev/null
  ```
- **Limitation note**: Private-owner mock discovery was NOT performed. Current run did NOT verify live portal facts; API schemas and contract assumptions are derived strictly from repository history and network fixtures.

## Contract Assumptions (from Repository & History)

- **Portal request conventions**: GraphQL POST calls issue base headers (`Affiliate-Program-Type: 1`) without CSRF tokens in normal sessions; CSRF token recovery on 403/401 queries `/api/v3/config/website` or cookie `csrftoken`.
- **`getPaymentSummaryBillFeeInvoiceList` pagination**: Returns `totalCount` and paginates with `pageSize: 50`.
- **Short page handling**: Multi-page responses can return short pages (< 50 items) while still having additional pages if unique items < totalCount.
- **Mock routing & matching**: Matches GraphQL routes defensively by checking normalized URL `q`, `operationName`, and query text case-insensitively (supporting `getPaymentPayoutBillingList`, `getPaymentSummaryBillFeeInvoiceList`, and alias `getPayoutList`), while maintaining HTTP 501 for unhandled paths.

## Validated Local Simulated Results

- **Local simulated auth & retry**: Local integration tests validated client discovery of CSRF token from `/api/v3/config/website` and subsequent successful retry when 403 is simulated via `x-simulate-403` on invoice page 1.
- **Local simulation run**: Local simulation served multi-page GraphQL fee invoices (page 1 and page 2), payout billing queries, and page 2 partial error simulation (HTTP 500).
