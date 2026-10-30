# Reference Architecture: Payment History & S1a Ledger Reference

This document provides a technical reference and bounded feature comparison of the offline Shopee Payment History & S1a Revenue Book (`#ph-summary` and `#s1aBook`) implementation found in the public static JS assets (`/tmp/shopee-s1a-reference/full-public-js`) and rendered offline HTML (`#ph-summary` / `#s1aBook`).

> [!NOTE]
> **Audit & Provenance Bounds:**
> - **Input Scope:** Evaluated strictly from offline rendered HTML and public static JavaScript files (Evidence Root: `REAev_9b0750697dbfa2515148869a1ffc114e2f7bd93691f3baf69477fd0da53ebd88`, SHA-256 Digest: `a91d1ed51aa6dc5da5519a8ee04d73fc3a4e7bdb249e8f41115fa55d9da4b123`).
> - **Non-Invasive Offline Assessment:** This analysis is strictly offline. No authenticated live audit was conducted; no financial data, cookies, tokens, or live API POST requests were submitted to third-party endpoints.
> - **No Code Ingestion:** None of the third-party client code, tracking scripts (`pxcelframe`, `sharethis`), cloud synchronization, multi-channel scraping, or tax-law wizard automation are copied into this repository.

---

## 1. Feature Comparison & Design Matrix

The following matrix compares the external reference implementation against our internal architecture (`shopee-voucher-saver`):

| Architectural Dimension | External Reference (`#s1aBook` / `payment-history-*.js`) | Our Canonical System (`shopee-voucher-saver`) | Selection Rationale & Boundary |
| :--- | :--- | :--- | :--- |
| **Gross Revenue Basis** | Defaults to "Revenue after MCN" (with user option to toggle to Gross before MCN). | **Strictly Canonical Payout GROSS before ALL fees** (`paymentPayout.eligibleTotalAmount`). | User explicit choice: Strictly Canonical Payout GROSS before ALL fees (`paymentPayout.eligibleTotalAmount`) is chosen by user explicit design decision for full gross ledger recording; it is an explicit user choice, not a legal eligibility assertion. Reference's after-MCN default does not override our design. |
| **Calendar & Timezone** | Cutoff epoch timestamps, partial month filters, date range filters. | **Strictly Asia/Ho_Chi_Minh (GMT+7)** with explicit and visible `DD/MM/YYYY` and `MM/YYYY` display labels. | Prevents silent date shifts caused by UTC day boundaries and clarifies cross-month settlement periods. |
| **Profile & Storage Model** | Web cloud accounts, remote profiles, server sessions, guest localStorage. | **100% Local Profile Storage** (`chrome.storage.local` / local browser memory). | Absolute privacy: zero financial credentials, tokens, or affiliate earnings uploaded to external servers. |
| **Grouping & Group Keys** | Grouped by payout batch (date of payout) or calendar month, with HKD regime toggles. | **Grouping per Payout batch (`payout_id`) and per calendar Month (`MM/YYYY`)**. | Aligns daily completion records with actual banking cashflows while retaining daily billing completeness. |
| **Export Formats** | Generates S1a / S2a-HKD books in XLSX, DOCX, and native PDF via client templates. | **Offline XLSX / CSV / printable native HTML/PDF** export routines. | Fully client-side export without server roundtrips or binary cloud converters. |
| **Reconciliation Detail** | Wizard tax simulation (splits estimated GTGT/TNCN into 5% / 5% buckets). | **Read-only Payout Reconciliation Detail** (displays exact observed Payout Gross, Daily Net, and batch variance). | Displays observed raw delta without forcing synthetic 5%/5% tax line items when unitemized in API payloads. |
| **Multi-Channel Scope** | Aggregates Shopee, TikTok, Lazada, and custom platforms. | **Focused Shopee Affiliate Pipeline** (`/api/v3/payment/billing_list`, GraphQL Payouts & Fees). | Eliminates unnecessary third-party platform bloat. |

---

## 2. Technical Mechanics in Public Reference JS

Analysis of `payment-history-s1a-ledger-book.js`, `payment-history-fee-invoices.js`, and related scripts reveals key implementation details:

### 2.1 Payout Date vs Order Completion Date
The reference `#s1aBook` recognizes that Shopee affiliates operate across two distinct time planes:
1. **Ngày đối soát (Payout Batch Creation Time):** When Shopee freezes eligible orders and prepares batch disbursement (`payoutCreatedTime`).
2. **Ngày tiền về (Bank Arrival Time):** When funds land in the affiliate's bank account (`payArrivalTime`).
3. **Ngày hoàn thành đơn (Order Completion Time):** When individual orders are delivered and marked complete (`order_completed_period_start_time`).

In the reference `#s1aBook`, records are grouped primarily by **đợt đối soát** (Payout batch), allowing daily orders completed across late September and early October to be accounted for under the early October payout cycle.

### 2.2 S1a / S2a-HKD Ledger Structure
The reference generates statutory revenue ledger records conforming to Vietnamese accounting circulars (Circular 88/2021/TT-BTC and related HKD guidance):
- **Cột 1 - Ngày tháng ghi sổ:** Date of ledger entry.
- **Cột 2 - Số hiệu chứng từ:** Payout ID or billing validation voucher reference.
- **Cột 3 - Ngày tháng chứng từ:** Date of voucher / payout creation.
- **Cột 4 - Diễn giải:** Description (e.g. "Doanh thu hoa hồng Shopee Affiliate đợt...").
- **Cột 5 - Doanh thu:** Gross taxable revenue (Canonical Gross).

---

## 3. Boundary & Non-Inclusion Checklist

To maintain clean architectural boundaries and strict privacy:
- [x] **No Cloud Callbacks:** Did not implement or integrate any remote sync or user registration endpoints.
- [x] **No Tracking Pixels:** Excluded all third-party tracker scripts (`sharethis`, `pxcelframe`, analytics).
- [x] **No Tax Law Wizard Automation:** Did not incorporate dynamic tax legal classification wizards that guess affiliate tax regimes; all figures present verbatim API values and observed mathematical differences.
- [x] **No Live Network Overhead:** All contract verifications run completely offline against sanitized local fixtures.
