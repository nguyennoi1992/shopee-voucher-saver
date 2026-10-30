# Shopee Response Examples & Fixtures

This directory contains sanitized, structurally faithful reference fixtures derived from actual Shopee Affiliate responses. These fixtures serve as the verification baseline for response parsing, unit conversions, and contract assertions.

> [!IMPORTANT]
> **Data Scope, Sampling & Privacy Guarantees:**
> - **Sanitized / Sampled Baseline:** These fixtures are sanitized and sampled test baselines, **NOT** raw production imports.
> - **Billing Sampling (335 -> 5 records):** The raw billing feed contained 335 daily records. [billing_list.sample.json](billing_list.sample.json) preserves 5 representative records demonstrating non-zero commissions, zero Shopee commission, multi-channel commission, different monthly periods, and pending unassigned payout status (`payout_id: ""`).
> - **Aggregate Scopes vs Row Sums:** The root aggregate block `data.income_breakdown` in [billing_list.sample.json](billing_list.sample.json) and `payoutTotalAmount` in [payment_payout_billing_list.sample.json](payment_payout_billing_list.sample.json) reflect the **aggregate returned with the query scope** (all 335 billing records and all 99 payouts in query scope respectively), **not** the sum of rows present in the sampled JSON. Do not attempt to sum the rows to verify the global aggregates.
> - **Stable Counter Aliases & PII Redaction:** In compliance with privacy mandates, all raw identifiers (validation IDs, payout IDs, affiliate account prefixes) have been systematically scrubbed and replaced with stable counter aliases (`DEMO_PAYOUT_0001` through `DEMO_PAYOUT_0010`, `DEMO_VAL_0001` through `DEMO_VAL_0005`, `DEMO_AFFILIATE`, `DEMO_INV_*`). No original identification substring remains in any fixture. Payout IDs match identically across [billing_list.sample.json](billing_list.sample.json) and [payment_payout_billing_list.sample.json](payment_payout_billing_list.sample.json) to preserve relational joins and deduplication logic.

---

## Fixture Inventory

| Fixture File | Source Endpoint / Contract Scope | Record Count in Fixture | Source Scope (Query Response) | Description |
| :--- | :--- | :--- | :--- | :--- |
| [billing_list.sample.json](billing_list.sample.json) | Daily Settlement Feed (`/api/v3/payment/billing_list`) | 5 records | 335 records | Daily completed order settlement batches spanning Nov 2025 – Oct 2026. Preserves verbatim envelope, boolean types (`is_terminated: false`), and root `income_breakdown`. |
| [payment_payout_billing_list.sample.json](payment_payout_billing_list.sample.json) | Payout Batch Feed (`getPaymentPayoutBillingList`) | 10 records (Page 1) | 99 total payouts in query scope (`totalCount: "99"`) | Complete first page (10 records) of payout disbursements, showing `eligibleTotalAmount` (Gross) vs `totalPaymentAmount` (Net), raw failure type 601, and payout statuses 1 & 10. |
| [service_fee_invoice_list.sample.json](service_fee_invoice_list.sample.json) | Monthly Platform Service Fee Invoices (`getPaymentSummaryBillFeeInvoiceList`) | 9 monthly invoice periods | 9 total periods in sample | Complete sample of 9 monthly fee periods (Jan 2026 – Sep 2026). Each period runs from Day 02 to Day 01 of the following month. |
| [payout_38230_reconciliation.sample.json](payout_38230_reconciliation.sample.json) | Payout Reconciliation Case Study (`DEMO_PAYOUT_0005`) | 1 payout record + 4 matching daily billing records | Complete payout batch slice | Faithful case study of Payout Gross 38,230 VND vs Daily Net 37,854 VND vs Disbursed Net 34,030 VND across cross-month completion dates (Sep 30 – Oct 03). |

---

## Relational Linkage Across Fixtures

The fixtures preserve real relational integrity through consistent demo aliases:

- **Payout Joins:**
  - `billing_list.sample.json` records with `payout_id: "DEMO_PAYOUT_0001"` map directly to `payment_payout_billing_list.sample.json` item `payoutId: "DEMO_PAYOUT_0001"`.
  - Records under `DEMO_PAYOUT_0004` (indices 2 and 3 in `billing_list.sample.json`) join with `payoutId: "DEMO_PAYOUT_0004"`.
  - In `payout_38230_reconciliation.sample.json`, `payoutRecord.paymentPayout.payoutId: "DEMO_PAYOUT_0005"` matches the foreign key `payout_id: "DEMO_PAYOUT_0005"` across all 4 included daily billing records.
  - Unassigned pending record has `payout_id: ""`.
- **Deduplication Baseline:**
  - In `billing_list.sample.json`, `validation_id` is unique per daily settlement slice (e.g. `DEMO_VAL_0001`, `DEMO_VAL_0002`).
  - In `service_fee_invoice_list.sample.json`, each invoice period contains two file formats (PDF `invoiceType: 54` and XLSX `invoiceType: 57`) under the **exact same `invoiceNumber`**. Parsers must deduplicate by `invoiceNumber` so that monthly fee amounts are not double-counted.

For detailed schema structures, field types, conversion equations, and verification checks, refer to [SHOPEE_RESPONSE_CONTRACTS.md](../../SHOPEE_RESPONSE_CONTRACTS.md).
