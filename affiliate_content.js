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

      // Lấy CSRF token từ cookies hoặc localStorage (trang dùng header CSRF-token)
      const getCsrfToken = () => {
        const match = document.cookie.match(/(?:^|;\s*)(?:csrftoken|SPC_CSRF|csrf_token)=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
        try {
          return localStorage.getItem("csrf_token") || localStorage.getItem("SPC_CSRF") || "";
        } catch (_) {
          return "";
        }
      };

      const csrf = getCsrfToken();
      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Affiliate-Program-Type": "1"
      };
      if (csrf) {
        headers["CSRF-token"] = csrf;
        headers["x-csrftoken"] = csrf;
      }

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
              payoutInvoice
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
      // 1. GraphQL getPaymentPayoutBillingList - lặp đủ trang theo totalCount
      try {
        const PAGE_LIMIT = 20;
        let totalCount = 0;
        for (let pageNum = 1; pageNum <= PAGE_LIMIT; pageNum++) {
          const gqlRes = await fetch("/api/v3/gql?q=getPayoutList", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
              operationName: "getPaymentPayoutBillingList",
              query: PAYOUT_QUERY,
              variables: { pageSize: 100, pageNum: pageNum }
            })
          });
          const gqlJson = await gqlRes.json();
          const node = gqlJson?.data?.getPaymentPayoutBillingList;
          if (!node) break;
          const pList = Array.isArray(node.payoutList) ? node.payoutList : [];
          let newItems = 0;
          for (const it of pList) {
            const pid = it?.paymentPayout?.payoutId || it?.payoutId;
            if (!pid || seenPayoutIds.has(pid)) continue;
            seenPayoutIds.add(pid);
            payouts.push(it);
            newItems++;
          }
          const total = parseInt(node.pagination?.totalCount || 0, 10) || 0;
          if (total > 0) totalCount = total;
          if (newItems === 0) break;
          if (totalCount > 0 && payouts.length >= totalCount) break;
          if (pList.length === 0) break;
        }
      } catch (_) {}

      // 2. Billing List theo ngày hoàn thành đơn (kê khai + các tháng không có payout)
      const currentYear = new Date().getFullYear();
      const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
      const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);
      let billingList = [];
      try {
        const url = `/api/v3/payment/billing_list?order_completed_start_time=${s}&order_completed_end_time=${e}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data?.list)) {
          billingList = json.data.list;
        }
      } catch (_) {}

      if (payouts.length > 0 || billingList.length > 0) {
        chrome.storage.local.set({
          [STORAGE_KEY]: {
            updatedAt: Date.now(),
            list: [...payouts, ...billingList]
          }
        });
      }
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
