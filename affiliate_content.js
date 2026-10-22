/**
 * affiliate_content.js - Content script for Shopee Affiliate Payment & Payout pages
 * Automatically displays a floating action button on affiliate.shopee.vn/payment/payout_record
 * allowing one-click access to Sổ tay thuế 2026 & Revenue Excel Export.
 */

(function () {
  "use strict";

  // Prevent multiple injections
  if (window.__shopeeAffiliateTaxInjected) return;
  window.__shopeeAffiliateTaxInjected = true;

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

  // Auto cache billing list in background if on payout or billing page
  async function syncBillingData() {
    try {
      const currentYear = new Date().getFullYear();
      const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
      const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);
      const url = `/api/v3/payment/billing_list?order_completed_start_time=${s}&order_completed_end_time=${e}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data?.list)) {
        chrome.storage.local.set({ "shopee_affiliate_billing_cache_v1": json.data.list });
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
