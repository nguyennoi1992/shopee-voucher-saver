# Shopee API Response Contracts & Verification Baseline

This specification documents the data contracts, schema models, unit representations, timing semantics, and observed reconciliation rules for three core Shopee Affiliate financial data feeds:
1. **Daily Settlement & Billing Feed** (`billing_list.sample.json`)
2. **Payout Disbursements Feed** (`getPaymentPayoutBillingList` / `payment_payout_billing_list.sample.json`)
3. **Monthly Platform Service Fee Invoices** (`getPaymentSummaryBillFeeInvoiceList` / `service_fee_invoice_list.sample.json`)

These contracts are established from actual, sanitized affiliate financial records and serve as the canonical verification baseline for parsers, calculators, and tax reporting workflows.

---

## 1. Executive Contract Summary & Architecture

Shopee Affiliate financial accounting operates on two distinct reconciliation planes:
- **Canonical Payout Gross Basis:** The gross commission earned by an affiliate before platform withholding, statutory taxes, and offline deductions.
- **Settlement & Fee Basis:** Daily completed order settlement batches (`bills`), associated daily platform service fees (`service_fees`), and distinct monthly platform service fee invoices billed across shifted calendar periods (Day 02 of month $M$ to Day 01 of month $M+1$).

```
[Shopee Affiliate Portal / Backend Feeds]
       │
       ├── 1. Daily Settlement Feed (Billing)
       │      • Endpoint: /api/v3/payment/billing_list (queried by order completed time range)
       │      • Daily order completion slices (validation_id)
       │      • Bills (validated commissions, VAT/WHT base)
       │      • Daily platform service fees (service_fees)
       │      • Global aggregate header (income_breakdown) for the query scope
       │      • Grouped by payout_id (when scheduled)
       │
       ├── 2. Payout Batch Feed (Payout)
       │      • GraphQL query: getPaymentPayoutBillingList (/api/v3/gql)
       │      • Weekly/bi-weekly disbursement batches (payoutId)
       │      • eligibleTotalAmount = Batch GROSS commission
       │      • totalPaymentAmount  = Batch NET disbursement
       │      • Aggregate for query scope: payoutTotalAmount (all 99 payouts in query scope)
       │
       └── 3. Monthly Service Fee Invoice Feed (Fee)
              • GraphQL query: getPaymentSummaryBillFeeInvoiceList (/api/v3/gql)
              • Monthly invoice periods: Day 02 to Day 01 next month (GMT+7)
              • PDF (type 54) + XLSX (type 57) under SAME invoiceNumber
              • Deduplication mandatory (1 fee period = 1 fee amount)
```

---

## 2. Provenance & Epistemological Taxonomy

To ensure factual integrity and prevent premature assumptions from creeping into parser design, every claim in this specification is categorized according to three epistemological tiers:

1. **Observed (Direct Evidence):** Directly present in the user-provided response bodies (e.g. numeric values, raw keys, timestamps, exact field pairings, counts).
2. **Derived (Deterministic Arithmetic / Direct Logical Join):** Deterministic calculations strictly proven across observed records (e.g. $100,000$ unit scaling, string/integer conversions, date boundary conversions in GMT+7, sums of observed arrays).
3. **Unverified / Inferred Diagnostic (Requires External Spec):** Numeric status codes without portal text descriptions (e.g. code `8`, `3`, `601`), platform tax withholding logic applied outside daily lines, and underlying database/endpoint query filters not visible inside the response body alone.

### 2.1 Provenance of Additional 2026 Billing Feed (274 Records vs 335 Records)
An additional billing response containing 274 records (`Billing 274`) was evaluated alongside the original 335-record feed (`Billing 335`):
- **Observed Scope of Billing 274:** Order completion start times span **2026-01-01 00:00:00 GMT+7** (`1767200400`) to **2026-10-25 00:00:00 GMT+7** (`1792861200`), with completion end times through **2026-10-25 23:59:59 GMT+7** (`1792947599`).
- **Mathematical Subset Verification:** All 274 `validation_id` records in Billing 274 form an **exact, strict subset** of Billing 335.
- **Source of Difference (61 Records):** The 61 records present in Billing 335 but absent from Billing 274 comprise:
  - 29 records in November 2025 (`validation_month: 202511`)
  - 31 records in December 2025 (`validation_month: 202512`)
  - 1 boundary record on 2025-12-31 / 2026-01-01 (`validation_month: 202601`)
- **Query Filter Attribution:** While the response bodies do not expose their HTTP query parameters, the observed timestamps demonstrate that Billing 274 is a 2026 calendar-year scoped query, whereas Billing 335 encompasses a wider 12-month trailing query (Nov 2025 – Oct 2026). The root `income_breakdown.total_payment_amount` in Billing 274 is $622,812,400,000$ raw ($6,228,124$ VND), which exactly matches the sum of the 274 records.

---

## 3. Global Conventions, Currency Units & Timezones

### 3.1 Currency Representation & The `100,000` Scaling Factor
All financial currency amounts in raw Shopee Affiliate responses are scaled by a fixed integer factor of **$100,000$ ($10^5$)**:

$$\text{Amount (VND)} = \frac{\text{Raw Financial Amount}}{100,000}$$

Shopee responses pair raw integer fields with display string fields ending in `_dis` or `Dis`. However, **formatting differs between per-record and global aggregate scopes**:
- **Per-record `_dis`:** Formatted as pure digit strings without group separators (e.g. `"17386"` representing $17,386$ VND).
- **Aggregate `_dis`:** Formatted with localized dot thousand-separators (e.g. `"8.735.477"` representing $8,735,477$ VND).

> [!WARNING]
> Do not use a blanket `parseFloat()` or naive string-to-number cast on `_dis` fields. Standard `parseFloat("8.735.477")` yields `8.735` instead of `8735477`. Always perform arithmetic using the raw integer/numeric string fields divided by $100,000$ (preferably using `Decimal` or integer division).

| Raw Field | Display String (`*_dis` / `*Dis`) | Scale & Format Style | Canonical VND Value |
| :--- | :--- | :--- | :--- |
| `eligible_total_amount: 1738600000` | `eligible_total_amount_dis: "17386"` | Raw integer $\div 10^5$; unpunctuated string | $17,386$ VND |
| `total_payment_amount: 1721600000` | `total_payment_amount_dis: "17216"` | Raw integer $\div 10^5$; unpunctuated string | $17,216$ VND |
| `total_payment_amount: 873547700000` | `total_payment_amount_dis: "8.735.477"` | Raw integer $\div 10^5$; dot thousand-separated | $8,735,477$ VND |
| `seller_comm: 826118500000` | `seller_comm_dis: "8.261.185"` | Raw integer $\div 10^5$; dot thousand-separated | $8,261,185$ VND |
| `totalServiceFee: "449900000"` (Fee API) | *(no `_dis` field in fee API)* | Numeric string $\div 10^5$ | $4,499$ VND |

#### Unconfirmed / Non-Money Numeric Fields
Not all numeric fields represent money scaled by $100,000$:
- `service_fee_rate: 980` (observed in `service_fees`): Represents the fee rate basis (unconfirmed exact basis, likely basis points $9.80\%$).
- `service_fee_cap: 0`: Cap parameter.
- `fee_tax_rate: 8000` (observed in `payment_service_fee_tax_map`): Tax rate parameter (likely basis points $8.00\%$).
- `fee_tax_direction: 2`, `fee_tax_type: 2`, `bill_source: 7`: Enum/type indices, not currency.

### 3.2 Timezone & Epoch Timestamps
- All epoch timestamps (`payoutCreatedTime`, `order_completed_period_start_time`, `paymentCompletePeriodStartTime`, etc.) are Unix timestamps in **seconds**.
- The Shopee Vietnam platform runs strictly on **Asia/Ho_Chi_Minh (GMT+7)**.
- Localized conversion formula:
  $$\text{Datetime}_{\text{GMT}+7} = \text{UTC} + 7 \text{ hours}$$

**Correctly computed timestamp examples (GMT+7):**
- `1792861200` = `2026-10-25 00:00:00 GMT+7` (Start of order completion period).
- `1792947599` = `2026-10-25 23:59:59 GMT+7` (End of order completion period).
- `1788282000` = `2026-09-02 00:00:00 GMT+7` (Start of Sep fee invoice period).
- `1790873999` = `2026-10-01 23:59:59 GMT+7` (End of Sep fee invoice period).

---

## 4. Contract Specification: Daily Billing & Settlement Feed

### 4.1 Endpoint & Scope Attribution
- **Endpoint in Codebase:** `/api/v3/payment/billing_list` (queried with parameters `order_completed_start_time` and `order_completed_end_time`).
- **Observed Feed Scope:** 335 daily settlement records spanning order completion start dates from **2025-11-01 00:00:00 GMT+7** (`1761930000`) to **2026-10-25 00:00:00 GMT+7** (`1792861200`), with completion end dates up to **2026-10-25 23:59:59 GMT+7** (`1792947599`).
- **Completeness Caveat:** This feed reflects the records returned by the specific query parameters of the captured session. It must not be assumed to represent an exhaustive or complete calendar year.
- **Sample Fixture:** [`examples/shopee/billing_list.sample.json`](examples/shopee/billing_list.sample.json) (5 representative records preserving envelope, root `income_breakdown`, and nested arrays).

### 4.2 Envelope & Root Properties

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "list": [ /* array of daily settlement records */ ],
    "is_terminated": false,
    "income_breakdown": { /* aggregate across query scope */ },
    "pending_payout_amount": 1721600000,
    "pending_payout_amount_dis": "17216"
  }
}
```

> [!NOTE]
> `data.is_terminated` is a native boolean `false` (not integer `0`).

### 4.3 Root `income_breakdown` Semantics
The root `data.income_breakdown` object is an **aggregate total across the entire query scope** (all 335 records in the observed production feed), **not** an invoice-level or per-record breakdown.

- **Observed Channel Attribution in Feed Scope:**
  - `shopee_video`: $8,197,715$ VND net ($8,261,185$ VND seller comm + $17,667$ VND shopee comm $-$ $81,137$ VND service fee).
  - `social_medias`: $537,762$ VND net ($245,157$ VND seller comm + $297,925$ VND shopee comm $-$ $5,320$ VND service fee).
  - `shopee_live`: $0$ VND.
  - `total_payment_amount`: $8,735,477$ VND ($873,547,700,000$ raw).
  - `service_fee`: $86,457$ VND ($8,645,700,000$ raw).
- **Exact Arithmetic Check across 335 records:**
  - Summing `total_payment_amount` across all 335 daily records:
    $$\sum_{i=1}^{335} \text{total\_payment\_amount}_i = 873,547,700,000 \text{ raw} = \mathbf{8,735,477 \text{ VND}}$$
    *(Matches `data.income_breakdown.total_payment_amount` to the exact integer).*
  - Summing `eligible_total_amount` across all 335 daily records:
    $$\sum_{i=1}^{335} \text{eligible\_total\_amount}_i = 882,193,400,000 \text{ raw} = \mathbf{8,821,934 \text{ VND}}$$

### 4.4 Daily Record Fields & Dictionary

Each item in `data.list` represents a single daily batch of completed orders:

| Field | JSON Type | Description / Observed Values | Epistemic Status |
| :--- | :--- | :--- | :--- |
| `validation_id` | String | Unique string identifier for daily validation slice. In fixtures: `DEMO_VAL_0001` .. `DEMO_VAL_0005`. | Observed |
| `payout_id` | String | Foreign key linking to Payout batch (`payoutId`). Empty string `""` when unsettled/pending. In fixtures: `DEMO_PAYOUT_0001` .. `DEMO_PAYOUT_0010`. | Observed |
| `validation_month` | Integer | Year-month of validation (e.g. `202610`, `202609`). Range: `202511` to `202610`. | Observed |
| `order_completed_period_start_time` | Integer | Epoch seconds for start of completion window (GMT+7). | Observed |
| `order_completed_period_end_time` | Integer | Epoch seconds for end of completion window (GMT+7). | Observed |
| `eligible_total_amount` | Integer | Daily gross commission before daily service fee deduction ($100,000$ factor). Non-zero across all 335 records. | Observed |
| `total_payment_amount` | Integer | Daily net payable commission after daily platform fee ($100,000$ factor). Non-zero across all 335 records. | Observed |
| `brand_commission` | Integer | Seller-funded commission ($100,000$ factor). Non-zero across all 335 records. | Observed |
| `shopee_commission` | Integer | Shopee-funded commission ($100,000$ factor). Non-zero in 46 records, `0` in 289 records. | Observed |
| `bonus_commission` | Integer | Observed value: `0` across all 335 records. | Observed |
| `mcn_management_fee` | Integer | Observed value: `0` across all 335 records (`is_mcn: 0`). | Observed |
| `payment_status` | Integer | Numeric code `8` observed across all 335 records. | Observed (Semantics unverified without official enum) |
| `invoice_status` | Integer | Numeric code `0` observed across all 335 records. | Observed (Semantics unverified) |
| `overall_validation_status` | Integer | Numeric code `3` observed across all 335 records. | Observed (Semantics unverified) |
| `validation_payout_status` | Integer | Numeric code `2` observed in 334 records; code `1` in 1 record (co-occurring with `payout_id: ""`). | Observed (Co-occurs with settlement assignment) |
| `account_type` | Integer | Numeric code `3` observed across all 335 records. | Observed (Individual affiliate context) |
| `paid_failed_reason_type` | Integer | Numeric code `601` observed across all 335 records. Co-occurs with successful offline bank payout. | Observed (No failure string present) |
| `bills` | Array | Array of bill line items (always 1 element per record in observed feed), detailing validated orders and VAT/WHT base amounts. | Observed |
| `service_fees` | Array | Array of platform fee deductions (4 entries when `shopee_commission == 0`, 5 entries when `shopee_commission > 0`). Channels: `bill_source` 2, 5, 6, 7. | Observed |

---

## 5. Contract Specification: Payout Batch Feed (`getPaymentPayoutBillingList`)

### 5.1 Endpoint & Scope Attribution
- **Endpoint in Codebase:** GraphQL query `getPaymentPayoutBillingList` via `/api/v3/gql`.
- **Observed Scope:** Page 1 containing 10 payout records (`pageSize: 10`). Pagination declares `totalCount: "99"`.
- **Completeness Caveat:** This response contains 10 records out of 99 in the query scope. It is **not** complete without multi-page traversal. Furthermore, absent explicit request query parameters, `totalCount: "99"` reflects the total items matching the current query scope, not necessarily an unfiltered account lifetime.
- **Sample Fixture:** [`examples/shopee/payment_payout_billing_list.sample.json`](examples/shopee/payment_payout_billing_list.sample.json).

### 5.2 Envelope & Root Properties

```json
{
  "data": {
    "getPaymentPayoutBillingList": {
      "payoutList": [ /* array of 10 payout batch records */ ],
      "payoutTotalAmount": "869732700000",
      "payoutBreakdown": { /* breakdown structure across query scope */ },
      "pagination": {
        "pageNum": 1,
        "pageSize": 10,
        "totalCount": "99"
      }
    }
  }
}
```

### 5.3 `payoutTotalAmount` vs Page 1 Sums
- `payoutTotalAmount: "869732700000"` represents **$8,697,327$ VND**.
- This root aggregate represents the total net amount across all 99 payouts matching the query scope, **not** the sum of Page 1 rows.
- Page 1 actual sums (10 rows):
  - $\sum \text{eligibleTotalAmount} (\text{Page 1 Gross}) = 47,484,000,000 \text{ raw} = \mathbf{474,840 \text{ VND}}$.
  - $\sum \text{totalPaymentAmount} (\text{Page 1 Net}) = 44,925,300,000 \text{ raw} = \mathbf{449,253 \text{ VND}}$.

### 5.4 Payout Record Item Schema (`payoutList[i]`)

| Field | JSON Type | Description / Observed Values | Epistemic Status |
| :--- | :--- | :--- | :--- |
| `payoutId` | String | Disbursement batch ID. In fixtures: `DEMO_PAYOUT_0001` .. `DEMO_PAYOUT_0010`. Maps 1-to-many to `payout_id` in Billing feed. | Observed |
| `eligibleTotalAmount` | String | Numeric string ($100,000$ factor). **Batch Gross commission** before payout deductions. | Derived (Canonical Gross) |
| `totalPaymentAmount` | String | Numeric string ($100,000$ factor). **Batch Net disbursement** transferred to bank. | Observed |
| `payoutPaymentStatus` | Integer | Observed codes: `1` (co-occurs with `payArrivalTime: "0"`), `10` (co-occurs with non-zero arrival timestamp). | Observed (Semantics unverified without official enum) |
| `paidFailedReasonType` | Integer | Numeric code `601`. Co-occurs with completed bank transfers. | Observed |
| `payoutCreatedTime` | String | Epoch seconds string when payout batch was formed. | Observed |
| `payArrivalTime` | String | Epoch seconds string when transfer cleared at bank (`"0"` if pending). | Observed |
| `transferredToOffline` | Integer | Numeric code `1`. Co-occurs with bank transfer routing. | Observed |
| `accountType` | Integer | Numeric code `3`. | Observed |

---

## 6. Contract Specification: Monthly Platform Service Fee Invoices (`getPaymentSummaryBillFeeInvoiceList`)

### 6.1 Endpoint & Scope Attribution
- **Endpoint in Codebase:** GraphQL query `getPaymentSummaryBillFeeInvoiceList` via `/api/v3/gql`.
- **Observed Scope:** Exactly 9 monthly invoice periods (`totalCount: 9`), from January 2026 to September 2026.
- **Sample Fixture:** [`examples/shopee/service_fee_invoice_list.sample.json`](examples/shopee/service_fee_invoice_list.sample.json).

### 6.2 The Shifting Invoice Period (Day 02 to Day 01 Next Month)
In Shopee's platform fee billing cycle, each invoice does **not** follow the calendar month (1st to 30th/31st). Instead, each invoice period starts on **Day 02 at 00:00:00 GMT+7** and concludes on **Day 01 of the following month at 23:59:59 GMT+7**:

| Period Start (GMT+7) | Period End (GMT+7) | Raw `totalServiceFee` | Fee in VND | Canonical Fee Month | Invoice Number |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 2026-09-02 00:00:00 | 2026-10-01 23:59:59 | `449900000` | **4,499 VND** | **2026-09** | `DEMO_INV_2026-09` |
| 2026-08-02 00:00:00 | 2026-09-01 23:59:59 | `651700000` | **6,517 VND** | **2026-08** | `DEMO_INV_2026-08` |
| 2026-07-02 00:00:00 | 2026-08-01 23:59:59 | `443700000` | **4,437 VND** | **2026-07** | `DEMO_INV_2026-07` |
| 2026-06-02 00:00:00 | 2026-07-01 23:59:59 | `337100000` | **3,371 VND** | **2026-06** | `DEMO_INV_2026-06` |
| 2026-05-02 00:00:00 | 2026-06-01 23:59:59 | `634900000` | **6,349 VND** | **2026-05** | `DEMO_INV_2026-05` |
| 2026-04-02 00:00:00 | 2026-05-01 23:59:59 | `570900000` | **5,709 VND** | **2026-04** | `DEMO_INV_2026-04` |
| 2026-03-02 00:00:00 | 2026-04-01 23:59:59 | `976700000` | **9,767 VND** | **2026-03** | `DEMO_INV_2026-03` |
| 2026-02-02 00:00:00 | 2026-03-01 23:59:59 | `683800000` | **6,838 VND** | **2026-02** | `DEMO_INV_2026-02` |
| 2026-01-02 00:00:00 | 2026-02-01 23:59:59 | `1199900000` | **11,999 VND** | **2026-01** | `DEMO_INV_2026-01` |

$$\sum_{i=1}^9 \text{totalServiceFee} = 4,499 + 6,517 + 4,437 + 3,371 + 6,349 + 5,709 + 9,767 + 6,838 + 11,999 = \mathbf{59,486 \text{ VND}}$$

### 6.3 Rules for Assigning Fee Month
1. **Assign by `paymentCompletePeriodStartTime` Month (Start Month):** The fee belongs to the month of the starting timestamp in GMT+7. For example, `2026-09-02` to `2026-10-01` is assigned to **September 2026 (`2026-09`)**.
2. **Never Blindly Subtract One Month:** The period start date explicitly determines the billing cycle. Do not look at the file generation timestamp or arbitrary invoice metadata to subtract a month.
3. **October 2026 Fee is Missing, Not Zero:** The sample ends at September 2026 (`DEMO_INV_2026-09`). The October 2026 fee is **MISSING** (not yet issued/closed at capture time), **not zero**.
4. **No Proration for Partial Calendar Periods:** Service fees apply to the full designated period and are not prorated over calendar slices.

### 6.4 Deduplication Rule: PDF vs XLSX Invoices
Under each monthly period, `paymentSummaryBillFeeInvoices` contains two file entries:
- File 1: PDF invoice (`invoiceType: 54`)
- File 2: Excel line-item breakdown (`invoiceType: 57`)

Both entries carry the **exact same `invoiceNumber`** (e.g. `DEMO_INV_2026-09`) and represent the **same single fee amount** (`totalServiceFee`).
> [!CAUTION]
> **Deduplication Invariant:** Parsers must deduplicate records by `invoiceNumber` (or process only the parent period `totalServiceFee`). Aggregating across both file attachment rows will artificially double the service fee.

---

## 7. Deep-Dive Case Study: Payout `38,230` VND Reconciliation (`DEMO_PAYOUT_0005`)

To prove the exact mathematical relationship between daily completed order billing batches, batch payout gross/net, daily service fee reductions, and batch-level personal tax withholding, this section provides an exhaustive walkthrough of Payout `DEMO_PAYOUT_0005` (fixture: [`examples/shopee/payout_38230_reconciliation.sample.json`](examples/shopee/payout_38230_reconciliation.sample.json)).

### 7.1 Payout Batch Timestamps & Key Properties
From `payment_payout_billing_list.sample.json` (`DEMO_PAYOUT_0005`):
- `payoutCreatedTime`: `1791140407` $\rightarrow$ **2026-10-05 02:00:07 GMT+7** (Date of payout batch creation / *Ngày đối soát*).
- `payArrivalTime`: `1791445833` $\rightarrow$ **2026-10-08 14:50:33 GMT+7** (Date funds cleared at bank / *Ngày tiền về*).
- `eligibleTotalAmount`: `"3823000000"` $\rightarrow$ **$38,230$ VND (Canonical Payout Gross)**.
- `totalPaymentAmount`: `"3403000000"` $\rightarrow$ **$34,030$ VND (Batch Net Disbursed)**.

### 7.2 The 4 Matching Daily Billing Records (Cross-Month Completion Window)
Joining the billing feed across the full dataset by `payout_id == "DEMO_PAYOUT_0005"` yields exactly 4 daily records spanning order completion dates from **2026-09-30** to **2026-10-03**:

| Validation ID | Completion Date (GMT+7) | Gross (`eligible`) | Daily Net (`total`) | Daily Reduction (Fee) | Channel Breakdown |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DEMO_VAL_0006` | **2026-09-30** | $7,002$ VND | $6,933$ VND | $69$ VND | Brand: $7,002$ / Shopee: $0$ |
| `DEMO_VAL_0007` | **2026-10-01** | $9,557$ VND | $9,463$ VND | $94$ VND | Brand: $5,677$ / Shopee: $3,880$ |
| `DEMO_VAL_0008` | **2026-10-02** | $19,671$ VND | $19,478$ VND | $193$ VND | Brand: $19,671$ / Shopee: $0$ |
| `DEMO_VAL_0004` | **2026-10-03** | $2,000$ VND | $1,980$ VND | $20$ VND | Brand: $2,000$ / Shopee: $0$ |
| **Sum of 4 Records** | **Cross-Month (Sep–Oct)** | **$38,230$ VND** | **$37,854$ VND** | **$376$ VND** | *(Sum of daily reductions)* |

#### Crucial Joins & Date Boundary Observations
1. **Join by ID across whole cache, not date-filtered ledgers:** Order completion dates cross the month boundary (Sep 30 in September, Oct 01–03 in October). If a parser filters daily billing by calendar month, it will fragment the batch and misreconcile Payout `DEMO_PAYOUT_0005`. Joins must be performed by `payout_id` across the entire cached billing dataset.
2. **Gross matches Payout Gross exactly:**
   $$7,002 + 9,557 + 19,671 + 2,000 = \mathbf{38,230 \text{ VND}}$$
3. **Daily Service Fee Reductions ($376$ VND):**
   $$69 + 94 + 193 + 20 = \mathbf{376 \text{ VND}}$$
   Notice that computing the fee as a single lump sum: $\text{round}(38,230 \times 0.0098) = \mathbf{375 \text{ VND}}$. The actual observed reduction is the **sum of per-day rounded amounts ($376$ VND)**, causing a $1$ VND rounding difference.
4. **Daily Service Fee Structure Overlap:**
   - In each record, `service_fees` contains 4 or 5 elements representing transaction source channels (`bill_source` 7, 6, 5, 2, 1).
   - In single-channel records (Sep 30, Oct 02, Oct 03), channels 7, 6, 5, and 2 each carry the identical aggregated service fee (e.g. $69$ VND).
   - In multi-channel records (Oct 01), channels 7, 6, 5 carry $94$ VND, while channel 2 carries $56$ VND and channel 1 carries $38$ VND ($56 + 38 = 94$ VND).
   - **MUST NOT NAIVELY SUM `service_fees`:** Naively summing all objects in the `service_fees` array yields $4 \times 376 = 1,504$ VND. The daily net deduction is strictly $\text{Gross} - \text{Net} = 376$ VND.

### 7.3 Reconciliation with User Screenshot & Portal Tax Breakdown
Across all 4 daily billing records:
- `wht_amount: 0`, `vat_amount: 0`, `sst_amount: 0`.
- `mcn_management_fee: 0`, `payment_shopee_adjustment: 0`.

Yet, comparing Billing Net with actual Payout Net:
$$\text{Billing Net} - \text{Payout Net} = 37,854 - 34,030 = \mathbf{3,824 \text{ VND}}$$

User portal screenshots and offline reference DOM (`#s1aBook`) explicitly confirm the exact breakdown of this $3,824$ VND difference:
- **Personal Income Tax (TNCN):** $1,912$ VND ($38,230 \times 5\% = 1,911.5 \rightarrow$ rounded to $1,912$ VND).
- **Value Added Tax (GTGT):** $1,912$ VND ($38,230 \times 5\% = 1,911.5 \rightarrow$ rounded to $1,912$ VND).
- **Total Tax Withheld:** $1,912 + 1,912 = \mathbf{3,824 \text{ VND}}$.
- **Net Cash Received:** $37,854 - 3,824 = \mathbf{34,030 \text{ VND}}$.

> [!IMPORTANT]
> **API Payload vs UI Rendering Reality:**
> The $1,912$ / $1,912$ tax split is confirmed from the **user's portal screenshot and offline reference UI**. The raw Shopee Payout API returns `totalPaymentAmount: "3403000000"` without explicit line-item tax fields. Production parsers should report the observed batch delta ($3,824$ VND) and allow UI breakdown, but must never inject synthetic tax fields into the raw response object.

---

## 8. Financial Reconciliation & Cross-Feed Invariants

### 8.1 Payout GROSS Before All Fees vs Billing Slices
A core architectural requirement is establishing **Canonical Payout GROSS** (before all fees and withholdings):

1. **Eligible Total Amount is Gross:**
   - In Payout Feed: `eligibleTotalAmount` is the total gross commission.
   - For the 10 rows on Page 1, total Gross is **$474,840$ VND**.
2. **Billing Slices Aggregate Exactly to Payout Gross:**
   - For every payout batch, summing `eligible_total_amount` across all daily billing slices with matching `payout_id` matches `paymentPayout.eligibleTotalAmount` to the exact integer:
     - `DEMO_PAYOUT_0001`: 4 billing slices $\rightarrow \sum \text{eligible} = 2,560,300,000 \text{ raw} = 25,603 \text{ VND}$ (Exact match).
     - `DEMO_PAYOUT_0002`: 4 billing slices $\rightarrow \sum \text{eligible} = 7,179,000,000 \text{ raw} = 71,790 \text{ VND}$ (Exact match).
     - `DEMO_PAYOUT_0003`: 3 billing slices $\rightarrow \sum \text{eligible} = 2,372,100,000 \text{ raw} = 23,721 \text{ VND}$ (Exact match).
     - `DEMO_PAYOUT_0004`: 2 billing slices $\rightarrow \sum \text{eligible} = 4,998,500,000 \text{ raw} = 49,985 \text{ VND}$ (Exact match).
     - `DEMO_PAYOUT_0005`: 4 billing slices $\rightarrow \sum \text{eligible} = 3,823,000,000 \text{ raw} = 38,230 \text{ VND}$ (Exact match).

### 8.2 Observed Reconciliation Difference & 10% Batch Gap
Comparing `paymentPayout.totalPaymentAmount` (Net disbursed) with the sum of daily `billing.total_payment_amount` (Daily Net):
- For payouts up to `DEMO_PAYOUT_0006`, Daily Net matches Payout Net exactly ($\Delta = 0$).
- Beginning with `DEMO_PAYOUT_0005` through `DEMO_PAYOUT_0001`, Payout Net is smaller than Daily Net by **exactly 10% of `eligibleTotalAmount`**:
  - `DEMO_PAYOUT_0005`: Daily Net $37,854$ VND vs Payout Net $34,030$ VND ($\Delta = 3,824$ VND observed difference matching portal tax preview screenshot: $2 \times \text{round}(5\% \times 38,230) = 1,912 + 1,912 = 3,824$ VND; noting $10\%$ of $38,230$ is $3,823$ VND; API returns lump sum net without itemized tax lines).
  - `DEMO_PAYOUT_0004`: Daily Net $49,496$ VND vs Payout Net $44,498$ VND ($\Delta = 4,998$ VND = $10\%$ of $49,985$ VND).
  - `DEMO_PAYOUT_0003`: Daily Net $23,489$ VND vs Payout Net $21,117$ VND ($\Delta = 2,372$ VND = $10\%$ of $23,721$ VND).
  - `DEMO_PAYOUT_0002`: Daily Net $71,086$ VND vs Payout Net $63,906$ VND ($\Delta = 7,180$ VND = $10\%$ of $71,790$ VND).
  - `DEMO_PAYOUT_0001`: Daily Net $25,353$ VND vs Payout Net $22,793$ VND ($\Delta = 2,560$ VND = $10\%$ of $25,603$ VND).

### 8.3 Global Feed Scope Arithmetic Difference
Observed root totals from the provided feeds:
- Root Billing Net (`billing.data.income_breakdown.total_payment_amount`): $8,735,477$ VND
- Root Payout Net (`payout.data.getPaymentPayoutBillingList.payoutTotalAmount`): $8,697,327$ VND
- Root Pending Payout (`billing.data.pending_payout_amount`): $17,216$ VND

Arithmetic difference across feeds:
$$8,735,477 - 8,697,327 - 17,216 = \mathbf{20,934 \text{ VND}}$$

> [!NOTE]
> This $20,934$ VND value is documented strictly as an **observed arithmetic difference** between the captured feed scopes. It must NOT be used to derive synthetic tax rates (e.g. 5% VAT or PIT) or legal conclusions without official backing.

### 8.4 Calendar Mismatch Between Monthly Invoices and Monthly Payouts
- Monthly Payout Gross aggregates payouts disbursed within calendar month $M$ (or created within month $M$).
- Monthly Fee Invoices span shifted dates (Day 02 of month $M$ to Day 01 of month $M+1$).
- **Net Balance Expectation:** Because the two feeds run on different calendar boundaries, $\text{Gross Payout} - \text{Fee Invoice}$ will **not balance to Net Disbursement** within a single calendar month. Systems must treat monthly fee invoices as periodic overhead rather than per-order settlement deductions.

---

## 9. Compact Field Dictionary (Paths & Types)

| Feed Path | JSON Type | Units / Scale | Nullable / Sentinel | Description |
| :--- | :--- | :--- | :--- | :--- |
| `billing.data.pending_payout_amount` | Integer | $100,000$ raw VND | `0` if none | Amount awaiting payout assignment. |
| `billing.data.is_terminated` | Boolean | `false` observed | Boolean | Account termination flag. |
| `billing.data.list[].validation_id` | String | String alias | Unique | Primary key for daily settlement slice (`DEMO_VAL_*`). |
| `billing.data.list[].payout_id` | String | String alias | `""` if pending | Foreign key to Payout batch (`DEMO_PAYOUT_*`). |
| `billing.data.list[].order_completed_period_start_time` | Integer | Epoch seconds | Not null | Window start (GMT+7). |
| `billing.data.list[].order_completed_period_end_time` | Integer | Epoch seconds | Not null | Window end (GMT+7). |
| `billing.data.list[].eligible_total_amount` | Integer | $100,000$ raw VND | Non-zero | Daily gross commission before service fee. |
| `billing.data.list[].total_payment_amount` | Integer | $100,000$ raw VND | Non-zero | Daily net payable commission. |
| `billing.data.list[].brand_commission` | Integer | $100,000$ raw VND | Non-zero | Seller-funded commission. |
| `billing.data.list[].shopee_commission` | Integer | $100,000$ raw VND | Zero / Non-zero | Shopee platform-funded commission. |
| `billing.data.list[].bills[].order_quantity` | Integer | Count $\ge 1$ | Not null | Total completed affiliate orders in batch. |
| `billing.data.list[].service_fees[].service_fee` | Integer | $100,000$ raw VND | Non-zero | Platform service fee deduction for channel. |
| `payout.data.getPaymentPayoutBillingList.payoutTotalAmount` | String | $100,000$ raw VND | Non-empty | Query-scope net payout sum across 99 payouts. |
| `payout.data.getPaymentPayoutBillingList.payoutList[].paymentPayout.payoutId` | String | String alias | Unique | Payout batch identifier (`DEMO_PAYOUT_*`). |
| `payout.data.getPaymentPayoutBillingList.payoutList[].paymentPayout.eligibleTotalAmount` | String | $100,000$ raw VND | Non-empty | Batch Gross commission. |
| `payout.data.getPaymentPayoutBillingList.payoutList[].paymentPayout.totalPaymentAmount` | String | $100,000$ raw VND | Non-empty | Batch Net disbursed funds. |
| `payout.data.getPaymentPayoutBillingList.pagination.totalCount` | String | String integer | `"99"` observed | Payout count in query scope. |
| `fee.data.getPaymentSummaryBillFeeInvoiceList.totalCount` | Integer | Integer count | `9` observed | Number of fee invoice periods in query scope. |
| `fee.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices[].totalServiceFee` | String | $100,000$ raw VND | Non-empty | Monthly service fee amount. |
| `fee.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices[].paymentCompletePeriodStartTime` | String | Epoch seconds | Non-empty | Period start timestamp (Day 02 00:00:00 GMT+7). |
| `fee.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices[].paymentCompletePeriodEndTime` | String | Epoch seconds | Non-empty | Period end timestamp (Day 01 23:59:59 GMT+7). |
| `fee.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices[].paymentSummaryBillFeeInvoices[].invoiceNumber` | String | String alias | Deduplicate | Tax invoice number (shared across PDF/XLSX). |

---

## 10. Verification & Regression Assertions

The following standalone Python commands verify the mathematical, structural, and deduplication contracts against the fixture files:

```bash
# 1. Verify JSON syntax and structural validity
python3 -c "
import json
for p in [
    'docs/examples/shopee/billing_list.sample.json',
    'docs/examples/shopee/payment_payout_billing_list.sample.json',
    'docs/examples/shopee/service_fee_invoice_list.sample.json',
    'docs/examples/shopee/payout_38230_reconciliation.sample.json'
]:
    with open(p) as f:
        json.load(f)
print('ALL FIXTURES PASS JSON SYNTAX VALIDATION')
"

# 2. Verify Monthly Fee Invoices sum and deduplication invariant
python3 -c "
import json
with open('docs/examples/shopee/service_fee_invoice_list.sample.json') as f:
    d = json.load(f)
invoices = d['data']['getPaymentSummaryBillFeeInvoiceList']['paymentSummaryBillFeeInvoices']
assert len(invoices) == 9, f'Expected 9 periods, got {len(invoices)}'

total_vnd = 0
for inv in invoices:
    amt = int(inv['totalServiceFee']) // 100000
    total_vnd += amt
    files = inv['paymentSummaryBillFeeInvoices']
    assert len(files) == 2, 'Expected PDF and XLSX attachments'
    assert files[0]['invoiceNumber'] == files[1]['invoiceNumber'], 'Invoice numbers must match'

assert total_vnd == 59486, f'Expected 59486 VND, got {total_vnd}'
print(f'FEE CONTRACT VERIFIED: 9 periods sum to {total_vnd} VND, deduplication confirmed.')
"

# 3. Verify Payout Page 1 Gross & Net sums
python3 -c "
import json
with open('docs/examples/shopee/payment_payout_billing_list.sample.json') as f:
    d = json.load(f)
p_list = d['data']['getPaymentPayoutBillingList']['payoutList']
assert len(p_list) == 10, 'Expected 10 payout items on Page 1'
page_gross = sum(int(x['paymentPayout']['eligibleTotalAmount']) for x in p_list) // 100000
page_net = sum(int(x['paymentPayout']['totalPaymentAmount']) for x in p_list) // 100000
assert page_gross == 474840, f'Expected Page Gross 474840 VND, got {page_gross}'
assert page_net == 449253, f'Expected Page Net 449253 VND, got {page_net}'
print(f'PAYOUT CONTRACT VERIFIED: Page Gross={page_gross} VND, Page Net={page_net} VND.')
"

# 4. Verify Payout 38,230 VND Case Study Reconciliation
python3 -c "
import json
with open('docs/examples/shopee/payout_38230_reconciliation.sample.json') as f:
    cs = json.load(f)

pp = cs['payoutRecord']['paymentPayout']
gross_payout = int(pp['eligibleTotalAmount']) // 100000
net_payout = int(pp['totalPaymentAmount']) // 100000
assert gross_payout == 38230
assert net_payout == 34030

bills = cs['billingRecords']
assert len(bills) == 4
sum_gross = sum(b['eligible_total_amount'] // 100000 for b in bills)
sum_net = sum(b['total_payment_amount'] // 100000 for b in bills)
daily_fee = sum_gross - sum_net

assert sum_gross == 38230
assert sum_net == 37854
assert daily_fee == 376

batch_diff = sum_net - net_payout
assert batch_diff == 3824
# 1912 TNCN + 1912 GTGT = 3824
assert batch_diff == 1912 + 1912
print('PAYOUT 38,230 CASE RECONCILIATION VERIFIED!')
"

# 5. Programmatic assertion: original ID substrings (e.g. 173600...) strictly absent
python3 -c "
import json
import re
for p in [
    'docs/examples/shopee/billing_list.sample.json',
    'docs/examples/shopee/payment_payout_billing_list.sample.json',
    'docs/examples/shopee/service_fee_invoice_list.sample.json',
    'docs/examples/shopee/payout_38230_reconciliation.sample.json',
    'docs/SHOPEE_RESPONSE_CONTRACTS.md',
    'docs/REA_PAYMENT_HISTORY_REFERENCE.md',
    'docs/examples/shopee/README.md'
]:
    with open(p) as f:
        text = f.read()
    matches = re.findall(r'173600\d+', text)
    assert len(matches) == 0, f'Found unredacted ID in {p}: {matches}'
print('PRIVACY & REDACTION VERIFIED: Zero raw source identifiers present.')
"
```
