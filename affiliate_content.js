/**
 * affiliate_content.js - Content script for Shopee Affiliate Payment & Payout pages
 * Automatically displays a floating action button on affiliate.shopee.vn/payment/payout_record
 * allowing one-click access to Sổ tay thuế 2026 & Revenue Excel Export.
 * Caches data with 24-hour TTL to prevent redundant API queries.
 */

(function () {
  "use strict";

  // Prevent multiple injections
  if (window.__shopeeAffiliateTaxInjected) return;
  window.__shopeeAffiliateTaxInjected = true;

  const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  function createFloatingButton() {
    const existing = document.getElementById("shopee-affiliate-tax-pill");
    if (existing) return;

    const pill = document.createElement("div");
    pill.id = "shopee-affiliate-tax-pill";
    pill.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">📊</span>
        <span>Sổ tay thuế & Xuất Excel Shopee</span>
      </div>
    `;

    Object.assign(pill.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "999999",
      background: "linear-gradient(135deg, #ee4d2d 0%, #ff6f59 100%)",
      color: "#ffffff",
      padding: "10px 18px",
      borderRadius: "999px",
      boxShadow: "0 6px 20px rgba(238, 77, 45, 0.4)",
      cursor: "pointer",
      fontFamily: "system-ui, -apple-system, sans-serif",
      fontSize: "13.5px",
      fontWeight: "700",
      letterSpacing: "0.2px",
      transition: "all 0.2s ease-in-out",
      userSelect: "none",
      display: "flex",
      alignItems: "center"
    });

    pill.addEventListener("mouseenter", () => {
      pill.style.transform = "translateY(-2px) scale(1.03)";
      pill.style.boxShadow = "0 8px 24px rgba(238, 77, 45, 0.55)";
    });

    pill.addEventListener("mouseleave", () => {
      pill.style.transform = "none";
      pill.style.boxShadow = "0 6px 20px rgba(238, 77, 45, 0.4)";
    });

    pill.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openTaxReport" });
    });

    document.body.appendChild(pill);
  }

  // Only sync if cache is missing, expired, or explicitly requested
  async function syncBillingData(force = false) {
    try {
      if (!chrome?.storage?.local) return;

      if (!force) {
        const cached = await new Promise(resolve => {
          chrome.storage.local.get([STORAGE_KEY], res => resolve(res?.[STORAGE_KEY] || null));
        });

        // If cache exists and is within TTL, skip API call completely
        if (cached && cached.updatedAt && (Date.now() - cached.updatedAt < CACHE_TTL_MS) && Array.isArray(cached.list) && cached.list.length > 0) {
          return;
        }
      }

      // Header cơ bản: portal gọi gql thành công với POST KHÔNG cần CSRF-token.
      // Chỉ thêm CSRF-token khi gặp 403/401, tìm token theo cơ chế portal:
      // 1) localStorage ConfigClient, 2) GET /api/v3/config/website, 3) cookie csrftoken.
      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Affiliate-Program-Type": "1"
      };

      const findCsrfInObject = (obj) => {
        const stack = [obj];
        if (obj && typeof obj === "object") {
          while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== "object") continue;
            for (const key of Object.keys(cur)) {
              if (key === "csrf_token" && typeof cur[key] === "string" && cur[key]) return cur[key];
              if (cur[key] && typeof cur[key] === "object") stack.push(cur[key]);
            }
          }
        }
        return null;
      };

      const discoverCsrfToken = async () => {
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            const v = localStorage.getItem(k);
            if (v && v.indexOf("csrf_token") !== -1) {
              try {
                const found = findCsrfInObject(JSON.parse(v));
                if (found) return found;
              } catch (_) {}
            }
          }
        } catch (_) {}
        try {
          const res = await fetch("/api/v3/config/website", { headers: { "Accept": "application/json" } });
          const fresh = res.headers && res.headers.get ? res.headers.get("csrf-token") : null;
          if (fresh) return fresh;
          try {
            const found = findCsrfInObject(JSON.parse(await res.text()));
            if (found) return found;
          } catch (_) {}
        } catch (_) {}
        const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);
        return null;
      };

      // Schema chính xác của GraphQL Shopee Affiliate (từ payout_record của portal):
      // mỗi kỳ chỉ có eligibleTotalAmount (Gross) + totalPaymentAmount (thực nhận), micro-unit (x100.000).
      const PAYOUT_QUERY = `
        query getPaymentPayoutBillingList($pageSize: Int, $pageNum: Int) {
          getPaymentPayoutBillingList(pageSize: $pageSize, pageNum: $pageNum) {
            payoutList {
              payoutDisplayVersion
              paymentPayout {
                accountType
                eligibleTotalAmount
                payoutCreatedTime
                payoutId
                totalPaymentAmount
                payoutPaymentStatus
                paidFailedReasonType
                payArrivalTime
                transferredToOffline
                cancelReason
                cancelType
                closeReason
              }
              payoutInvoice {
                invoiceType
                invoiceStatus
                dismissReason
              }
              payoutExternalInfo {
                mergeInvoiceStatus
                serviceFeeInvoiceStatus
              }
            }
            payoutTotalAmount
            pagination {
              pageNum
              pageSize
              totalCount
            }
          }
        }`;

      const payouts = [];
      const seenPayoutIds = new Set();
      const gqlIssues = [];
      let csrfToken = null;
      let tokenLookupDone = false;
      let gql403Count = 0;
      // Anti-bot pacing (theo SHOPEE_ANTIBOT_CRITERIA): nghỉ ngẫu nhiên 0.4-1.2s
      // giữa các trang GraphQL; HTTP 403 >=2 trong run -> dừng endpoint (§6b).
      const sleepJitter = (minMs, maxMs) =>
        new Promise((resolve) => setTimeout(resolve, minMs + Math.floor(Math.random() * (maxMs - minMs + 1))));
      // 1. GraphQL getPaymentPayoutBillingList - lặp đủ trang theo totalCount.
      // Chiến lược: POST không CSRF trước (chuẩn portal), chỉ thêm CSRF-token khi 403/401.
      let payoutIncomplete = false;
      let payoutSuccess = false;
      let payoutTotalCount = null;
      try {
        const PAGE_LIMIT = 20;
        for (let pageNum = 1; pageNum <= PAGE_LIMIT; pageNum++) {
          if (gql403Count >= 2) {
            payoutIncomplete = true;
            break; // circuit breaker anti-bot
          }
          if (pageNum > 1) await sleepJitter(400, 1200);
          const callGql = async (withCsrf) => {
            const hdrs = Object.assign({}, headers);
            if (withCsrf && csrfToken) hdrs["CSRF-token"] = csrfToken;
            const res = await fetch("/api/v3/gql?q=getPayoutList", {
              method: "POST",
              headers: hdrs,
              body: JSON.stringify({
                operationName: "getPaymentPayoutBillingList",
                query: PAYOUT_QUERY,
                variables: { pageSize: 50, pageNum: pageNum }
              })
            });
            const fresh = res.headers && res.headers.get ? res.headers.get("csrf-token") : null;
            if (fresh) csrfToken = fresh; // portal rotate token qua response header
            let json = null;
            try {
              json = await res.json();
            } catch (_) {}
            return { status: res.status, json: json };
          };

          let r = await callGql(Boolean(csrfToken));
          let node = r.json?.data?.getPaymentPayoutBillingList;
          if (!node && (r.status === 403 || r.status === 401)) {
            gql403Count++;
            // CSRF-token cookie sai/đổi => tìm token chuẩn rồi thử lại với header
            if (!tokenLookupDone) {
              tokenLookupDone = true;
              csrfToken = csrfToken || (await discoverCsrfToken());
            }
            if (csrfToken) {
              r = await callGql(true);
              node = r.json?.data?.getPaymentPayoutBillingList;
              if (!node && (r.status === 403 || r.status === 401)) gql403Count++;
            }
          }
          if (!node) {
            const errs = Array.isArray(r.json?.errors)
              ? r.json.errors.map(e => e.message).join("; ")
              : (r.json?.msg || r.json?.error_message || `HTTP ${r.status}`);
            gqlIssues.push(String(errs));
            payoutIncomplete = true;
            break;
          }
          if (Array.isArray(r.json?.errors) && r.json.errors.length > 0) {
            const errs = r.json.errors.map(e => e.message).join("; ");
            gqlIssues.push(`GraphQL partial errors: ${errs}`);
            payoutIncomplete = true;
          }
          const pList = Array.isArray(node.payoutList) ? node.payoutList : null;
          if (!pList) {
            gqlIssues.push("Dữ liệu Payout không đúng cấu trúc.");
            payoutIncomplete = true;
            break;
          }
          const rawTotal = parseInt(node.pagination?.totalCount, 10);
          if (!isNaN(rawTotal)) payoutTotalCount = rawTotal;

          let newItems = 0;
          for (const it of pList) {
            const pid = it?.paymentPayout?.payoutId || it?.payoutId;
            const normPid = pid !== undefined && pid !== null && String(pid).trim() !== "" ? String(pid).trim() : null;
            if (!normPid || seenPayoutIds.has(normPid)) continue;
            seenPayoutIds.add(normPid);
            payouts.push(it);
            newItems++;
          }

          if (pageNum === 1) {
            payoutSuccess = true;
          }

          if (payoutTotalCount === 0) break;
          if (payoutTotalCount !== null && payoutTotalCount > 0 && payouts.length >= payoutTotalCount) break;

          if (pList.length === 0 || newItems === 0) {
            if (payoutTotalCount !== null && payoutTotalCount > 0 && payouts.length < payoutTotalCount) {
              payoutIncomplete = true;
              gqlIssues.push(`Dừng tải sớm: nhận ${payouts.length}/${payoutTotalCount} bản ghi Payout.`);
            }
            break;
          }

          if (payoutTotalCount === null) {
            const actualPageSize = parseInt(node.pagination?.pageSize || node.pageSize || 0, 10) || 50;
            if (pList.length < actualPageSize) break;
          }

          if (pageNum === PAGE_LIMIT) {
            if (payoutTotalCount === null || payouts.length < payoutTotalCount) {
              payoutIncomplete = true;
            }
          }
        }
        if (payoutTotalCount !== null && payoutTotalCount > 0 && payouts.length < payoutTotalCount) {
          payoutIncomplete = true;
        }
      } catch (_) {
        payoutIncomplete = true;
      }

      // 2. Billing List theo ngày hoàn thành đơn (kê khai + các tháng không có payout)
      const currentYear = new Date().getFullYear();
      const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
      const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);
      let billingList = [];
      let isBillingSuccess = false;
      try {
        const url = `/api/v3/payment/billing_list?order_completed_start_time=${s}&order_completed_end_time=${e}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data?.list) && json.data.list.every(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))) {
          billingList = json.data.list;
          isBillingSuccess = true;
        }
      } catch (_) {}

      // 3. GraphQL getPaymentSummaryBillFeeInvoiceList - Hóa đơn phí dịch vụ điện tử (service_fee_invoice)
      const feeInvoices = [];
      const seenFeeKeys = new Set();
      let feeTotalCount = null;
      let feeIncomplete = false;

      const FEE_INVOICE_QUERY = `
        query GetPaymentSummaryBillFeeInvoiceListQuery($pageNum: Int, $pageSize: Int, $serviceFeeInvoiceFilter: ServiceFeeInvoiceFilterInput) {
          getPaymentSummaryBillFeeInvoiceList(pageNum: $pageNum, pageSize: $pageSize, serviceFeeInvoiceFilter: $serviceFeeInvoiceFilter) {
            pageNum
            pageSize
            paymentSummaryBillFeeInvoices {
              paymentCompletePeriodStartTime
              paymentCompletePeriodEndTime
              totalServiceFee
              paymentSummaryBillFeeInvoices {
                invoiceNumber
                invoiceStatus
                fileUrl
              }
            }
            totalCount
          }
        }`;
      try {
        const PAGE_LIMIT = 20;
        for (let pageNum = 1; pageNum <= PAGE_LIMIT; pageNum++) {
          if (gql403Count >= 2) {
            feeIncomplete = true;
            break;
          }
          if (pageNum > 1) await sleepJitter(400, 1200);

          const callFeeGql = async (withCsrf) => {
            const hdrs = Object.assign({}, headers);
            if (withCsrf && csrfToken) hdrs["CSRF-token"] = csrfToken;
            const res = await fetch("/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList", {
              method: "POST",
              headers: hdrs,
              body: JSON.stringify({
                operationName: "GetPaymentSummaryBillFeeInvoiceListQuery",
                query: FEE_INVOICE_QUERY,
                variables: { pageSize: 50, pageNum: pageNum, serviceFeeInvoiceFilter: {} }
              })
            });
            const fresh = res.headers && res.headers.get ? res.headers.get("csrf-token") : null;
            if (fresh) csrfToken = fresh;
            let json = null;
            try { json = await res.json(); } catch (_) {}
            return { status: res.status, json: json };
          };

          let r = await callFeeGql(Boolean(csrfToken));
          let node = r.json?.data?.getPaymentSummaryBillFeeInvoiceList;
          if (!node && (r.status === 403 || r.status === 401)) {
            gql403Count++;
            if (!tokenLookupDone) {
              tokenLookupDone = true;
              csrfToken = csrfToken || (await discoverCsrfToken());
            }
            if (csrfToken) {
              r = await callFeeGql(true);
              node = r.json?.data?.getPaymentSummaryBillFeeInvoiceList;
              if (!node && (r.status === 403 || r.status === 401)) gql403Count++;
            }
          }

          if (!node) {
            feeIncomplete = true;
            break;
          }

          if (Array.isArray(r.json?.errors) && r.json.errors.length > 0) {
            feeIncomplete = true;
          }

          const invList = Array.isArray(node.paymentSummaryBillFeeInvoices) ? node.paymentSummaryBillFeeInvoices : null;
          if (!invList) {
            feeIncomplete = true;
            break;
          }

          const rawTotal = parseInt(node.totalCount, 10);
          if (!isNaN(rawTotal)) feeTotalCount = rawTotal;

          let newItems = 0;
          for (const inv of invList) {
            const invNum = inv.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || inv.invoiceNumber || "";
            const periodStart = inv.paymentCompletePeriodStartTime || "";
            const dedupKey = invNum ? `${periodStart}_${invNum}` : `${periodStart}_${inv.totalServiceFee ?? 0}`;
            if (seenFeeKeys.has(dedupKey)) continue;
            seenFeeKeys.add(dedupKey);

            feeInvoices.push({
              isFeeInvoice: true,
              paymentCompletePeriodStartTime: inv.paymentCompletePeriodStartTime,
              paymentCompletePeriodEndTime: inv.paymentCompletePeriodEndTime,
              totalServiceFee: inv.totalServiceFee,
              invoiceNumber: invNum
            });
            newItems++;
          }

          if (feeTotalCount === 0) break;
          if (feeTotalCount !== null && feeTotalCount > 0 && feeInvoices.length >= feeTotalCount) break;

          if (invList.length === 0 || newItems === 0) {
            if (feeTotalCount !== null && feeTotalCount > 0 && feeInvoices.length < feeTotalCount) {
              feeIncomplete = true;
            }
            break;
          }

          if (feeTotalCount === null) {
            const actualPageSize = parseInt(node.pageSize || 0, 10) || 50;
            if (invList.length < actualPageSize) break;
          }

          if (pageNum === PAGE_LIMIT) {
            if (feeTotalCount === null || feeInvoices.length < feeTotalCount) {
              feeIncomplete = true;
            }
          }
        }

        if (feeTotalCount !== null && feeTotalCount > 0 && feeInvoices.length < feeTotalCount) {
          feeIncomplete = true;
        }
      } catch (_) {
        feeIncomplete = true;
      }

      chrome.storage.local.get([STORAGE_KEY], (stored) => {
        const rawExisting = stored?.[STORAGE_KEY]?.list;
        const existingList = Array.isArray(rawExisting)
          ? rawExisting.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
          : [];
        const prevPayouts = existingList.filter(x => x && (x.paymentPayout || x.payoutId || x.payoutCreatedTime || x.payArrivalTime) && !x.isFeeInvoice);
        const prevBilling = existingList.filter(x => !x.paymentPayout && !x.payoutId && !x.payoutCreatedTime && !x.payArrivalTime && !x.isFeeInvoice && x.order_completed_period_start_time);
        const prevInvoices = existingList.filter(x => x.isFeeInvoice);
        const getPayoutId = (it) => {
          const raw = it?.paymentPayout?.payoutId ?? it?.payoutId;
          return raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : null;
        };

        let finalPayouts = [];
        let payoutWarning = "";

        if (payoutSuccess === true && !payoutIncomplete) {
          finalPayouts = payouts;
        } else if (payouts.length > 0) {
          const newIds = new Set(payouts.map(getPayoutId).filter(Boolean));
          const retained = prevPayouts.filter(x => {
            const id = getPayoutId(x);
            return id ? !newIds.has(id) : true;
          });
          finalPayouts = [...payouts, ...retained];
          payoutWarning = "Chưa tải đủ kỳ thanh toán Payout Record";
        } else if (prevPayouts.length > 0) {
          finalPayouts = prevPayouts;
          payoutWarning = "Không thể làm mới Payout Record";
        } else {
          finalPayouts = [];
          if (payoutSuccess !== true || payoutIncomplete) {
            payoutWarning = gqlIssues.length > 0 ? `Payout lỗi: ${gqlIssues.join(" | ")}` : "Không thể làm mới Payout Record";
          }
        }

        let finalBillingList = [];
        let billingWarning = "";
        if (isBillingSuccess) {
          finalBillingList = billingList;
        } else {
          finalBillingList = prevBilling;
          billingWarning = "Không thể làm mới billing_list";
        }

        let finalFeeInvoices = [];
        if (feeInvoices.length > 0) {
          if (feeIncomplete && prevInvoices.length > 0) {
            const getFeeMonthKey = (it) => {
              if (it.monthKey) return it.monthKey;
              const rawS = it.paymentCompletePeriodStartTime ? Number(it.paymentCompletePeriodStartTime) : 0;
              const s = rawS >= 1e11 ? Math.floor(rawS / 1000) : Math.floor(rawS);
              if (s) {
                const dt = new Date(s * 1000 + 7 * 3600000);
                return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
              }
              return null;
            };
            const newMonths = new Set(feeInvoices.map(getFeeMonthKey).filter(Boolean));
            const keptPrev = prevInvoices.filter(x => !newMonths.has(getFeeMonthKey(x)));
            finalFeeInvoices = [...feeInvoices, ...keptPrev];
          } else {
            finalFeeInvoices = feeInvoices;
          }
        } else if (prevInvoices.length > 0) {
          if (feeTotalCount === 0 && !feeIncomplete) {
            finalFeeInvoices = [];
          } else {
            finalFeeInvoices = prevInvoices;
          }
        }

        // On complete source failure for revenue, DO NOT replace existing valid cache with invoice-only data!
        // Only guard against wipeout when NOT authoritative success for both revenue APIs
        const isBothRevenueAuthoritative = payoutSuccess === true && !payoutIncomplete && isBillingSuccess;
        if (finalPayouts.length === 0 && finalBillingList.length === 0 && !isBothRevenueAuthoritative) {
          return;
        }

        const cacheWarnings = [];
        if (payoutWarning) cacheWarnings.push(payoutWarning);
        if (billingWarning) cacheWarnings.push(billingWarning);
        if (feeIncomplete) cacheWarnings.push("HĐ phí DV chưa đầy đủ");
        if (finalPayouts.length === 0 && (payoutSuccess !== true || payoutIncomplete || gqlIssues.length > 0)) {
          if (!cacheWarnings.some(w => w.includes("Payout"))) {
            cacheWarnings.push(gqlIssues.length > 0 ? `Payout lỗi: ${gqlIssues.join(" | ")}` : "Không thể làm mới Payout Record");
          }
        }

        chrome.storage.local.set({
          [STORAGE_KEY]: {
            updatedAt: Date.now(),
            list: [...finalPayouts, ...finalBillingList, ...finalFeeInvoices],
            warnings: cacheWarnings
          }
        });
      });
    } catch (_) {
      // Ignore background fetch errors
    }
  }

  // Initialize after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      createFloatingButton();
      syncBillingData();
    });
  } else {
    createFloatingButton();
    syncBillingData();
  }
})();
