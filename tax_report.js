/**
 * tax_report.js - Sổ tay thuế & Báo cáo doanh thu Shopee Affiliate
 */

(function () {
  "use strict";

  const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";
  const STORAGE_KEY_V1 = "shopee_affiliate_billing_cache_v1";
  const S1A_STORAGE_KEY = "shopee_affiliate_s1a_profile";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const SERVICE_FEE_RATE = 0.0098; // 0.98%

  let rawBillingList = [];
  let availableMonths = [];

  // Amounts từ Shopee trả về dạng micro-unit (x100.000), ví dụ "7179000000" = 71.790 đ
  // decomposePayout luôn nhận micro-unit (API thật / text dán / cache cũ đều x100.000 trước khi nhập)
  function decScale(val) {
    if (val === undefined || val === null || String(val).trim() === "") return 0;
    const num = Number(String(val).trim());
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.round(num / 100000);
  }

  // Đọc số tiền chuẩn xác từ response Shopee:
  // - Nếu trường _dis có mặt: ưu tiên _dis (giá trị VND, 0 là hợp lệ), hỗ trợ định dạng số nguyên hoặc phân tách chấm hàng nghìn
  // - Nếu không có _dis (bị xóa hoặc feed raw only): chia 100.000 từ raw integer
  function readMoneyAmount(disVal, rawVal) {
    if (disVal !== undefined && disVal !== null) {
      if (typeof disVal === "number") {
        return Number.isFinite(disVal) && disVal >= 0 ? disVal : 0;
      }
      const s = String(disVal).trim();
      if (s !== "") {
        if (/^\d+$/.test(s)) return Number(s);
        if (/^\d{1,3}(?:\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
        const n = Number(s.replace(/,/g, "."));
        if (Number.isFinite(n) && n >= 0) return n;
      }
    }
    if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
      return decScale(rawVal);
    }
    return 0;
  }

  // Phân rã 1 kỳ thanh toán (bill) theo đúng chuẩn đối soát 10/2026:
  // Gross (tiền sàn trả) - Phí DV 0,98% = Doanh thu hợp lệ; Doanh thu hợp lệ - 5% VAT - 5% PIT = Thực nhận.
  // Suy luận khấu trừ từ chênh lệch (gross - paid) vì API thật chỉ trả 2 số này:
  //   diff ~ 10,98% x Gross  -> kỳ bị trừ thuế:  VAT = PIT = round(5% x Gross), fee = phần còn lại (bằng đúng 0,98%)
  //   diff ~ 0,98% x Gross   -> kỳ dưới ngưỡng/chưa trừ thuế: fee = diff, VAT = PIT = 0 (ví dụ kỳ 01-10-2026)
  function decomposePayout(it, mKey) {
    const p = it.paymentPayout || it;
    const gross = decScale(p.eligibleTotalAmount);
    const paid = decScale(p.totalPaymentAmount);
    const mcn = decScale(it.payoutValidationInfo?.mcnManagementFee || p.mcnManagementFee);
    const feeApi = decScale(p.totalServiceFee);
    const vatApi = decScale(p.vatTotalAmount);
    const pitApi = decScale(p.whtTotalAmount);

    const afterMcn = Math.max(0, gross - mcn);
    const diff = Math.max(0, afterMcn - paid);
    const isOctOnwards = mKey >= "2026-10";

    let fee = 0, vat = 0, pit = 0, wht10 = 0;
    if (vatApi > 0 || pitApi > 0) {
      vat = vatApi;
      pit = pitApi;
      fee = feeApi > 0 ? feeApi : Math.max(0, diff - vat - pit);
    } else if (feeApi > 0) {
      fee = feeApi;
      const rem = Math.max(0, diff - fee);
      if (isOctOnwards) {
        vat = Math.round(rem / 2);
        pit = rem - vat;
      } else {
        wht10 = rem;
      }
    } else if (diff === 0) {
      fee = 0;
    } else if (isOctOnwards) {
      const vatEst = Math.round(gross * 0.05);
      if (diff > 2 * vatEst) {
        vat = vatEst;
        pit = vatEst;
        fee = Math.max(0, diff - 2 * vatEst);
      } else {
        fee = diff;
      }
    } else {
      fee = Math.round(gross * SERVICE_FEE_RATE);
      if (diff <= Math.round(gross * 0.0298)) {
        fee = diff;
      } else {
        wht10 = Math.max(0, diff - fee);
      }
    }

    const billTotal = Math.max(0, afterMcn - fee);
    const hasExplicitPaid = (p.totalPaymentAmount !== undefined && p.totalPaymentAmount !== null && String(p.totalPaymentAmount).trim() !== "");
    const net = hasExplicitPaid ? paid : Math.max(0, billTotal - vat - pit - wht10);
    return { gross, mcn, fee, vat, pit, wht10, billTotal, net };
  }

  // DOM Elements
  const fromDateInput = document.getElementById("input-from-date");
  const toDateInput = document.getElementById("input-to-date");
  const fromDateText = document.getElementById("input-from-date-text");
  const toDateText = document.getElementById("input-to-date-text");
  const fromDateError = document.getElementById("input-from-date-error");
  const toDateError = document.getElementById("input-to-date-error");
  const btnFromCalendar = document.getElementById("btn-from-calendar");
  const btnToCalendar = document.getElementById("btn-to-calendar");

  const taxModeSelect = document.getElementById("select-tax-mode");
  const fetchLiveBtn = document.getElementById("btn-fetch-live");
  const clearCacheBtn = document.getElementById("btn-clear-cache");
  const pasteModalBtn = document.getElementById("btn-paste-modal");
  const exportExcelBtn = document.getElementById("btn-export-excel");
  const exportCsvBtn = document.getElementById("btn-export-csv");
  const statusBar = document.getElementById("status-bar");
  const statusText = document.getElementById("status-text");
  const statusMeta = document.getElementById("status-meta");
  const bannerTitle = document.getElementById("banner-title");
  const monthlyTitle = document.getElementById("monthly-table-title");

  const monthlyTbody = document.getElementById("monthly-tbody");
  const monthlyTfoot = document.getElementById("monthly-tfoot");
  const simpleTbody = document.getElementById("simple-tbody");
  const simpleTfoot = document.getElementById("simple-tfoot");
  const dailyContainer = document.getElementById("daily-tables-container");

  const pasteModal = document.getElementById("paste-modal");
  const pasteTextarea = document.getElementById("paste-textarea");
  const closeModalBtn = document.getElementById("btn-close-modal");
  const parsePasteBtn = document.getElementById("btn-parse-paste");

  const tabButtons = document.querySelectorAll(".view-tab");
  const tabContents = document.querySelectorAll(".tab-content");

  // S1a-HKD Elements
  const s1aInputName = document.getElementById("s1a-input-name");
  const s1aInputAddress = document.getElementById("s1a-input-address");
  const s1aInputTaxCode = document.getElementById("s1a-input-taxcode");
  const s1aInputLocation = document.getElementById("s1a-input-location");
  const s1aSelectGrouping = document.getElementById("s1a-select-grouping");
  const selectPayoutRecon = document.getElementById("select-payout-recon");
  const btnOpenPayoutRecon = document.getElementById("btn-open-payout-recon");
  const dialogPayoutRecon = document.getElementById("dialog-payout-recon");
  const payoutReconTitle = document.getElementById("payout-recon-title");
  const payoutReconBody = document.getElementById("payout-recon-body");
  const btnClosePayoutRecon = document.getElementById("btn-close-payout-recon");
  const btnClosePayoutReconFooter = document.getElementById("btn-close-payout-recon-footer");
  const s1aSaveProfileBtn = document.getElementById("btn-s1a-save-profile");
  const s1aExportExcelBtn = document.getElementById("btn-s1a-export-excel");
  const s1aExportDocxBtn = document.getElementById("btn-s1a-export-docx");
  const s1aPrintBtn = document.getElementById("btn-s1a-print");
  const s1aSheetWrapper = document.getElementById("s1a-sheet-wrapper");
  const s1aSheet = document.getElementById("s1a-sheet");

  const s1aWarningBanner = document.getElementById("s1a-warning-banner");
  const s1aWarningText = document.getElementById("s1a-warning-text");

  const s1aDispName = document.getElementById("s1a-disp-name");
  const s1aDispAddress = document.getElementById("s1a-disp-address");
  const s1aDispTaxCode = document.getElementById("s1a-disp-taxcode");
  const s1aDispLocation = document.getElementById("s1a-disp-location");
  const s1aDispPeriod = document.getElementById("s1a-disp-period");
  const s1aTbody = document.getElementById("s1a-tbody");
  const s1aTfoot = document.getElementById("s1a-tfoot");
  const s1aDispTotal = document.getElementById("s1a-disp-total");
  const s1aDispSigDate = document.getElementById("s1a-disp-sig-date");
  const s1aDispSigName = document.getElementById("s1a-disp-sig-name");

  // Utilities
  function formatVnd(num) {
    if (num === null || num === undefined) return "-";
    if (typeof num !== "number" || isNaN(num)) return "-";
    return new Intl.NumberFormat("vi-VN").format(Math.round(num));
  }

  function formatDateVn(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function getDaysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function isValidDateString(str) {
    if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m - 1) && dt.getUTCDate() === d;
  }

  function parseEpochToGmt7(sec) {
    const s = parseInt(sec || 0, 10);
    const d = new Date(s * 1000 + 7 * 3600000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      date: d.getUTCDate(),
      getFullYear: () => d.getUTCFullYear(),
      getMonth: () => d.getUTCMonth(),
      getDate: () => d.getUTCDate()
    };
  }

  function formatIsoToDmy(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return "";
    const parts = isoStr.trim().split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function parseDmyToIso(str) {
    if (!str || typeof str !== "string") return "";
    const s = str.trim();
    if (!s) return "";
    const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!match) return null;
    const d = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const y = parseInt(match[3], 10);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
    const daysInM = getDaysInMonth(y, m);
    if (d > daysInM) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function formatMonthLabel(mKey) {
    if (!mKey || typeof mKey !== "string") return "";
    const parts = mKey.trim().split("-");
    if (parts.length < 2) return mKey;
    return `${parts[1]}/${parts[0]}`;
  }

  function formatEpochDateTime(sec) {
    if (!sec) return "(không xác định)";
    const s = parseInt(sec || 0, 10);
    if (!s || isNaN(s)) return "(không xác định)";
    const dt = parseEpochToGmt7(s);
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    const dateObj = new Date(s * 1000 + 7 * 3600000);
    const hh = String(dateObj.getUTCHours()).padStart(2, "0");
    const mm = String(dateObj.getUTCMinutes()).padStart(2, "0");
    const ss = String(dateObj.getUTCSeconds()).padStart(2, "0");
    return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
  }

  function formatEpochDateOnly(sec) {
    if (!sec) return "(không xác định)";
    const s = parseInt(sec || 0, 10);
    if (!s || isNaN(s)) return "(không xác định)";
    const dt = parseEpochToGmt7(s);
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  function syncIsoToText(canonicalEl, textEl, errorEl) {
    if (!canonicalEl || !textEl) return;
    const val = canonicalEl.value;
    if (val && isValidDateString(val)) {
      textEl.value = formatIsoToDmy(val);
      textEl.classList.remove("is-invalid");
      if (errorEl) {
        errorEl.classList.remove("active");
        errorEl.textContent = "";
      }
      delete canonicalEl.dataset.hasParseError;
    } else if (!val) {
      if (!canonicalEl.dataset.hasParseError) {
        textEl.value = "";
        textEl.classList.remove("is-invalid");
        if (errorEl) {
          errorEl.classList.remove("active");
          errorEl.textContent = "";
        }
      }
    }
  }

  function setupDateInputPair(canonicalEl, textEl, errorEl, btnEl) {
    if (!canonicalEl) return;

    if (btnEl) {
      btnEl.addEventListener("click", () => {
        if (typeof canonicalEl.showPicker === "function") {
          try {
            canonicalEl.showPicker();
            return;
          } catch (e) {
            // fallback
          }
        }
        canonicalEl.focus();
        canonicalEl.click();
      });
    }

    if (textEl) {
      const handleInput = () => {
        const raw = textEl.value.trim();
        if (!raw) {
          delete canonicalEl.dataset.hasParseError;
          textEl.classList.remove("is-invalid");
          if (errorEl) {
            errorEl.classList.remove("active");
            errorEl.textContent = "";
          }
          if (canonicalEl.value !== "") {
            canonicalEl.value = "";
            handleFilterChange();
          }
          return;
        }

        if (raw.length < 10) {
          canonicalEl.dataset.hasParseError = "true";
          return;
        }

        const iso = parseDmyToIso(raw);
        if (iso) {
          delete canonicalEl.dataset.hasParseError;
          textEl.classList.remove("is-invalid");
          if (errorEl) {
            errorEl.classList.remove("active");
            errorEl.textContent = "";
          }
          canonicalEl.value = iso;
          handleFilterChange();
        } else {
          canonicalEl.dataset.hasParseError = "true";
          canonicalEl.value = "";
          textEl.classList.add("is-invalid");
          if (errorEl) {
            errorEl.classList.add("active");
            errorEl.textContent = "Ngày không hợp lệ (DD/MM/YYYY)";
          }
          handleFilterChange();
        }
      };

      const handleCommit = () => {
        const raw = textEl.value.trim();
        if (!raw) {
          delete canonicalEl.dataset.hasParseError;
          textEl.classList.remove("is-invalid");
          if (errorEl) {
            errorEl.classList.remove("active");
            errorEl.textContent = "";
          }
          if (canonicalEl.value !== "") {
            canonicalEl.value = "";
            handleFilterChange();
          }
          return;
        }
        const iso = parseDmyToIso(raw);
        if (iso) {
          delete canonicalEl.dataset.hasParseError;
          textEl.classList.remove("is-invalid");
          textEl.value = formatIsoToDmy(iso);
          if (errorEl) {
            errorEl.classList.remove("active");
            errorEl.textContent = "";
          }
          canonicalEl.value = iso;
          handleFilterChange();
        } else {
          canonicalEl.dataset.hasParseError = "true";
          canonicalEl.value = "";
          textEl.classList.add("is-invalid");
          if (errorEl) {
            errorEl.classList.add("active");
            errorEl.textContent = "Ngày không hợp lệ (DD/MM/YYYY)";
          }
          handleFilterChange();
        }
      };

      textEl.addEventListener("input", handleInput);
      textEl.addEventListener("change", handleCommit);
      textEl.addEventListener("blur", handleCommit);
    }

    canonicalEl.addEventListener("change", () => {
      syncIsoToText(canonicalEl, textEl, errorEl);
    });
  }

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
      const isS1a = btn.dataset.tab === "tab-s1a";
      if (exportExcelBtn) exportExcelBtn.style.display = isS1a ? "none" : "";
      if (exportCsvBtn) exportCsvBtn.style.display = isS1a ? "none" : "";
    });
  });

  function parsePastedTextOrJson(text) {
    function isValidCalendarDate(d, m, y) {
      if (typeof d !== "number" || typeof m !== "number" || typeof y !== "number") return false;
      if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
      return d <= new Date(y, m, 0).getDate();
    }

    function isFullFiniteNonNegative(val) {
      if (typeof val === "boolean" || typeof val === "object" || val === null || val === undefined) return false;
      if (typeof val === "number") return Number.isFinite(val) && val >= 0;
      if (typeof val === "string") {
        const s = val.trim();
        if (!s || !/^\d+(?:\.\d+)?$/.test(s)) return false;
        const n = Number(s);
        return Number.isFinite(n) && n >= 0;
      }
      return false;
    }

    function isFullFiniteTimestamp(val) {
      if (typeof val === "boolean" || typeof val === "object" || val === null || val === undefined) return false;
      let n;
      if (typeof val === "number") {
        if (!Number.isSafeInteger(val)) return false;
        n = val;
      } else if (typeof val === "string") {
        const s = val.trim();
        if (!s || !/^\d+$/.test(s)) return false;
        n = Number(s);
        if (!Number.isSafeInteger(n)) return false;
      } else {
        return false;
      }
      if (n <= 0) return false;
      // Shopee Affiliate contract is strictly seconds (2000-2100). Reject milliseconds (>= 1e11).
      if (n >= 1e11) return false;
      const y = new Date((n + 7 * 3600) * 1000).getUTCFullYear();
      return y >= 2000 && y <= 2100;
    }

    function parseStrictVnCurrency(rawStr) {
      if (typeof rawStr !== "string") return null;
      const s = rawStr.trim();
      if (!s) return null;
      if (/[-–—\u2212]/.test(s) || /^\(.*\)$/.test(s)) {
        return { error: "negative" };
      }
      const m = s.match(/^(?:[₫đ]\s*|vnd\s*)?([0-9.,]+)(?:\s*[₫đ]|\s*vnd)?$/i);
      if (!m) return null;
      const numPart = m[1];
      if (!/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(numPart) && !/^\d+(?:,\d+)?$/.test(numPart)) {
        return null;
      }
      const val = Number(numPart.replace(/\./g, "").replace(/,/g, "."));
      return Number.isFinite(val) && val >= 0 ? { value: val } : null;
    }

    function isValidDataRecord(r) {
      if (!r || typeof r !== "object" || Array.isArray(r)) return false;

      // 1. Fee Invoice
      const isFee = Boolean(r.isFeeInvoice || (r.totalServiceFee !== undefined && (r.paymentCompletePeriodStartTime || r.monthKey || r.paymentSummaryBillFeeInvoices)));
      if (isFee) {
        if (!isFullFiniteNonNegative(r.totalServiceFee)) return false;
        let hasValidTime = false;
        if (r.monthKey) {
          if (typeof r.monthKey !== "string" || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(r.monthKey)) return false;
          hasValidTime = true;
        }
        if (r.paymentCompletePeriodStartTime) {
          if (!isFullFiniteTimestamp(r.paymentCompletePeriodStartTime)) return false;
          hasValidTime = true;
        }
        if (!hasValidTime) return false;
        if (r.paymentCompletePeriodEndTime && !isFullFiniteTimestamp(r.paymentCompletePeriodEndTime)) return false;
        r.isFeeInvoice = true;
        if (!r.invoiceNumber && r.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber) {
          r.invoiceNumber = r.paymentSummaryBillFeeInvoices[0].invoiceNumber;
        }
        return true;
      }

      // 2. Payout Record
      const p = r.paymentPayout || (r.payoutCreatedTime || r.payArrivalTime || r.payoutId ? r : null);
      if (p && typeof p === "object") {
        const pid = p.payoutId || r.payoutId;
        if (!pid || (typeof pid !== "string" && typeof pid !== "number")) return false;
        if (typeof pid === "string" && !pid.trim()) return false;

        const pTime = p.payoutCreatedTime || r.payoutCreatedTime || p.payArrivalTime || r.payArrivalTime;
        if (!isFullFiniteTimestamp(pTime)) return false;

        if (p.eligibleTotalAmount === undefined || !isFullFiniteNonNegative(p.eligibleTotalAmount)) return false;
        if (p.totalPaymentAmount === undefined || !isFullFiniteNonNegative(p.totalPaymentAmount)) return false;

        for (const k of ["totalServiceFee", "vatTotalAmount", "whtTotalAmount", "mcnManagementFee"]) {
          if (p[k] !== undefined && p[k] !== null && !isFullFiniteNonNegative(p[k])) return false;
        }
        if (r.payoutValidationInfo?.mcnManagementFee !== undefined && r.payoutValidationInfo?.mcnManagementFee !== null) {
          if (!isFullFiniteNonNegative(r.payoutValidationInfo.mcnManagementFee)) return false;
        }
        return true;
      }

      // 3. Billing Record
      if (r.order_completed_period_start_time) {
        if (!isFullFiniteTimestamp(r.order_completed_period_start_time)) return false;
        if (r.order_completed_period_end_time && !isFullFiniteTimestamp(r.order_completed_period_end_time)) return false;
        const hasDis = r.eligible_total_amount_dis !== undefined && r.eligible_total_amount_dis !== null;
        const hasRaw = r.eligible_total_amount !== undefined && r.eligible_total_amount !== null;
        if (!hasDis && !hasRaw) return false;
        if (hasDis && !isFullFiniteNonNegative(r.eligible_total_amount_dis)) return false;
        if (hasRaw && !isFullFiniteNonNegative(r.eligible_total_amount)) return false;

        const optionalMoneyKeys = [
          "total_payment_amount_dis", "total_payment_amount",
          "mcn_management_fee_dis", "mcn_management_fee",
          "wht_amount_dis", "pit_amount_dis", "wht_amount", "pit_amount",
          "vat_amount_dis", "vat_amount",
          "service_fee_dis", "service_fee"
        ];
        for (const k of optionalMoneyKeys) {
          if (r[k] !== undefined && r[k] !== null && !isFullFiniteNonNegative(r[k])) return false;
        }
        if (r.bills !== undefined && r.bills !== null) {
          if (!Array.isArray(r.bills)) return false;
          for (const b of r.bills) {
            if (!b || typeof b !== "object") return false;
            for (const bk of ["service_fee_dis", "service_fee"]) {
              if (b[bk] !== undefined && b[bk] !== null && !isFullFiniteNonNegative(b[bk])) return false;
            }
          }
        }
        return true;
      }

      return false;
    }

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      let candidate = null;
      if (parsed.data?.getPaymentSummaryBillFeeInvoiceList?.paymentSummaryBillFeeInvoices) {
        candidate = parsed.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices.map(x => ({
          isFeeInvoice: true,
          paymentCompletePeriodStartTime: x.paymentCompletePeriodStartTime,
          paymentCompletePeriodEndTime: x.paymentCompletePeriodEndTime,
          totalServiceFee: x.totalServiceFee,
          invoiceNumber: x.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || x.invoiceNumber || ""
        }));
      } else if (parsed.getPaymentSummaryBillFeeInvoiceList?.paymentSummaryBillFeeInvoices) {
        candidate = parsed.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices.map(x => ({
          isFeeInvoice: true,
          paymentCompletePeriodStartTime: x.paymentCompletePeriodStartTime,
          paymentCompletePeriodEndTime: x.paymentCompletePeriodEndTime,
          totalServiceFee: x.totalServiceFee,
          invoiceNumber: x.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || x.invoiceNumber || ""
        }));
      } else if (parsed.data?.getPaymentPayoutBillingList || parsed.getPaymentPayoutBillingList) {
        const node = parsed.data?.getPaymentPayoutBillingList || parsed.getPaymentPayoutBillingList;
        const pList = node.payoutList;
        const pagination = node.pagination;
        const totalCount = pagination?.totalCount !== undefined ? parseInt(String(pagination.totalCount), 10) : null;
        if (Array.isArray(pList) && totalCount !== null && Number.isFinite(totalCount) && totalCount > pList.length) {
          throw new Error(`Dữ liệu Payout dán vào chỉ chứa trang lẻ (${pList.length}/${totalCount} bản ghi). Vui lòng dùng tính năng làm mới đầy đủ (Fetch Live / đồng bộ online) thay vì dán trang lẻ.`);
        }
        candidate = pList;
      } else if (parsed.data?.payoutDetail) {
        candidate = [parsed.data.payoutDetail];
      } else if (parsed.payoutDetail) {
        candidate = [parsed.payoutDetail];
      } else if (parsed.payoutList && Array.isArray(parsed.payoutList)) {
        candidate = parsed.payoutList;
      } else if (parsed.payoutRecord || parsed.billingRecords) {
        candidate = [];
        if (parsed.payoutRecord) candidate.push(parsed.payoutRecord);
        if (Array.isArray(parsed.billingRecords)) candidate.push(...parsed.billingRecords);
      } else if (parsed.data?.list && Array.isArray(parsed.data.list)) {
        candidate = parsed.data.list;
      } else if (parsed.list && Array.isArray(parsed.list)) {
        candidate = parsed.list;
      } else if (Array.isArray(parsed)) {
        candidate = parsed;
      }

      if (candidate) {
        if (!Array.isArray(candidate) || candidate.length === 0) {
          throw new Error("Dữ liệu JSON là mảng rỗng.");
        }
        if (!candidate.every(isValidDataRecord)) {
          throw new Error("Mảng JSON chứa bản ghi không hợp lệ hoặc thiếu trường bắt buộc.");
        }
        return candidate;
      }
    }

    // Parse plain text / tab-separated table copied from Shopee / Excel
    const lines = trimmed.split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith("Ngày") || l.startsWith("TỔNG") || l.startsWith("Tổng") || l.startsWith("Thời gian")) continue;

      if (/(?:^|[\s\t])[-–—\u2212]\s*[\d.,₫đ]/.test(l) || /\(\s*[₫đ]?\s*[\d.,]+\s*[₫đ]?\s*\)/.test(l)) {
        throw new Error(`Số tiền không được là số âm: "${l}"`);
      }

      let mKey = null;
      let dateText = "";
      const thgMatch = l.match(/(?:Thg|Tháng)\s*(\d{1,2})[/\s]+(\d{4})/i);
      const rangeMatch = !thgMatch ? l.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s*-\s*(\d{1,2})[/-](\d{1,2})[/-](\d{4})/) : null;

      if (thgMatch) {
        const mon = parseInt(thgMatch[1], 10);
        const yr = parseInt(thgMatch[2], 10);
        if (mon >= 1 && mon <= 12 && yr >= 2000 && yr <= 2100) {
          mKey = `${yr}-${String(mon).padStart(2, "0")}`;
          dateText = thgMatch[0];
        } else {
          throw new Error(`Tháng không hợp lệ: ${thgMatch[0]}`);
        }
      } else if (rangeMatch) {
        const d1 = parseInt(rangeMatch[1], 10);
        const m1 = parseInt(rangeMatch[2], 10);
        const y1 = parseInt(rangeMatch[3], 10);
        const d2 = parseInt(rangeMatch[4], 10);
        const m2 = parseInt(rangeMatch[5], 10);
        const y2 = parseInt(rangeMatch[6], 10);
        if (isValidCalendarDate(d1, m1, y1) && isValidCalendarDate(d2, m2, y2)) {
          const t1 = y1 * 10000 + m1 * 100 + d1;
          const t2 = y2 * 10000 + m2 * 100 + d2;
          if (t1 <= t2) {
            mKey = `${y1}-${String(m1).padStart(2, "0")}`;
            dateText = rangeMatch[0];
          } else {
            throw new Error(`Khoảng thời gian không hợp lệ (ngày kết thúc trước ngày bắt đầu): ${rangeMatch[0]}`);
          }
        } else {
          throw new Error(`Ngày trong khoảng thời gian không đúng lịch: ${rangeMatch[0]}`);
        }
      }

      if (mKey && dateText) {
        let fee = null;
        let inv = "";

        if (l.includes("\t")) {
          const cols = l.split("\t").map(c => c.trim());
          const pIdx = cols.findIndex(c => c.includes(dateText) || /(?:Thg|Tháng)\s*\d+/i.test(c));
          if (pIdx !== -1 && cols.length > pIdx + 1) {
            const rawCol = cols[pIdx + 1];
            if (!rawCol) {
              throw new Error(`Dòng hóa đơn phí DV thiếu số tiền: "${l}"`);
            }
            const parsed = parseStrictVnCurrency(rawCol);
            if (parsed?.error === "negative") {
              throw new Error(`Số tiền không được là số âm: "${l}"`);
            }
            if (parsed && typeof parsed.value === "number") {
              fee = parsed.value;
            } else {
              throw new Error(`Dòng hóa đơn phí DV thiếu số tiền hợp lệ: "${l}"`);
            }
            if (cols.length > pIdx + 2 && cols[pIdx + 2] !== "") {
              const col2 = cols[pIdx + 2];
              const mInv = col2.match(/\b([A-Za-z0-9_-]{4,24})\b/);
              if (mInv) inv = mInv[1];
              else if (/^\d+$/.test(col2)) inv = col2;
            }
          } else {
            throw new Error(`Dòng hóa đơn phí DV thiếu số tiền hợp lệ: "${l}"`);
          }
        } else {
          const rem = l.replace(dateText, "").trim();
          const currMatch = rem.match(/(?:[₫đ]\s*[\d.,]+|[\d.,]+\s*[₫đ]|vnd\s*[\d.,]+|[\d.,]+\s*vnd)/i);
          if (currMatch) {
            const parsed = parseStrictVnCurrency(currMatch[0]);
            if (parsed?.error === "negative") {
              throw new Error(`Số tiền không được là số âm: "${l}"`);
            }
            if (parsed && typeof parsed.value === "number") {
              fee = parsed.value;
              const remAfterFee = rem.replace(currMatch[0], "");
              const mInv = remAfterFee.match(/\b(\d{4,20})\b/) || remAfterFee.match(/\b([A-Za-z0-9_-]{4,24})\b/);
              if (mInv && !/^(Hợp|lệ|Tải|về|Chờ|Hủy)$/i.test(mInv[1])) {
                inv = mInv[1];
              }
            }
          }
        }

        if (fee !== null && !isNaN(fee) && fee >= 0) {
          items.push({
            isFeeInvoice: true,
            monthKey: mKey,
            totalServiceFee: (Math.round(fee) * 100000).toString(),
            invoiceNumber: inv || ""
          });
          continue;
        } else {
          throw new Error(`Dòng hóa đơn phí DV thiếu số tiền hợp lệ: "${l}"`);
        }
      }

      const dateMatch = l.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (!dateMatch) {
        throw new Error(`Dòng không nhận diện được định dạng: "${l}"`);
      }
      const [dateStr, dStr, mStr, yStr] = dateMatch;
      const d = parseInt(dStr, 10);
      const m = parseInt(mStr, 10);
      const y = parseInt(yStr, 10);
      if (!isValidCalendarDate(d, m, y)) {
        throw new Error(`Ngày không hợp lệ trong lịch: "${dateStr}"`);
      }
      const epoch = Math.floor(new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T12:00:00+07:00`).getTime() / 1000);

      let rem = l.replace(dateStr, "");
      const idMatch = rem.match(/(?:\.\.\.|SPV-PO-|SPV-PJ-|\b)(\d{4,18})\b/);
      const pid = idMatch ? idMatch[1] : `payout_${d}_${m}_${y}`;
      if (idMatch) rem = rem.replace(idMatch[0], "");

      if (/(?:^|[\s\t])[-–—\u2212]\s*[\d.,₫đ]/.test(rem) || /\(\s*[₫đ]?\s*[\d.,]+\s*[₫đ]?\s*\)/.test(rem)) {
        throw new Error(`Số tiền không được là số âm: "${l}"`);
      }

      const nums = [];
      const numRegex = /(?:[₫đ]\s*)?[\d.,]+(?:\s*[₫đ])?/gi;
      let mNum;
      while ((mNum = numRegex.exec(rem)) !== null) {
        const token = mNum[0].trim();
        if (!/[\d]/.test(token)) continue;
        const parsed = parseStrictVnCurrency(token);
        if (parsed?.error === "negative") {
          throw new Error(`Số tiền không được là số âm: "${l}"`);
        }
        if (parsed && typeof parsed.value === "number") {
          nums.push(parsed.value);
        } else {
          throw new Error(`Dòng thanh toán chứa số tiền không hợp lệ: "${token}" trong "${l}"`);
        }
      }

      if (nums.length < 3) {
        throw new Error(`Dòng thanh toán không đủ các cột số tiền: "${l}"`);
      }

      let gross = 0, fee = 0, vat = 0, pit = 0, net = 0;
      if (nums.length >= 6) {
        gross = nums[0];
        fee = nums[1];
        vat = nums[3];
        pit = nums[4];
        net = nums[5];
      } else if (nums.length === 3) {
        gross = nums[0];
        net = nums[2];
        fee = nums[1] < gross * 0.1 ? nums[1] : Math.max(0, Math.round(gross - nums[1]));
      } else {
        gross = nums[0];
        net = nums[nums.length - 1];
        fee = nums[1] < gross * 0.1 ? nums[1] : Math.max(0, Math.round(gross - nums[1]));
      }

      items.push({
        payoutDisplayVersion: 0,
        paymentPayout: {
          payoutId: pid,
          payoutCreatedTime: epoch.toString(),
          eligibleTotalAmount: (gross * 100000).toString(),
          totalPaymentAmount: (net * 100000).toString(),
          totalServiceFee: (fee * 100000).toString(),
          vatTotalAmount: (vat * 100000).toString(),
          whtTotalAmount: (pit * 100000).toString()
        }
      });
    }

    if (items.length > 0 && items.every(isValidDataRecord)) return items;
    throw new Error("Không nhận diện được cấu trúc JSON hoặc bảng kê dán vào.");
  }

  // Modal events
  pasteModalBtn.addEventListener("click", () => pasteModal.classList.add("open"));
  closeModalBtn.addEventListener("click", () => pasteModal.classList.remove("open"));
  parsePasteBtn.addEventListener("click", () => {
    const text = pasteTextarea.value.trim();
    if (!text) return;
    try {
      const parsedItems = parsePastedTextOrJson(text);
      if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
        throw new Error("Không có bản ghi hợp lệ để nạp.");
      }
      const incomingInvoices = parsedItems.filter(x => x.isFeeInvoice);
      const incomingRevenue = parsedItems.filter(x => !x.isFeeInvoice);

      if (incomingInvoices.length === 0) {
        // Dán payout / billing: giữ hành vi thay thế toàn bộ có chủ đích
        rawBillingList = parsedItems;
      } else {
        // Hợp nhất hóa đơn phí dịch vụ vào danh sách hiện tại
        // Chỉ thay thế hóa đơn của các tháng có trong dữ liệu vừa dán, giữ nguyên hóa đơn các tháng khác
        const getFeeMonthKey = (it) => {
          if (it.monthKey) return it.monthKey;
          const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
          if (s) {
            const dt = parseEpochToGmt7(s);
            return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
          }
          return null;
        };
        const updatedInvoiceMonths = new Set(
          incomingInvoices.map(getFeeMonthKey).filter(Boolean)
        );
        const preservedInvoices = rawBillingList.filter(x => x.isFeeInvoice && !updatedInvoiceMonths.has(getFeeMonthKey(x)));
        const baseRevenue = incomingRevenue.length > 0 ? incomingRevenue : rawBillingList.filter(x => !x.isFeeInvoice);
        rawBillingList = [...baseRevenue, ...preservedInvoices, ...incomingInvoices];
      }
      saveCache(rawBillingList);
      pasteModal.classList.remove("open");
      pasteTextarea.value = "";
      initDataAndRender();
      showStatus(`Đã nạp thành công ${parsedItems.length} bản ghi dán thủ công và lưu Cache.`, "success");
    } catch (e) {
      if (typeof alert === "function") alert("Lỗi phân tích cú pháp: " + e.message);
      showStatus("Lỗi phân tích cú pháp: " + e.message, "error");
    }
  });

  function showStatus(text, type = "normal", meta = "") {
    statusText.textContent = text;
    statusMeta.textContent = meta;
    if (type === "success") {
      statusBar.style.backgroundColor = "#e6fffa";
      statusBar.style.color = "#234e52";
    } else if (type === "error") {
      statusBar.style.backgroundColor = "#fff5f5";
      statusBar.style.color = "#9b2c2c";
    } else {
      statusBar.style.backgroundColor = "#edf2f7";
      statusBar.style.color = "#4a5568";
    }
  }

  // Storage Cache
  async function loadCache() {
    return new Promise(resolve => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get([STORAGE_KEY, STORAGE_KEY_V1], res => {
          if (res?.[STORAGE_KEY]) {
            const raw = res[STORAGE_KEY];
            const cleanList = Array.isArray(raw?.list)
              ? raw.list.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
              : [];
            resolve(Object.assign({}, raw, { list: cleanList }));
          } else if (res?.[STORAGE_KEY_V1]) {
            const cleanList = Array.isArray(res[STORAGE_KEY_V1])
              ? res[STORAGE_KEY_V1].filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
              : [];
            resolve({ updatedAt: Date.now(), list: cleanList });
          } else {
            resolve(null);
          }
        });
      } else {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          const parsed = JSON.parse(local);
          const cleanList = Array.isArray(parsed?.list)
            ? parsed.list.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
            : [];
          resolve(Object.assign({}, parsed, { list: cleanList }));
        } else {
          const v1 = localStorage.getItem(STORAGE_KEY_V1);
          if (v1) {
            const parsedV1 = JSON.parse(v1);
            const cleanList = Array.isArray(parsedV1)
              ? parsedV1.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
              : [];
            resolve({ updatedAt: Date.now(), list: cleanList });
          } else {
            resolve(null);
          }
        }
      }
    });
  }

  async function saveCache(list, metadata = {}) {
    const payload = {
      updatedAt: Date.now(),
      list: list,
      warnings: Array.isArray(metadata.warnings) ? metadata.warnings : (metadata.warning ? [metadata.warning] : [])
    };
    if (chrome?.storage?.local) {
      chrome.storage.local.set({ [STORAGE_KEY]: payload });
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  }

  async function clearCacheData() {
    rawBillingList = [];
    if (chrome?.storage?.local) {
      chrome.storage.local.remove([STORAGE_KEY, STORAGE_KEY_V1]);
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_V1);
    initDataAndRender();
    showStatus("Đã xóa bộ nhớ đệm cache. Bấm 'Làm mới từ Shopee' để đồng bộ lại.", "normal");
  }

  // Live Fetch from Shopee Affiliate Tab
  async function fetchLiveFromTab(force = true) {
    if (!force) {
      const cached = await loadCache();
      if (cached && cached.updatedAt && (Date.now() - cached.updatedAt < CACHE_TTL_MS) && Array.isArray(cached.list) && cached.list.length > 0) {
        rawBillingList = cached.list;
        initDataAndRender();
        const updatedDate = new Date(cached.updatedAt);
        const remainingHours = Math.max(0, Math.round((CACHE_TTL_MS - (Date.now() - cached.updatedAt)) / 3600000));
        showStatus(`Dữ liệu nạp từ Cache (${rawBillingList.length} bản ghi). Lưu lúc ${updatedDate.toLocaleTimeString("vi-VN")} - Hết hạn sau ~${remainingHours}h.`, "success");
        return;
      }
    }

    showStatus("Đang tìm tab Shopee Affiliate để gọi API...");
    if (!chrome?.tabs?.query) {
      showStatus("Trình duyệt không hỗ trợ chrome.tabs API hoặc đang chạy offline.", "error");
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ url: "*://affiliate.shopee.vn/*" });
      let tabId = tabs?.[0]?.id;

      if (!tabId) {
        const shopeeTabs = await chrome.tabs.query({ url: "*://shopee.vn/*" });
        if (shopeeTabs?.length > 0) {
          showStatus("Chưa mở tab Affiliate. Vui lòng vào affiliate.shopee.vn/payment/payout_record để lấy dữ liệu.", "error");
          window.open("https://affiliate.shopee.vn/payment/payout_record", "_blank");
          return;
        } else {
          showStatus("Không tìm thấy tab Shopee nào đang mở.", "error");
          return;
        }
      }

      showStatus("Đang tải dữ liệu billing từ Shopee Affiliate (tab #" + tabId + ")...");

      // Execute fetch inside the authenticated tab
      const currentYear = new Date().getFullYear();
      const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
      const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);

      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        // world: "MAIN" - chạy đúng ngữ cảnh trang affiliate như probe đã thành công
        // (fetch nội bộ của portal có thể tự bổ sung header anti-fraud cần thiết)
        world: "MAIN",
        func: async (startTime, endTime) => {
          // Header cơ bản: portal gọi gql thành công với POST KHÔNG cần CSRF-token
          // (chứng minh qua probe nội bộ portal). Chỉ thêm CSRF-token khi gặp 403/401.
          const baseHeaders = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Affiliate-Program-Type": "1"
          };

          // Tìm CSRF token theo đúng cơ chế portal (module config client):
          // 1) localStorage ConfigClient (/api/v3/config/website), 2) GET config website,
          // 3) response header csrf-token từ mọi request /api/v3, 4) cookie csrftoken (phương án cuối).
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

          // Schema chính xác của GraphQL Shopee Affiliate (lấy từ payout_record.abde87f8.js của portal):
          // KHÔNG có totalServiceFee/vatTotalAmount/whtTotalAmount/vatRate/whtRate trên paymentPayout,
          // mỗi kỳ chỉ có 2 số: eligibleTotalAmount (tiền sàn trả - Gross) và totalPaymentAmount (thực nhận).
          // Số tiền trả về dạng micro-unit (x100.000).
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

          // Anti-bot pacing (theo SHOPEE_ANTIBOT_CRITERIA): nghỉ ngẫu nhiên 0.4-1.2s
          // giữa các trang GraphQL - không request burst, giữ nhịp gần hành vi portal thật.
          const sleepJitter = (minMs, maxMs) =>
            new Promise((resolve) => setTimeout(resolve, minMs + Math.floor(Math.random() * (maxMs - minMs + 1))));

          // 1. GraphQL getPaymentPayoutBillingList - lặp đủ trang theo totalCount (portal chia 10 kỳ/trang)
          // Chiến lược: POST không CSRF trước (chuẩn portal), chỉ thêm CSRF-token khi 403/401.
          // Ngưỡng §6b (SHOPEE_ANTIBOT_CRITERIA): HTTP 403 >=2 trong run -> dừng endpoint đó,
          // không retry-spam, chuyển sang dữ liệu Billing List và chờ ít nhất 1 giờ.
          const payouts = [];
          const seenPayoutIds = new Set();
          const gqlIssues = [];
          let csrfToken = null;
          let tokenLookupDone = false;
          let gql403Count = 0;
          let payoutIncomplete = false;
          let payoutSuccess = false;
          let payoutTotalCount = null;
          try {
            const PAGE_LIMIT = 20; // 20 trang x 50 kỳ là dư cho toàn bộ đối soát
            for (let pageNum = 1; pageNum <= PAGE_LIMIT; pageNum++) {
              if (gql403Count >= 2) {
                payoutIncomplete = true;
                break; // circuit breaker anti-bot
              }
              if (pageNum > 1) await sleepJitter(400, 1200);
              const callGql = async (withCsrf) => {
                const headers = Object.assign({}, baseHeaders);
                if (withCsrf && csrfToken) headers["CSRF-token"] = csrfToken;
                const res = await fetch("/api/v3/gql?q=getPayoutList", {
                  method: "POST",
                  headers: headers,
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
                if (gql403Count >= 2) {
                  gqlIssues.push("Dừng GraphQL sau 2 lỗi 403/401 (chống anti-bot) - chỉ dùng Billing List, thử lại sau ít nhất 1 giờ.");
                }
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
                  gqlIssues.push("Đạt giới hạn 20 trang Payout.");
                }
              }
            }

            if (payoutTotalCount !== null && payoutTotalCount > 0 && payouts.length < payoutTotalCount) {
              payoutIncomplete = true;
            }
          } catch (err) {
            gqlIssues.push(err.message);
            payoutIncomplete = true;
          }

          // 2. Billing List theo ngày hoàn thành đơn (kê khai + các tháng không có payout)
          let billingData = null;
          try {
            const url = `/api/v3/payment/billing_list?order_completed_start_time=${startTime}&order_completed_end_time=${endTime}`;
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            billingData = await res.json();
          } catch (err) {
            billingData = { error: err.message };
          }

          // 3. GraphQL getPaymentSummaryBillFeeInvoiceList - Hóa đơn phí dịch vụ điện tử (service_fee_invoice)
          const feeInvoices = [];
          const seenFeeKeys = new Set();
          const feeIssues = [];
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
                feeIssues.push("Dừng tải hóa đơn phí DV sau 2 lỗi 403/401 (circuit breaker).");
                feeIncomplete = true;
                break;
              }
              if (pageNum > 1) await sleepJitter(400, 1200);

              const callFeeGql = async (withCsrf) => {
                const headers = Object.assign({}, baseHeaders);
                if (withCsrf && csrfToken) headers["CSRF-token"] = csrfToken;
                const res = await fetch("/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList", {
                  method: "POST",
                  headers: headers,
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
                const errs = Array.isArray(r.json?.errors)
                  ? r.json.errors.map(e => e.message).join("; ")
                  : (r.json?.msg || r.json?.error_message || `HTTP ${r.status}`);
                feeIssues.push(String(errs));
                feeIncomplete = true;
                break;
              }

              if (Array.isArray(r.json?.errors) && r.json.errors.length > 0) {
                const errs = r.json.errors.map(e => e.message).join("; ");
                feeIssues.push(`GraphQL partial errors: ${errs}`);
                feeIncomplete = true;
              }

              const invList = Array.isArray(node.paymentSummaryBillFeeInvoices) ? node.paymentSummaryBillFeeInvoices : null;
              if (!invList) {
                feeIssues.push("Dữ liệu hóa đơn phí DV không đúng cấu trúc.");
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
                  feeIssues.push(`Dừng tải sớm: nhận ${feeInvoices.length}/${feeTotalCount} bản ghi.`);
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
                  feeIssues.push("Đạt giới hạn 20 trang hóa đơn phí DV.");
                }
              }
            }

            if (feeTotalCount !== null && feeTotalCount > 0 && feeInvoices.length < feeTotalCount) {
              feeIncomplete = true;
              if (!feeIssues.some(s => s.includes("Chưa tải đủ") || s.includes("Dừng tải sớm"))) {
                feeIssues.push(`Chưa tải đủ hóa đơn phí DV (${feeInvoices.length}/${feeTotalCount}).`);
              }
            }
          } catch (err) {
            feeIssues.push(err.message);
            feeIncomplete = true;
          }

          return {
            payouts,
            billingData,
            feeInvoices,
            payoutSuccess,
            payoutIncomplete,
            payoutTotalCount,
            gqlIssues: gqlIssues.join(" | "),
            feeIssues: feeIssues.join(" | "),
            feeIncomplete,
            feeTotalCount
          };
        },
        args: [s, e]
      });

      const response = results?.[0]?.result;
      if (!response) {
        showStatus("Không nhận được phản hồi từ trang Shopee Affiliate.", "error");
        return;
      }

      const hasValidPayoutsArray = Array.isArray(response?.payouts);
      const payouts = hasValidPayoutsArray ? response.payouts : [];
      const isPayoutSuccess = response?.payoutSuccess === true && hasValidPayoutsArray;
      const payoutIncomplete = response?.payoutIncomplete === true || response?.payoutIncomplete === "true";
      const prevPayouts = (rawBillingList || []).filter(x => x && (x.paymentPayout || x.payoutId || x.payoutCreatedTime || x.payArrivalTime) && !x.isFeeInvoice);
      const getPayoutId = (it) => {
        const raw = it?.paymentPayout?.payoutId ?? it?.payoutId;
        return raw !== undefined && raw !== null && String(raw).trim() !== "" ? String(raw).trim() : null;
      };

      let finalPayouts = [];
      let payoutWarning = "";
      let retainedPayoutsCount = 0;

      if (isPayoutSuccess && !payoutIncomplete) {
        finalPayouts = payouts;
      } else if (payouts.length > 0) {
        const newIds = new Set(payouts.map(getPayoutId).filter(Boolean));
        const retained = prevPayouts.filter(x => {
          const id = getPayoutId(x);
          return id ? !newIds.has(id) : true;
        });
        finalPayouts = [...payouts, ...retained];
        retainedPayoutsCount = retained.length;
        payoutWarning = `Chưa tải đủ kỳ thanh toán Payout Record (${payouts.length}${response?.payoutTotalCount ? '/' + response.payoutTotalCount : ''}: ${response?.gqlIssues || "lỗi kết nối"}). Giữ lại ${retained.length} kỳ cũ không trùng.`;
      } else if (prevPayouts.length > 0) {
        finalPayouts = prevPayouts;
        retainedPayoutsCount = prevPayouts.length;
        payoutWarning = `Không thể làm mới kỳ thanh toán Payout Record (${response?.gqlIssues ? `Payout lỗi: ${response.gqlIssues}` : "thiếu dữ liệu Payout"}). Giữ lại ${prevPayouts.length} kỳ cũ.`;
      } else {
        finalPayouts = [];
        if (!isPayoutSuccess || payoutIncomplete) {
          payoutWarning = response?.gqlIssues ? `Payout lỗi: ${response.gqlIssues}` : "Không lấy được kỳ Payout Record";
        }
      }

      const isBillingSuccess = response?.billingData && response.billingData.code === 0 && Array.isArray(response.billingData.data?.list) && response.billingData.data.list.every(x => Boolean(x) && typeof x === "object" && !Array.isArray(x));
      const newBillingList = isBillingSuccess ? response.billingData.data.list : null;
      const billingErr = !isBillingSuccess
        ? (response?.billingData?.error || response?.billingData?.msg || (response?.billingData ? `Mã lỗi Billing: ${response.billingData.code}` : "Lỗi kết nối Billing List"))
        : "";

      const prevBilling = (rawBillingList || []).filter(x => !x.paymentPayout && !x.payoutId && !x.payoutCreatedTime && !x.payArrivalTime && !x.isFeeInvoice && x.order_completed_period_start_time);
      let finalBillingList = [];
      let billingWarning = "";

      if (isBillingSuccess) {
        // Đồng bộ thành công: dùng dữ liệu mới (kể cả mảng rỗng có thẩm quyền)
        finalBillingList = newBillingList;
      } else {
        // Đồng bộ billing thất bại: bảo toàn bản ghi billing hợp lệ trước đó
        finalBillingList = prevBilling;
        billingWarning = `Không thể làm mới doanh thu theo ngày (${billingErr}). Giữ lại ${prevBilling.length} bản ghi cũ.`;
      }

      const newFeeInvoices = Array.isArray(response?.feeInvoices) ? response.feeInvoices : [];
      const feeIncomplete = !!response?.feeIncomplete;
      const feeIssues = response?.feeIssues || "";

      // 0-guard: Only guard against wipeout when NOT authoritative success for both revenue APIs
      const isBothRevenueAuthoritative = isPayoutSuccess && !payoutIncomplete && isBillingSuccess;
      if (finalPayouts.length === 0 && finalBillingList.length === 0 && !isBothRevenueAuthoritative) {
        const detail = response?.gqlIssues || billingErr || response?.billingData?.msg || "Shopee trả về rỗng hoặc chưa đăng nhập.";
        showStatus("Không tải được dữ liệu từ Shopee Affiliate: " + detail, "error");
        return;
      }

      // Bảo toàn hóa đơn phí DV đã biết nếu đồng bộ mới bị lỗi/không khả dụng
      const prevInvoices = (rawBillingList || []).filter(x => x.isFeeInvoice);
      let finalFeeInvoices = [];
      if (newFeeInvoices.length > 0) {
        if (feeIncomplete && prevInvoices.length > 0) {
          const getFeeMonthKey = (it) => {
            if (it.monthKey) return it.monthKey;
            const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
            if (s) {
              const dt = parseEpochToGmt7(s);
              return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
            }
            return null;
          };
          const newMonths = new Set(newFeeInvoices.map(getFeeMonthKey).filter(Boolean));
          const keptPrev = prevInvoices.filter(x => !newMonths.has(getFeeMonthKey(x)));
          finalFeeInvoices = [...newFeeInvoices, ...keptPrev];
        } else {
          finalFeeInvoices = newFeeInvoices;
        }
      } else if (prevInvoices.length > 0) {
        if (response.feeTotalCount === 0 && !feeIncomplete) {
          finalFeeInvoices = [];
        } else {
          finalFeeInvoices = prevInvoices;
        }
      }

      rawBillingList = [...finalPayouts, ...finalBillingList, ...finalFeeInvoices];

      const cacheWarnings = [];
      if (payoutWarning) cacheWarnings.push(payoutWarning);
      if (billingWarning) cacheWarnings.push(billingWarning);
      if (feeIncomplete && feeIssues) cacheWarnings.push(`HĐ phí DV chưa đầy đủ: ${feeIssues}`);
      if (finalPayouts.length === 0 && (!isPayoutSuccess || payoutIncomplete || response.gqlIssues)) {
        if (!cacheWarnings.some(w => w.includes("Payout"))) {
          cacheWarnings.push(response.gqlIssues ? `Payout lỗi: ${response.gqlIssues}` : "Không lấy được kỳ Payout Record");
        }
      }

      await saveCache(rawBillingList, { warnings: cacheWarnings });
      initDataAndRender();
      const now = new Date();
      const meta = `Cập nhật lúc ${now.toLocaleTimeString("vi-VN")}`;

      let payoutNote = "";
      if (isPayoutSuccess && !payoutIncomplete) {
        if (payouts.length > 0) {
          payoutNote = ` + ${payouts.length} kỳ thanh toán (Payout Record)`;
        } else {
          payoutNote = " + 0 kỳ thanh toán";
        }
      } else if (payouts.length > 0) {
        payoutNote = ` + ${payouts.length} kỳ thanh toán mới (chưa đầy đủ)`;
        if (retainedPayoutsCount > 0) payoutNote += `, giữ lại ${retainedPayoutsCount} kỳ cũ`;
      } else if (prevPayouts.length > 0) {
        payoutNote = ` + giữ lại ${prevPayouts.length} kỳ thanh toán cũ (đồng bộ mới không khả dụng: ${response.gqlIssues || "lỗi kết nối"})`;
      }

      let feeNote = "";
      if (newFeeInvoices.length > 0 && !feeIncomplete) {
        feeNote = ` + ${newFeeInvoices.length} HĐ phí DV`;
      } else if (newFeeInvoices.length > 0 && feeIncomplete) {
        feeNote = ` + ${newFeeInvoices.length} HĐ phí DV (chưa đầy đủ: ${feeIssues || "lỗi kết nối"})`;
      } else if (prevInvoices.length > 0 && (feeIssues || feeIncomplete)) {
        feeNote = ` + giữ lại ${prevInvoices.length} HĐ phí DV cũ (đồng bộ mới không khả dụng: ${feeIssues})`;
      } else if (feeIssues) {
        feeNote = ` (HĐ phí DV lỗi: ${feeIssues})`;
      }

      let billingNote = "";
      if (isBillingSuccess) {
        billingNote = ` + ${finalBillingList.length} bản ghi ngày hoàn thành`;
      } else if (prevBilling.length > 0) {
        billingNote = ` + giữ lại ${prevBilling.length} bản ghi ngày hoàn thành cũ`;
      }

      const isAllSuccess = isPayoutSuccess && !payoutIncomplete && isBillingSuccess && !feeIncomplete;
      const statusType = isAllSuccess ? "success" : "normal";
      showStatus(`Đã tải dữ liệu${payoutNote}${billingNote}${feeNote}. Lưu Cache (24h).`, statusType, meta);

      const warnParts = [];
      if (!isPayoutSuccess) {
        warnParts.push("Cảnh báo: không lấy được kỳ thanh toán từ Payout Record"
          + (response?.gqlIssues ? ` (${response.gqlIssues})` : "")
          + (prevPayouts.length > 0 ? `. Giữ lại ${prevPayouts.length} kỳ thanh toán cũ.` : ". Sổ tay đang hiển thị tháng mới nhất theo ngày hoàn thành đơn - hãy đảm bảo tab affiliate.shopee.vn/payment/payout_record đang mở và đăng nhập."));
      } else if (payoutIncomplete) {
        warnParts.push(`Cảnh báo: chưa tải đủ kỳ thanh toán từ Payout Record (${payouts.length}${response?.payoutTotalCount ? '/' + response.payoutTotalCount : ''})`
          + (response?.gqlIssues ? ` (${response.gqlIssues})` : "")
          + (retainedPayoutsCount > 0 ? `. Giữ lại ${retainedPayoutsCount} kỳ cũ không trùng.` : ""));
      }
      if (billingWarning) {
        warnParts.push(`Cảnh báo nguồn: ${billingWarning}`);
      }

      if (warnParts.length > 0) {
        const detailParts = [];
        if (response?.gqlIssues && (!isPayoutSuccess || payoutIncomplete)) detailParts.push(`Payout lỗi: ${response.gqlIssues}`);
        if (billingErr) detailParts.push(`Billing List lỗi: ${billingErr}`);
        showStatus(warnParts.join(" | "), "error", detailParts.join(" | "));
      }
    } catch (err) {
      showStatus("Lỗi kết nối extension: " + err.message, "error");
    }
  }

  fetchLiveBtn.addEventListener("click", () => fetchLiveFromTab(true));
  clearCacheBtn.addEventListener("click", clearCacheData);

  // Data processing
  function processData(filterFromDate, filterToDate) {
    function getInvoiceServiceMonth(inv) {
      if (inv.monthKey && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(inv.monthKey)) {
        return inv.monthKey;
      }
      const sTime = parseInt(inv.paymentCompletePeriodStartTime || 0, 10);
      if (sTime && Number.isFinite(sTime) && sTime > 0 && sTime < 1e11) {
        const dt = parseEpochToGmt7(sTime);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      }
      return null;
    }

    function getDaysInMonth(year, month) {
      return new Date(Date.UTC(year, month, 0)).getUTCDate();
    }

    function isValidDateString(str) {
      if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
      const [y, m, d] = str.split("-").map(Number);
      if (m < 1 || m > 12 || d < 1 || d > 31) return false;
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m - 1) && dt.getUTCDate() === d;
    }

    const fromDate = (filterFromDate && isValidDateString(filterFromDate)) ? filterFromDate : "";
    const toDate = (filterToDate && isValidDateString(filterToDate)) ? filterToDate : "";

    if (fromDate && toDate && fromDate > toDate) {
      return {};
    }

    const monthsMap = {};
    const feeInvoicesMap = {};
    const hasInvoiceFeeMap = {};
    const seenInvoiceKeys = new Set();

    // 1. Rà soát danh sách Hóa đơn phí dịch vụ điện tử (service_fee_invoice)
    // Lưu ý: totalServiceFee có thể bằng 0 (hóa đơn 0 đ là hợp lệ)
    for (const it of rawBillingList) {
      if (it.isFeeInvoice || (it.paymentSummaryBillFeeInvoices && it.totalServiceFee !== undefined) || (it.paymentCompletePeriodStartTime && it.totalServiceFee !== undefined && !it.order_completed_period_start_time)) {
        const mKey = getInvoiceServiceMonth(it);
        if (!mKey) continue;
        const invId = it.invoiceNumber || it.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || "";
        const sTime = it.paymentCompletePeriodStartTime || 0;
        const dedupKey = invId ? `inv_${invId}` : `${sTime}_${it.totalServiceFee ?? 0}_${mKey}`;
        if (seenInvoiceKeys.has(dedupKey)) continue;
        seenInvoiceKeys.add(dedupKey);
        const feeVal = decScale(it.totalServiceFee);
        feeInvoicesMap[mKey] = (feeInvoicesMap[mKey] || 0) + feeVal;
        hasInvoiceFeeMap[mKey] = true;
      }
    }

    // 0. Xác định các tháng có nguồn Payout gốc và nguồn Billing gốc trong raw cache
    const rawPayoutMonths = new Set();
    const rawBillingMonths = new Set();
    for (const it of rawBillingList) {
      if (!it || typeof it !== "object" || it.isFeeInvoice) continue;
      if (it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime) {
        const p = it.paymentPayout || it;
        let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime ?? p.payArrivalTime ?? it.payArrivalTime;
        if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") continue;
        const numTime = Number(String(rawTime).trim());
        if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) continue;
        const dt = parseEpochToGmt7(Math.floor(numTime));
        rawPayoutMonths.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
      } else {
        const s = it.order_completed_period_start_time;
        if (!s) continue;
        const dt = parseEpochToGmt7(s);
        rawBillingMonths.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
      }
    }

    // Khởi tạo trước các tháng có Payout thuộc phạm vi chọn với Payout = 0 (tránh bị flip sang Billing Fallback)
    const fromM = fromDate ? fromDate.slice(0, 7) : "";
    const toM = toDate ? toDate.slice(0, 7) : "";
    for (const mKey of rawPayoutMonths) {
      if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
        if (!monthsMap[mKey]) {
          const [y, mon] = mKey.split("-").map(Number);
          monthsMap[mKey] = createMonthEntry(y, mon);
          monthsMap[mKey].hasPayout = true;
          monthsMap[mKey].gross = 0;
        }
      }
    }

    // Khởi tạo trước các tháng có nguồn Billing gốc thuộc phạm vi chọn với hasBilling = true (tránh báo thiếu nguồn khi filter ngày không có đơn)
    for (const mKey of rawBillingMonths) {
      if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
        if (!monthsMap[mKey]) {
          const [y, mon] = mKey.split("-").map(Number);
          monthsMap[mKey] = createMonthEntry(y, mon);
          if (rawPayoutMonths.has(mKey)) {
            monthsMap[mKey].hasPayout = true;
            monthsMap[mKey].gross = 0;
          }
        }
        monthsMap[mKey].hasBilling = true;
      }
    }

    // Pass 1: Billing List theo ngày hoàn thành đơn
    for (const it of rawBillingList) {
      if (it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime || it.isFeeInvoice) continue;
      const s = it.order_completed_period_start_time;
      if (!s) continue;
      const dt = parseEpochToGmt7(s);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const mKey = `${y}-${m}`;
      const dateKey = `${y}-${m}-${d}`;
      const dayNum = dt.getDate();

      if (fromDate && dateKey < fromDate) continue;
      if (toDate && dateKey > toDate) continue;

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = createMonthEntry(y, dt.getMonth() + 1);
        if (rawPayoutMonths.has(mKey)) {
          monthsMap[mKey].hasPayout = true;
          monthsMap[mKey].gross = 0;
        }
      }
      const mObj = monthsMap[mKey];
      mObj.hasBilling = true;

      const grossAmt = readMoneyAmount(it.eligible_total_amount_dis, it.eligible_total_amount);
      const mcnAmt = readMoneyAmount(it.mcn_management_fee_dis, it.mcn_management_fee);
      const billTotalAmt = readMoneyAmount(it.total_payment_amount_dis, it.total_payment_amount);
      const whtAmt = readMoneyAmount(it.wht_amount_dis ?? it.pit_amount_dis, it.wht_amount ?? it.pit_amount);
      const vatAmt = readMoneyAmount(it.vat_amount_dis, it.vat_amount);
      let feeAmt = readMoneyAmount(it.service_fee_dis, it.service_fee);
      if (Array.isArray(it.bills)) {
        for (const b of it.bills) {
          feeAmt += readMoneyAmount(b.service_fee_dis, b.service_fee);
        }
      }
      if (feeAmt === 0 && billTotalAmt > 0 && (grossAmt - mcnAmt) > billTotalAmt) {
        feeAmt = Math.round((grossAmt - mcnAmt) - billTotalAmt);
      }

      mObj.days[dayNum] = (mObj.days[dayNum] || 0) + grossAmt;
      mObj.billingGross = (mObj.billingGross || 0) + grossAmt;

      // Tháng có nguồn Payout gốc: Payout là nguồn chuẩn duy nhất cho doanh thu gộp và thực nhận
      if (!rawPayoutMonths.has(mKey)) {
        mObj.gross += grossAmt;
        mObj.mcn += mcnAmt;
        mObj.billTotal += billTotalAmt;
        mObj.wht10 += whtAmt;
        mObj.pit += whtAmt;
        mObj.vat += vatAmt;
        mObj.payoutFee += feeAmt;
        mObj.netPaid += billTotalAmt > 0 ? billTotalAmt : 0;
        mObj.totalRecords++;
        if (it.with_wht || whtAmt > 0) mObj.withWhtCount++;
        if (it.with_vat || vatAmt > 0) mObj.withVatCount++;
      }
    }

    // Pass 2: Payout Record theo từng kỳ chi trả thực tế (chuẩn đối soát tài chính cho mọi tháng có Payout)
    const seenPayouts = new Map();
    for (const it of rawBillingList) {
      if (!it || typeof it !== "object") continue;
      if (!(it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime)) continue;
      if (it.isFeeInvoice) continue;
      const p = it.paymentPayout || it;

      // 1. Phân giải & xác thực thời gian
      let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime;
      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") {
        rawTime = p.payArrivalTime ?? it.payArrivalTime;
      }
      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") continue;

      const numTime = Number(String(rawTime).trim());
      if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) continue;

      const s = Math.floor(numTime);
      const dt = parseEpochToGmt7(s);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const mKey = `${y}-${m}`;
      const dateKey = `${y}-${m}-${d}`;

      if (fromDate && dateKey < fromDate) continue;
      if (toDate && dateKey > toDate) continue;

      // 2. Xác thực số tiền hoa hồng gộp
      const rawAmt = p.eligibleTotalAmount;
      if (rawAmt === undefined || rawAmt === null || String(rawAmt).trim() === "") continue;
      const numAmt = Number(String(rawAmt).trim());
      if (!Number.isFinite(numAmt) || numAmt < 0) continue;

      const amt = Math.round(numAmt / 100000);
      const payoutId = String(p.payoutId || it.payoutId || "").trim();

      // 3. Khử trùng lặp & kiểm tra xung đột
      if (payoutId) {
        if (seenPayouts.has(payoutId)) {
          const prev = seenPayouts.get(payoutId);
          if (prev.amt !== amt || prev.s !== s) {
            console.warn(`Xung đột dữ liệu Payout ID ${payoutId}`);
            continue;
          }
          continue;
        }
        seenPayouts.set(payoutId, { amt, s, mKey });
      }

      const dObj = decomposePayout(it, mKey);

      if (!monthsMap[mKey] || !monthsMap[mKey].hasPayout) {
        const prevDays = monthsMap[mKey]?.days || {};
        const prevHasBilling = Boolean(monthsMap[mKey]?.hasBilling);
        const prevBillingGross = monthsMap[mKey]?.billingGross || 0;
        monthsMap[mKey] = createMonthEntry(y, dt.getMonth() + 1);
        monthsMap[mKey].days = prevDays;
        monthsMap[mKey].hasBilling = prevHasBilling;
        monthsMap[mKey].billingGross = prevBillingGross;
        monthsMap[mKey].hasPayout = true;
      }

      const mObj = monthsMap[mKey];
      mObj.gross += dObj.gross;
      mObj.mcn += dObj.mcn;
      mObj.wht10 += dObj.wht10;
      mObj.vat += dObj.vat;
      mObj.pit += dObj.pit;
      mObj.payoutFee += dObj.fee;
      mObj.netPaid += dObj.net;
      mObj.totalRecords++;
      if (dObj.wht10 > 0) mObj.withWhtCount++;
      if (dObj.vat > 0 || dObj.pit > 0) mObj.withVatCount++;
    }

    // Đảm bảo các tháng chỉ có hóa đơn (không có billing/payout) vẫn xuất hiện nếu thuộc phạm vi lọc
    for (const mKey of Object.keys(feeInvoicesMap)) {
      if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
        if (!monthsMap[mKey]) {
          const [y, mon] = mKey.split("-").map(Number);
          monthsMap[mKey] = createMonthEntry(y, mon);
        }
      }
    }

    // Pass 3: Áp dụng Hóa đơn phí dịch vụ điện tử AUTHORITATIVE (service_fee_invoice)
    // Áp dụng cho TẤT CẢ các tháng (kể cả có Payout Record thực tế)
    // Actual zero invoice (fee = 0) là hợp lệ
    // Tháng không có hóa đơn: fee = null ("Chưa có HĐ" / pending, không gán 0 và không suy đoán 0.98%)
    for (const mKey of Object.keys(monthsMap)) {
      const mObj = monthsMap[mKey];
      const [y, mon] = mKey.split("-").map(Number);
      const daysInM = getDaysInMonth(y, mon);
      const mStart = `${mKey}-01`;
      const mEnd = `${mKey}-${String(daysInM).padStart(2, "0")}`;

      const isFullMonth = (!fromDate || fromDate <= mStart) && (!toDate || toDate >= mEnd);
      mObj.isFullMonth = isFullMonth;
      mObj.isPartial = !isFullMonth;

      if (hasInvoiceFeeMap[mKey]) {
        mObj.hasInvoice = true;
        mObj.invoiceFee = feeInvoicesMap[mKey];
        if (isFullMonth) {
          mObj.fee = mObj.invoiceFee;
          mObj.afterFee = Math.max(0, mObj.gross - mObj.mcn - mObj.invoiceFee);
          mObj.billTotal = mObj.afterFee;
        } else {
          // Khoảng ngày lẻ: Không prorate phí hóa đơn tháng
          mObj.fee = null;
          mObj.afterFee = null;
          mObj.billTotal = null;
        }
      } else {
        // Chưa có hóa đơn cho tháng này
        mObj.hasInvoice = false;
        mObj.invoiceFee = null;
        mObj.fee = null;
        mObj.afterFee = null;
        mObj.billTotal = null;
      }
    }

    return monthsMap;
  }

  function createMonthEntry(year, month) {
    return {
      year,
      month,
      days: {},
      gross: 0,
      mcn: 0,
      billTotal: null,
      wht10: 0,
      vat: 0,
      pit: 0,
      fee: null,
      payoutFee: 0,
      invoiceFee: null,
      hasInvoice: false,
      afterFee: null,
      isFullMonth: true,
      isPartial: false,
      netPaid: 0,
      hasPayout: false,
      hasBilling: false,
      billingGross: 0,
      withWhtCount: 0,
      withVatCount: 0,
      totalRecords: 0
    };
  }

  function enumerateCalendarMonths(startM, endM) {
    if (!startM || !endM || startM > endM) return [];
    const res = [];
    const [y1, m1] = startM.split("-").map(Number);
    const [y2, m2] = endM.split("-").map(Number);
    let curY = y1;
    let curM = m1;
    while (curY < y2 || (curY === y2 && curM <= m2)) {
      res.push(`${curY}-${String(curM).padStart(2, "0")}`);
      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
    return res;
  }

  function getFilteredMonthKeys(allMonths) {
    const fromVal = fromDateInput ? fromDateInput.value : "";
    const toVal = toDateInput ? toDateInput.value : "";
    const start = fromVal ? fromVal.slice(0, 7) : (allMonths && allMonths.length > 0 ? allMonths[0] : "");
    const end = toVal ? toVal.slice(0, 7) : (allMonths && allMonths.length > 0 ? allMonths[allMonths.length - 1] : "");
    if (!start || !end || start > end) return [];
    return enumerateCalendarMonths(start, end);
  }

  function renderMonthlyTable(monthsMap, activeMonths) {
    const taxMode = taxModeSelect.value;
    let totalGross = 0;
    let totalMcn = 0;
    let totalAfterMcn = 0;
    let totalFee = 0;
    let totalBill = 0;
    let totalWht10 = 0;
    let totalVat5 = 0;
    let totalTncnKd5 = 0;
    let totalNetTk = 0;

    let tbodyHtml = "";
    let simpleHtml = "";

    if (activeMonths.length === 0) {
      monthlyTbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--muted); padding: 30px;">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>`;
      monthlyTfoot.innerHTML = "";
      if (simpleTbody) simpleTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--muted); padding: 30px;">Không có dữ liệu trong khoảng thời gian đã chọn.</td></tr>`;
      if (simpleTfoot) simpleTfoot.innerHTML = "";
      return;
    }

    for (const mKey of activeMonths) {
      const data = monthsMap[mKey];
      const gross = data ? data.gross : 0;
      const mcn = data ? data.mcn : 0;
      const afterMcn = gross - mcn;

      const isOctober2026Onwards = mKey >= "2026-10";

      let wht10 = 0;
      let vat5 = 0;
      let tncnKd5 = 0;

      if (data && data.hasPayout) {
        // Nguồn dữ liệu từ Payout Record: Lấy chuẩn xác theo từng kỳ chi trả thực tế
        wht10 = data.wht10;
        vat5 = data.vat;
        tncnKd5 = data.pit;
      } else if (isOctober2026Onwards) {
        wht10 = 0;
        vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
        tncnKd5 = (data && data.pit > 0) ? data.pit : Math.round(afterMcn * 0.05);
      } else {
        if (taxMode === "hkd") {
          vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
          tncnKd5 = (data && data.pit > 0) ? data.pit : Math.round(afterMcn * 0.05);
          wht10 = 0;
        } else if (taxMode === "individual") {
          wht10 = (data && data.wht10 > 0) ? data.wht10 : 0;
          vat5 = 0;
          tncnKd5 = 0;
        } else {
          wht10 = (data && data.wht10 > 0) ? data.wht10 : 0;
          vat5 = (data && data.vat > 0) ? data.vat : 0;
          tncnKd5 = 0;
        }
      }

      // 1. Phí DV (HĐ): Authoritative invoice fee
      let feeDvHtml = "-";
      if (data && data.isPartial) {
        if (data.hasInvoice && data.invoiceFee !== null && data.invoiceFee !== undefined) {
          feeDvHtml = `<span title="Hóa đơn phí dịch vụ tính theo chu kỳ ngày 02 đến ngày 01 tháng sau: ${formatVnd(data.invoiceFee)} cả kỳ; không áp dụng chia lẻ theo ngày">- (${formatVnd(data.invoiceFee)})</span>`;
        } else {
          feeDvHtml = '<span title="Hóa đơn phí dịch vụ tính theo chu kỳ cả tháng; không áp dụng cho khoảng ngày lẻ">-</span>';
        }
      } else if (data && data.hasInvoice) {
        feeDvHtml = formatVnd(data.invoiceFee);
        totalFee += data.invoiceFee;
      } else {
        feeDvHtml = '<span class="badge-pending" title="Chưa có hóa đơn phí dịch vụ điện tử từ Shopee cho tháng này">Chưa có HĐ</span>';
      }

      // 2. Sau phí HĐ: Gross - MCN - Phí HĐ (chỉ khi có HĐ hợp lệ cả tháng)
      let billRealHtml = "-";
      if (data && !data.isPartial && data.hasInvoice && data.afterFee !== null && data.afterFee !== undefined) {
        billRealHtml = formatVnd(data.afterFee);
        totalBill += data.afterFee;
      }

      // 3. Thực nhận (Payout): observed NET từ Payout độc lập
      const netTk = data ? (data.netPaid || 0) : 0;
      const netTkHtml = formatVnd(netTk);

      totalGross += gross;
      totalMcn += mcn;
      totalAfterMcn += afterMcn;
      totalWht10 += wht10;
      totalVat5 += vat5;
      totalTncnKd5 += tncnKd5;
      totalNetTk += netTk;

      const hasPayout = Boolean(data && data.hasPayout);
      const hasBilling = Boolean(data && data.hasBilling);
      const sourceBadge = hasPayout
        ? '<span class="badge-source badge-payout" style="display:inline-block; margin-left:4px; padding:1px 5px; background:#e8f4fd; color:#0984e3; border-radius:3px; font-size:11px; font-weight:600;">Payout</span>'
        : (hasBilling ? '<span class="badge-source badge-billing" style="display:inline-block; margin-left:4px; padding:1px 5px; background:#fff3cd; color:#d35400; border-radius:3px; font-size:11px; font-weight:600;">Billing (Fallback)</span>' : '');

      const mLabel = formatMonthLabel(mKey);
      tbodyHtml += `
        <tr>
          <td data-month="${mKey}">${mLabel} ${sourceBadge}</td>
          <td>${formatVnd(gross)}</td>
          <td>${formatVnd(mcn)}</td>
          <td>${formatVnd(afterMcn)}</td>
          <td>${feeDvHtml}</td>
          <td>${billRealHtml}</td>
          <td>${formatVnd(wht10)}</td>
          <td>${formatVnd(vat5)}</td>
          <td>${formatVnd(tncnKd5)}</td>
          <td style="font-weight:700; color:#2d3436;">${netTkHtml}</td>
        </tr>
      `;

      simpleHtml += `
        <tr>
          <td data-month="${mKey}">${mLabel}</td>
          <td style="text-align: left;">Doanh thu từ Shopee ${hasPayout ? '(Kỳ chi trả Payout)' : (hasBilling ? '(Hoàn thành đơn - Fallback Billing)' : '')}</td>
          <td>${formatVnd(gross)}</td>
          <td style="font-weight:700; color:#107c41;">${netTkHtml}</td>
        </tr>
      `;
    }

    const allFullInvoices = activeMonths.length > 0 && activeMonths.every(m => monthsMap[m] && !monthsMap[m].isPartial && monthsMap[m].hasInvoice);
    const totalFeeHtml = allFullInvoices ? formatVnd(totalFee) : '<span title="Chưa đủ hóa đơn phí DV hoặc có kỳ lẻ trong khoảng chọn">Chưa đủ HĐ</span>';
    const totalBillHtml = allFullInvoices ? formatVnd(totalBill) : '-';

    monthlyTbody.innerHTML = tbodyHtml;

    monthlyTfoot.innerHTML = `
      <tr>
        <td>Cộng</td>
        <td>${formatVnd(totalGross)}</td>
        <td>${formatVnd(totalMcn)}</td>
        <td>${formatVnd(totalAfterMcn)}</td>
        <td>${totalFeeHtml}</td>
        <td>${totalBillHtml}</td>
        <td>${formatVnd(totalWht10)}</td>
        <td>${formatVnd(totalVat5)}</td>
        <td>${formatVnd(totalTncnKd5)}</td>
        <td style="font-weight:800; color:#ee4d2d;">${formatVnd(totalNetTk)}</td>
      </tr>
    `;

    if (simpleTbody) {
      simpleTbody.innerHTML = simpleHtml;
    }
    if (simpleTfoot) {
      simpleTfoot.innerHTML = `
        <tr>
          <td>Cộng</td>
          <td style="text-align: left;">-</td>
          <td>${formatVnd(totalGross)}</td>
          <td style="font-weight:800; color:#107c41;">${formatVnd(totalNetTk)}</td>
        </tr>
      `;
    }

    // Dynamic titles
    if (activeMonths.length > 0) {
      const fromV = fromDateInput ? fromDateInput.value : "";
      const toV = toDateInput ? toDateInput.value : "";
      const startY = activeMonths[0].split("-")[0];
      const endY = activeMonths[activeMonths.length - 1].split("-")[0];
      const yearLabel = startY === endY ? startY : `${startY} - ${endY}`;
      bannerTitle.textContent = `Sổ tay thuế ${yearLabel}`;
      if (fromV && toV) {
        monthlyTitle.textContent = `Theo ngày hoàn thành / đối soát từ ${formatDateVn(fromV)} đến ${formatDateVn(toV)} (GMT+7)`;
      } else {
        monthlyTitle.textContent = `Theo tháng ${formatMonthLabel(activeMonths[0])} đến ${formatMonthLabel(activeMonths[activeMonths.length - 1])} (GMT+7)`;
      }
    }
  }

  function renderDailyTables(monthsMap, activeMonths) {
    if (!activeMonths || activeMonths.length === 0) {
      dailyContainer.innerHTML = `<p style="padding: 20px; color: var(--muted); text-align: center;">Chưa có dữ liệu theo ngày.</p>`;
      return;
    }

    let allBillingComplete = true;
    let allPayoutComplete = true;
    let totalBillingInActive = 0;
    let totalPayoutInActive = 0;
    const missingBillingMonths = [];
    const missingPayoutMonths = [];

    for (const mKey of activeMonths) {
      const mData = monthsMap[mKey];
      if (mData && mData.hasBilling) {
        totalBillingInActive += (mData.billingGross || 0);
      } else {
        allBillingComplete = false;
        missingBillingMonths.push(mKey);
      }

      if (mData && mData.hasPayout) {
        totalPayoutInActive += (mData.gross || 0);
      } else {
        allPayoutComplete = false;
        missingPayoutMonths.push(mKey);
      }
    }

    const billingLabel = allBillingComplete
      ? `${formatVnd(totalBillingInActive)} đ`
      : `Chưa đầy đủ (thiếu ${missingBillingMonths.map(m => m.slice(5) + '/' + m.slice(0, 4)).join(', ')})`;

    const payoutLabel = allPayoutComplete
      ? `${formatVnd(totalPayoutInActive)} đ`
      : `Chưa đầy đủ (thiếu ${missingPayoutMonths.map(m => m.slice(5) + '/' + m.slice(0, 4)).join(', ')})`;

    let reconHtml = "";
    if (allBillingComplete && allPayoutComplete) {
      const diff = totalPayoutInActive - totalBillingInActive;
      const sign = diff > 0 ? `+${formatVnd(diff)} đ` : (diff < 0 ? `-${formatVnd(Math.abs(diff))} đ` : "0 đ");
      reconHtml = `<span>Chênh lệch (Kỳ chi trả - Hoàn thành đơn): <strong style="color: ${diff !== 0 ? '#d63031' : 'var(--text)'};">${sign}</strong></span>`;
    } else {
      reconHtml = `<span>Chênh lệch đối soát: <strong style="color: var(--muted);">Chưa đủ dữ liệu cả hai nguồn</strong></span>`;
    }

    let html = `
      <div class="daily-reconciliation-box" style="margin-bottom: 16px; padding: 12px 16px; background: #ffffff; border: 1px solid var(--border); border-left: 4px solid var(--primary); border-radius: 6px; font-size: 13px; line-height: 1.5;">
        <div style="font-weight: 700; color: var(--text); margin-bottom: 6px;">
          📅 Bảng kê chi tiết theo ngày hoàn thành đơn (Billing) &amp; Đối soát kỳ chi trả (Payout)
        </div>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; color: var(--muted); align-items: center;">
          <span>Nguồn bảng kê ngày: <strong style="color: var(--text);">Ngày hoàn thành đơn (Billing)</strong></span>
          <span>Tổng Billing hoàn thành: <strong style="color: var(--text);">${billingLabel}</strong></span>
          <span>Tổng Payout gộp: <strong style="color: var(--text);">${payoutLabel}</strong></span>
          ${reconHtml}
        </div>
      </div>
    `;
    for (const mKey of activeMonths) {
      const [yStr, mStr] = mKey.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const monStr = String(m).padStart(2, "0");
      const mData = monthsMap[mKey];

      if (!mData || !mData.hasBilling) {
        html += `
          <div class="month-daily-container">
            <table class="daily-table">
              <thead>
                <tr>
                  <th style="width: 120px;">Ngày tháng</th>
                  <th>Diễn giải</th>
                  <th style="width: 130px;">Số tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr class="month-header">
                  <td colspan="3">Tháng ${monStr}/${y} - Doanh thu theo ngày hoàn thành đơn</td>
                </tr>
                <tr>
                  <td colspan="3" style="text-align: center; color: var(--muted); padding: 24px;">
                    Chưa có dữ liệu doanh thu theo ngày hoàn thành đơn cho tháng này (chỉ có dữ liệu đối soát Payout theo kỳ chi trả).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
        continue;
      }

      const daysCount = getDaysInMonth(y, m);
      const dailyMap = mData.days || {};
      let rowsHtml = "";
      let monthTotal = 0;
      const fromVal = fromDateInput ? fromDateInput.value : "";
      const toVal = toDateInput ? toDateInput.value : "";

      for (let d = 1; d <= daysCount; d++) {
        const dStr = String(d).padStart(2, "0");
        const dayKey = `${y}-${monStr}-${dStr}`;
        if (fromVal && dayKey < fromVal) continue;
        if (toVal && dayKey > toVal) continue;

        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        const dateFormatted = `${dStr}/${monStr}/${y}`;
        rowsHtml += `
          <tr>
            <td class="col-date">${dateFormatted}</td>
            <td class="col-desc">Doanh thu từ Shopee</td>
            <td class="col-amt">${formatVnd(amt)}</td>
          </tr>
        `;
      }

      html += `
        <div class="month-daily-container">
          <table class="daily-table">
            <thead>
              <tr>
                <th style="width: 120px;">Ngày tháng</th>
                <th>Diễn giải</th>
                <th style="width: 130px;">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr class="month-header">
                <td colspan="3">Tháng ${monStr}/${y} - Doanh thu theo ngày hoàn thành đơn</td>
              </tr>
              ${rowsHtml}
              <tr class="total-row">
                <td class="col-date"></td>
                <td class="col-desc"><strong>Tổng Doanh Thu</strong></td>
                <td class="col-amt"><strong>${formatVnd(monthTotal)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    }

    dailyContainer.innerHTML = html;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function loadS1aProfile() {
    const defaults = {
      taxpayerName: "",
      taxpayerAddress: "",
      taxpayerTaxCode: "",
      businessLocation: "Kinh doanh trên nền tảng số (Shopee Affiliate)",
      sourceType: "payout",
      grouping: "monthly"
    };
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        const res = await new Promise(resolve => {
          chrome.storage.local.get([S1A_STORAGE_KEY], resolve);
        });
        if (res && res[S1A_STORAGE_KEY]) {
          return Object.assign({}, defaults, res[S1A_STORAGE_KEY]);
        }
      } else if (typeof localStorage !== "undefined") {
        const saved = localStorage.getItem(S1A_STORAGE_KEY);
        if (saved) return Object.assign({}, defaults, JSON.parse(saved));
      }
    } catch (e) {
      // ignore
    }
    return defaults;
  }

  async function saveS1aProfile(profile) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        await new Promise(resolve => {
          chrome.storage.local.set({ [S1A_STORAGE_KEY]: profile }, resolve);
        });
      }
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(S1A_STORAGE_KEY, JSON.stringify(profile));
      }
    } catch (e) {
      // ignore
    }
  }

  function getS1aProfileFromInputs() {
    return {
      taxpayerName: s1aInputName ? s1aInputName.value.trim() : "",
      taxpayerAddress: s1aInputAddress ? s1aInputAddress.value.trim() : "",
      taxpayerTaxCode: s1aInputTaxCode ? s1aInputTaxCode.value.trim() : "",
      businessLocation: s1aInputLocation ? (s1aInputLocation.value.trim() || "Kinh doanh trên nền tảng số (Shopee Affiliate)") : "Kinh doanh trên nền tảng số (Shopee Affiliate)",
      grouping: s1aSelectGrouping ? s1aSelectGrouping.value : "monthly"
    };
  }

  function updateS1aProfileDisplay() {
    const prof = getS1aProfileFromInputs();
    if (s1aDispName) s1aDispName.textContent = prof.taxpayerName || "....................................................";
    if (s1aDispAddress) s1aDispAddress.textContent = prof.taxpayerAddress || "....................................................";
    if (s1aDispTaxCode) s1aDispTaxCode.textContent = prof.taxpayerTaxCode || "....................................................";
    if (s1aDispLocation) s1aDispLocation.textContent = prof.businessLocation;
    if (s1aDispSigName) s1aDispSigName.textContent = prof.taxpayerName || "";
  }

  async function initS1aProfile() {
    const profile = await loadS1aProfile();
    if (s1aInputName) s1aInputName.value = profile.taxpayerName || "";
    if (s1aInputAddress) s1aInputAddress.value = profile.taxpayerAddress || "";
    if (s1aInputTaxCode) s1aInputTaxCode.value = profile.taxpayerTaxCode || "";
    if (s1aInputLocation) s1aInputLocation.value = profile.businessLocation || "Kinh doanh trên nền tảng số (Shopee Affiliate)";
    if (s1aSelectGrouping && profile.grouping) s1aSelectGrouping.value = profile.grouping;
    updateS1aProfileDisplay();
  }

  function formatS1aPeriodText(activeMonths) {
    const fromVal = fromDateInput ? fromDateInput.value : "";
    const toVal = toDateInput ? toDateInput.value : "";
    if (fromVal && toVal && isValidDateString(fromVal) && isValidDateString(toVal)) {
      return `Từ ngày ${formatDateVn(fromVal)} đến ngày ${formatDateVn(toVal)}`;
    }
    if (!activeMonths || activeMonths.length === 0) return "Chưa chọn kỳ kê khai";
    const firstM = activeMonths[0];
    const lastM = activeMonths[activeMonths.length - 1];
    const [y1, m1] = firstM.split("-");
    const [y2, m2] = lastM.split("-");
    const lastDay = getDaysInMonth(parseInt(y2, 10), parseInt(m2, 10));
    const fromStr = `01/${m1.padStart(2, "0")}/${y1}`;
    const toStr = `${String(lastDay).padStart(2, "0")}/${m2.padStart(2, "0")}/${y2}`;
    return `Từ ngày ${fromStr} đến ngày ${toStr}`;
  }

  function extractS1aData(rawList, activeMonths, opt1, opt2) {
    const grouping = (typeof opt1 === "string" && (opt1 === "monthly" || opt1 === "daily" || opt1 === "payout")) ? opt1 : (opt2 || "monthly");

    if (!activeMonths || activeMonths.length === 0) {
      return {
        error: "Không có tháng nào được chọn trong phạm vi báo cáo.",
        rows: [],
        grandTotal: 0,
        missingMonths: []
      };
    }

    const monthRecords = {};
    for (const m of activeMonths) {
      monthRecords[m] = [];
    }

    const fromVal = fromDateInput ? fromDateInput.value : "";
    const toVal = toDateInput ? toDateInput.value : "";
    const seenPayouts = new Map();

    for (const it of (rawList || [])) {
      if (!it || typeof it !== "object") continue;
      if (!(it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime)) continue;
      if (it.isFeeInvoice) continue;
      const p = it.paymentPayout || it;

      // 1. Time resolution & validation
      let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime;
      let timeField = "payoutCreatedTime";
      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") {
        rawTime = p.payArrivalTime ?? it.payArrivalTime;
        timeField = "payArrivalTime";
      }

      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") {
        return {
          error: "Không thể lập sổ S1a-HKD: Bản ghi Payout bị thiếu thời gian chi trả (cả payoutCreatedTime và payArrivalTime đều trống).",
          rows: [],
          grandTotal: 0,
          missingMonths: []
        };
      }

      const numTime = Number(String(rawTime).trim());
      if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) {
        return {
          error: `Không thể lập sổ S1a-HKD: Bản ghi Payout có thời gian không hợp lệ (${rawTime}).`,
          rows: [],
          grandTotal: 0,
          missingMonths: []
        };
      }

      const s = Math.floor(numTime);
      const dt = parseEpochToGmt7(s);
      const yStr = dt.getFullYear();
      const mStr = String(dt.getMonth() + 1).padStart(2, "0");
      const dStr = String(dt.getDate()).padStart(2, "0");
      const mKey = `${yStr}-${mStr}`;
      const dateKey = `${yStr}-${mStr}-${dStr}`;

      // If outside selected active months, skip
      if (!activeMonths.includes(mKey)) continue;
      if (fromVal && dateKey < fromVal) continue;
      if (toVal && dateKey > toVal) continue;

      // 2. Amount validation: real zero is valid, missing or malformed blocks
      const rawAmt = p.eligibleTotalAmount;
      if (rawAmt === undefined || rawAmt === null || String(rawAmt).trim() === "") {
        return {
          error: `Không thể lập sổ S1a-HKD: Kỳ chi trả Payout ${p.payoutId || ""} bị thiếu trường hoa hồng gộp (eligibleTotalAmount).`,
          rows: [],
          grandTotal: 0,
          missingMonths: []
        };
      }

      const numAmt = Number(String(rawAmt).trim());
      if (!Number.isFinite(numAmt) || numAmt < 0) {
        return {
          error: `Không thể lập sổ S1a-HKD: Kỳ chi trả Payout ${p.payoutId || ""} có số tiền không hợp lệ (${rawAmt}).`,
          rows: [],
          grandTotal: 0,
          missingMonths: []
        };
      }

      // Micro-unit contract: eligibleTotalAmount is in micro-units (x100000)
      const amt = Math.round(numAmt / 100000);
      const payoutId = String(p.payoutId || it.payoutId || "").trim();

      // 3. Deduplication and conflict check
      if (payoutId) {
        if (seenPayouts.has(payoutId)) {
          const prev = seenPayouts.get(payoutId);
          if (prev.amt !== amt || prev.s !== s) {
            return {
              error: `Không thể lập sổ S1a-HKD: Xung đột dữ liệu Payout ID ${payoutId} (xuất hiện nhiều lần với số tiền hoặc thời gian khác nhau).`,
              rows: [],
              grandTotal: 0,
              missingMonths: []
            };
          }
          continue;
        }
        seenPayouts.set(payoutId, { amt, s, mKey });
      }

      monthRecords[mKey].push({
        epoch: s,
        dt,
        dateKey,
        payoutId,
        amount: amt,
        timeField
      });
    }

    // Check missing months in selected range: distinguish truly missing RAW source vs no selected transaction
    const rawPayoutMonths = new Set();
    for (const it of (rawList || [])) {
      if (!it || typeof it !== "object" || it.isFeeInvoice) continue;
      if (!(it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime)) continue;
      const p = it.paymentPayout || it;
      let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime ?? p.payArrivalTime ?? it.payArrivalTime;
      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") continue;
      const numTime = Number(String(rawTime).trim());
      if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) continue;
      const dt = parseEpochToGmt7(Math.floor(numTime));
      rawPayoutMonths.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
    }

    const missingMonths = [];
    for (const m of activeMonths) {
      if (!rawPayoutMonths.has(m)) {
        missingMonths.push(m);
      }
    }

    if (missingMonths.length > 0) {
      const formatted = missingMonths.map(k => {
        const [y, m] = k.split("-");
        return `${m}/${y}`;
      }).join(", ");
      return {
        error: `Không thể lập sổ S1a-HKD: Tháng ${formatted} không có dữ liệu từ nguồn kỳ chi trả Payout (payoutCreatedTime). Vui lòng thu hẹp khoảng ngày đã chọn.`,
        rows: [],
        grandTotal: 0,
        missingMonths
      };
    }

    const rows = [];
    let grandTotal = 0;

    if (grouping === "daily" || grouping === "payout") {
      const allRecs = [];
      for (const mKey of activeMonths) {
        for (const r of monthRecords[mKey]) {
          allRecs.push(r);
        }
      }
      allRecs.sort((a, b) => a.epoch - b.epoch);

      for (const r of allRecs) {
        const dStr = String(r.dt.getDate()).padStart(2, "0");
        const mStr = String(r.dt.getMonth() + 1).padStart(2, "0");
        const yStr = r.dt.getFullYear();
        const dateFormatted = `${dStr}/${mStr}/${yStr}`;

        const timeLabel = r.timeField === "payArrivalTime" ? "ngày tiền về payArrivalTime" : "ngày tạo kỳ chi trả";
        const desc = r.payoutId
          ? `Doanh thu Shopee Affiliate (Kỳ ${r.payoutId} - ${timeLabel})`
          : `Doanh thu Shopee Affiliate (${timeLabel})`;

        rows.push({
          date: dateFormatted,
          desc: desc,
          amount: r.amount,
          payoutId: r.payoutId
        });
        grandTotal += r.amount;
      }
    } else {
      // grouping === "monthly" (default)
      for (const mKey of activeMonths) {
        const recs = monthRecords[mKey];
        if (!recs || recs.length === 0) {
          // Tháng có nguồn Payout gốc nhưng không có giao dịch trong khoảng ngày chọn -> bỏ qua dòng tháng này
          continue;
        }
        const [yStr, mStr] = mKey.split("-");
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const lastDay = getDaysInMonth(y, m);
        let dateFormatted = `${String(lastDay).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
        if (toVal && toVal.startsWith(mKey)) {
          dateFormatted = formatDateVn(toVal);
        }
        const monthSum = recs.reduce((acc, r) => acc + r.amount, 0);
        const count = recs.length;
        const desc = `Tổng doanh thu tháng ${String(m).padStart(2, "0")}/${y} (gộp ${count} dòng sổ)`;

        rows.push({
          date: dateFormatted,
          desc: desc,
          amount: monthSum
        });
        grandTotal += monthSum;
      }
    }

    if (rows.length === 0) {
      return {
        error: "Không thể lập sổ S1a-HKD: Không có giao dịch chi trả Payout nào trong khoảng ngày đã chọn.",
        rows: [],
        grandTotal: 0,
        missingMonths: []
      };
    }

    return {
      error: null,
      rows,
      grandTotal,
      missingMonths: []
    };
  }

  function updatePayoutReconSelector(activeMonths) {
    if (!selectPayoutRecon) return;
    const fromVal = fromDateInput ? fromDateInput.value : "";
    const toVal = toDateInput ? toDateInput.value : "";

    const payouts = [];
    const seen = new Set();

    for (const it of (rawBillingList || [])) {
      if (!it || typeof it !== "object" || it.isFeeInvoice) continue;
      if (!(it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime)) continue;
      const p = it.paymentPayout || it;
      let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime ?? p.payArrivalTime ?? it.payArrivalTime;
      if (!rawTime) continue;
      const numTime = Number(String(rawTime).trim());
      if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) continue;
      const dt = parseEpochToGmt7(Math.floor(numTime));
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const dStr = String(dt.getDate()).padStart(2, "0");
      const dateKey = `${mKey}-${dStr}`;

      if (activeMonths && activeMonths.length > 0 && !activeMonths.includes(mKey)) continue;
      if (fromVal && dateKey < fromVal) continue;
      if (toVal && dateKey > toVal) continue;

      const pid = String(p.payoutId || it.payoutId || "").trim();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);

      const gross = decScale(p.eligibleTotalAmount);
      payouts.push({
        payoutId: pid,
        epoch: Math.floor(numTime),
        dateFormatted: `${dStr}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`,
        gross
      });
    }

    payouts.sort((a, b) => a.epoch - b.epoch);

    const prevVal = selectPayoutRecon.value;
    selectPayoutRecon.innerHTML = '<option value="">-- Chọn kỳ Payout đối chiếu --</option>';
    for (const p of payouts) {
      const opt = document.createElement("option");
      opt.value = p.payoutId;
      opt.textContent = `Kỳ ${p.payoutId} (${p.dateFormatted} - ${formatVnd(p.gross)} đ)`;
      selectPayoutRecon.appendChild(opt);
    }

    if (prevVal && seen.has(prevVal)) {
      selectPayoutRecon.value = prevVal;
    }
    if (btnOpenPayoutRecon) {
      btnOpenPayoutRecon.disabled = !selectPayoutRecon.value;
    }
  }

  function openPayoutReconDialog(payoutId, triggerElement) {
    if (!payoutId) return;
    if (!dialogPayoutRecon || !payoutReconBody) return;

    // 1. Tìm bản ghi Payout trong rawBillingList
    let payoutRecord = null;
    for (const it of (rawBillingList || [])) {
      if (!it || typeof it !== "object" || it.isFeeInvoice) continue;
      const pid = String(it.paymentPayout?.payoutId || it.payoutId || "").trim();
      if (pid === String(payoutId).trim()) {
        payoutRecord = it;
        break;
      }
    }

    if (!payoutRecord) {
      alert(`Không tìm thấy dữ liệu kỳ Payout "${payoutId}" trong bộ nhớ đệm.`);
      return;
    }

    const p = payoutRecord.paymentPayout || payoutRecord;
    const payoutGross = decScale(p.eligibleTotalAmount);
    const payoutNet = decScale(p.totalPaymentAmount);

    const createdTimeStr = p.payoutCreatedTime ? formatEpochDateTime(p.payoutCreatedTime) : "(không xác định)";
    const arrivalTimeStr = p.payArrivalTime ? formatEpochDateTime(p.payArrivalTime) : "(không xác định)";

    // 2. LINKED Billing records qua String(Billing.payout_id).trim() === String(Payout.payoutId).trim()
    // từ TOÀN BỘ CACHE (WHOLE CACHE, không bị giới hạn bởi bộ lọc ngày Billing hiện tại)
    const linkedBills = (rawBillingList || []).filter(it => {
      if (!it || typeof it !== "object" || it.isFeeInvoice || it.paymentPayout) return false;
      return String(it.payout_id || "").trim() === String(payoutId).trim();
    });

    linkedBills.sort((a, b) => (Number(a.order_completed_period_start_time || 0) - Number(b.order_completed_period_start_time || 0)));

    let sumBillingGross = 0;
    let sumBillingNet = 0;
    let billsRowsHtml = "";

    for (const b of linkedBills) {
      const bGross = readMoneyAmount(b.eligible_total_amount_dis, b.eligible_total_amount);
      const bNet = readMoneyAmount(b.total_payment_amount_dis, b.total_payment_amount);
      const bDed = Math.max(0, bGross - bNet);
      sumBillingGross += bGross;
      sumBillingNet += bNet;

      const completionDate = b.order_completed_period_start_time
        ? formatEpochDateOnly(b.order_completed_period_start_time)
        : "(không xác định)";

      billsRowsHtml += `
        <tr>
          <td>${escapeHtml(completionDate)}</td>
          <td>${escapeHtml(b.validation_id || "-")}</td>
          <td style="text-align:right;">${formatVnd(bGross)} đ</td>
          <td style="text-align:right;">${formatVnd(bDed)} đ</td>
          <td style="text-align:right; font-weight:600;">${formatVnd(bNet)} đ</td>
        </tr>
      `;
    }

    const deductionAtBilling = Math.max(0, sumBillingGross - sumBillingNet);
    const hasLinkedBills = linkedBills.length > 0;
    const isGrossMatched = hasLinkedBills && (sumBillingGross === payoutGross);

    let coverageBannerHtml = "";
    let diffBreakdownHtml = "";

    if (!hasLinkedBills) {
      coverageBannerHtml = `
        <div class="alert-warning" style="margin-bottom:14px; padding:10px 14px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:6px; font-size:13px;">
          ⚠️ <strong>Cảnh báo độ bao phủ:</strong> Không tìm thấy bản ghi Billing (hoàn thành đơn) nào liên kết với kỳ Payout này trong bộ nhớ đệm cache. Sổ S1a luôn giữ nguyên doanh thu gộp từ Payout (${formatVnd(payoutGross)} đ).
        </div>
      `;
    } else if (!isGrossMatched) {
      coverageBannerHtml = `
        <div class="alert-warning" style="margin-bottom:14px; padding:10px 14px; background:#fff3cd; color:#856404; border:1px solid #ffeeba; border-radius:6px; font-size:13px;">
          ⚠️ <strong>Cảnh báo độ bao phủ:</strong> Tổng hoa hồng gộp từ các bản ghi Billing liên kết (${formatVnd(sumBillingGross)} đ) <strong>KHÔNG khớp</strong> với hoa hồng gộp của kỳ Payout (${formatVnd(payoutGross)} đ). Số liệu Billing trong cache có thể chưa đồng bộ đủ các lát cắt. Sổ S1a giữ nguyên số liệu gộp từ Payout.
        </div>
      `;
    } else {
      const payoutDiff = sumBillingNet - payoutNet;
      coverageBannerHtml = `
        <div style="margin-bottom:14px; padding:10px 14px; background:#e6fffa; color:#234e52; border:1px solid #b2f5ea; border-radius:6px; font-size:13px;">
          ✅ <strong>Khớp hoàn toàn độ bao phủ:</strong> Đã liên kết đủ ${linkedBills.length} bản ghi Billing từ toàn bộ cache; tổng hoa hồng gộp khớp chính xác 100% với kỳ Payout (${formatVnd(payoutGross)} đ).
        </div>
      `;

      diffBreakdownHtml = `
        <div style="background:#f8f9fa; border:1px solid var(--border); border-radius:6px; padding:12px 16px; margin-top:14px; font-size:13px;">
          <div style="font-weight:700; margin-bottom:8px; color:var(--text);">📊 Tổng hợp đối soát tài chính:</div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
            <div>• Tổng HH gộp Billing: <strong>${formatVnd(sumBillingGross)} đ</strong></div>
            <div>• Giảm trừ tại Billing: <strong>${formatVnd(deductionAtBilling)} đ</strong></div>
            <div>• Tổng thực nhận Billing: <strong>${formatVnd(sumBillingNet)} đ</strong></div>
            <div>• Thực nhận chi trả Payout: <strong>${formatVnd(payoutNet)} đ</strong></div>
          </div>
          <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--border); color:#d63031; font-weight:700;">
            • Chênh lệch lúc chi trả: ${formatVnd(payoutDiff)} đ
          </div>
          <div style="margin-top:6px; font-size:12px; color:var(--muted); line-height:1.4;">
            <em>Ghi chú:</em> Khoản chênh lệch ${formatVnd(payoutDiff)} đ phản ánh khấu trừ tạm tính/thuế khi chuyển khoản theo đối soát thực tế. Shopee API chỉ trả về số thực nhận tổng, không tách sẵn dòng chi tiết thuế GTGT/TNCN trong payload API.
          </div>
        </div>
      `;
    }

    if (payoutReconTitle) payoutReconTitle.textContent = `🔍 Đối chiếu kỳ Payout: ${payoutId}`;

    payoutReconBody.innerHTML = `
      ${coverageBannerHtml}
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-bottom:16px; background:#f1f2f6; padding:12px 14px; border-radius:6px; font-size:13px;">
        <div><strong>Mã kỳ Payout:</strong> ${escapeHtml(payoutId)}</div>
        <div><strong>Ngày tạo (Creation):</strong> ${escapeHtml(createdTimeStr)}</div>
        <div><strong>Ngày tiền về (Arrival):</strong> ${escapeHtml(arrivalTimeStr)}</div>
        <div><strong>HH gộp Payout (API):</strong> <strong style="color:var(--primary);">${formatVnd(payoutGross)} đ</strong></div>
        <div><strong>Thực nhận Payout (API):</strong> <strong style="color:#107c41;">${formatVnd(payoutNet)} đ</strong></div>
      </div>

      <div style="font-weight:700; font-size:13px; margin-bottom:6px;">📋 Danh sách bản ghi Billing liên kết (${linkedBills.length} bản ghi từ toàn bộ Cache):</div>
      <div style="max-height:240px; overflow-y:auto; border:1px solid var(--border); border-radius:6px;">
        <table class="report-table" style="width:100%; margin:0; font-size:12px;">
          <thead>
            <tr>
              <th style="width:110px;">Ngày hoàn thành</th>
              <th>Mã Billing (Validation ID)</th>
              <th style="text-align:right; width:120px;">HH gộp</th>
              <th style="text-align:right; width:120px;">Giảm trừ Billing</th>
              <th style="text-align:right; width:120px;">Thực nhận Billing</th>
            </tr>
          </thead>
          <tbody>
            ${hasLinkedBills ? billsRowsHtml : '<tr><td colspan="5" style="text-align:center; color:var(--muted); padding:16px;">Không có bản ghi Billing liên kết nào.</td></tr>'}
          </tbody>
          ${hasLinkedBills ? `
          <tfoot>
            <tr style="font-weight:700; background:#f8f9fa;">
              <td colspan="2">Tổng cộng (${linkedBills.length} bản ghi)</td>
              <td style="text-align:right;">${formatVnd(sumBillingGross)} đ</td>
              <td style="text-align:right;">${formatVnd(deductionAtBilling)} đ</td>
              <td style="text-align:right; color:#107c41;">${formatVnd(sumBillingNet)} đ</td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>

      ${diffBreakdownHtml}
    `;

    const handleClose = () => {
      if (typeof dialogPayoutRecon.close === "function") {
        dialogPayoutRecon.close();
      } else {
        dialogPayoutRecon.removeAttribute("open");
      }
      if (triggerElement && typeof triggerElement.focus === "function") {
        triggerElement.focus();
      }
    };

    if (btnClosePayoutRecon) btnClosePayoutRecon.onclick = handleClose;
    if (btnClosePayoutReconFooter) btnClosePayoutReconFooter.onclick = handleClose;

    dialogPayoutRecon.onclose = () => {
      if (triggerElement && typeof triggerElement.focus === "function") {
        triggerElement.focus();
      }
    };

    if (typeof dialogPayoutRecon.showModal === "function") {
      dialogPayoutRecon.showModal();
      if (btnClosePayoutRecon && typeof btnClosePayoutRecon.focus === "function") {
        btnClosePayoutRecon.focus();
      }
    } else {
      dialogPayoutRecon.setAttribute("open", "");
    }
  }

  function renderS1aTable() {
    if (!s1aTbody) return;
    updateS1aProfileDisplay();
    const activeMonths = getFilteredMonthKeys(availableMonths);
    updatePayoutReconSelector(activeMonths);

    const model = getS1aCurrentModel();

    if (!model || model.error) {
      const errText = model?.error || "Lỗi tạo mô hình sổ S1a-HKD";
      if (s1aDispPeriod) {
        s1aDispPeriod.textContent = formatS1aPeriodText(activeMonths);
      }
      if (s1aWarningBanner && s1aWarningText) {
        s1aWarningText.textContent = errText;
        s1aWarningBanner.style.display = "flex";
      }
      if (s1aSheetWrapper) s1aSheetWrapper.style.display = "none";
      if (s1aSheet) s1aSheet.style.display = "none";
      if (typeof document !== "undefined" && document.body?.classList) {
        document.body.classList.add("s1a-has-error");
      }
      s1aTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #c0392b; padding: 24px;">${escapeHtml(errText)}</td></tr>`;
      if (s1aDispTotal) s1aDispTotal.textContent = "-";
      if (s1aPrintBtn) s1aPrintBtn.disabled = true;
      if (s1aExportExcelBtn) s1aExportExcelBtn.disabled = true;
      if (s1aExportDocxBtn) s1aExportDocxBtn.disabled = true;
      return;
    }

    if (s1aDispPeriod) s1aDispPeriod.textContent = model.periodText;
    if (s1aDispSigDate) s1aDispSigDate.textContent = model.signDateFormatted;

    if (s1aWarningBanner) s1aWarningBanner.style.display = "none";
    if (s1aSheetWrapper) s1aSheetWrapper.style.display = "";
    if (s1aSheet) s1aSheet.style.display = "block";
    if (typeof document !== "undefined" && document.body?.classList) {
      document.body.classList.remove("s1a-has-error");
    }
    if (s1aPrintBtn) s1aPrintBtn.disabled = false;
    if (s1aExportExcelBtn) s1aExportExcelBtn.disabled = false;
    if (s1aExportDocxBtn) s1aExportDocxBtn.disabled = false;

    let rowsHtml = "";
    for (const r of model.rows) {
      const reconBtnHtml = r.payoutId
        ? ` <button type="button" class="btn-s1a-recon-inline no-print" data-payout-id="${escapeHtml(r.payoutId)}" title="Xem đối chiếu kỳ ${escapeHtml(r.payoutId)}" aria-label="Xem đối chiếu kỳ ${escapeHtml(r.payoutId)}" style="margin-left:6px; padding:2px 8px; font-size:11px; cursor:pointer; background:#e8f4fd; color:#0984e3; border:1px solid #74b9ff; border-radius:4px; font-weight:600;">🔍 Đối chiếu</button>`
        : "";
      rowsHtml += `
        <tr>
          <td class="col-s1a-date">${escapeHtml(r.date)}</td>
          <td class="col-s1a-desc">${escapeHtml(r.desc)}${reconBtnHtml}</td>
          <td class="col-s1a-amt">${formatVnd(r.amount)}</td>
        </tr>
      `;
    }

    // Pad at least 5 rows for authentic paper form layout
    const minRows = 5;
    if (model.rows.length < minRows) {
      for (let i = model.rows.length; i < minRows; i++) {
        rowsHtml += `
          <tr>
            <td class="col-s1a-date">&nbsp;</td>
            <td class="col-s1a-desc">&nbsp;</td>
            <td class="col-s1a-amt">&nbsp;</td>
          </tr>
        `;
      }
    }

    s1aTbody.innerHTML = rowsHtml;
    if (s1aDispTotal) {
      s1aDispTotal.textContent = formatVnd(model.totalAmount);
    }
  }

  function getS1aCurrentModel() {
    const activeMonths = getFilteredMonthKeys(availableMonths);
    const grouping = s1aSelectGrouping ? s1aSelectGrouping.value : "monthly";
    const data = extractS1aData(rawBillingList, activeMonths, grouping);
    if (data.error) return { error: data.error };

    const now = new Date(Date.now() + 7 * 3600000);
    const signDay = String(now.getUTCDate()).padStart(2, "0");
    const signMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
    const signYear = String(now.getUTCFullYear());
    const signDateFormatted = `Ngày ${signDay} tháng ${signMonth} năm ${signYear}`;

    const ownerName = s1aInputName ? s1aInputName.value.trim() : "";
    const address = s1aInputAddress ? s1aInputAddress.value.trim() : "";
    const taxCode = s1aInputTaxCode ? s1aInputTaxCode.value.trim() : "";
    const businessLocation = s1aInputLocation ? (s1aInputLocation.value.trim() || "Kinh doanh trên nền tảng số (Shopee Affiliate)") : "Kinh doanh trên nền tảng số (Shopee Affiliate)";
    const signerName = ownerName;

    return {
      error: null,
      ownerName,
      address,
      taxCode,
      businessLocation,
      periodText: formatS1aPeriodText(activeMonths),
      unit: "đồng",
      grouping,
      rows: data.rows,
      totalAmount: data.grandTotal,
      grandTotal: data.grandTotal,
      signerName,
      signDay,
      signMonth,
      signYear,
      signDateFormatted
    };
  }

  // S1a Profile Event Listeners
  if (s1aInputName) s1aInputName.addEventListener("input", () => { updateS1aProfileDisplay(); saveS1aProfile(getS1aProfileFromInputs()); });
  if (s1aInputAddress) s1aInputAddress.addEventListener("input", () => { updateS1aProfileDisplay(); saveS1aProfile(getS1aProfileFromInputs()); });
  if (s1aInputTaxCode) s1aInputTaxCode.addEventListener("input", () => { updateS1aProfileDisplay(); saveS1aProfile(getS1aProfileFromInputs()); });
  if (s1aInputLocation) s1aInputLocation.addEventListener("input", () => { updateS1aProfileDisplay(); saveS1aProfile(getS1aProfileFromInputs()); });

  if (s1aSaveProfileBtn) {
    s1aSaveProfileBtn.addEventListener("click", async () => {
      await saveS1aProfile(getS1aProfileFromInputs());
      alert("Đã lưu thông tin khai báo S1a vào bộ nhớ trình duyệt!");
    });
  }

  if (s1aSelectGrouping) {
    s1aSelectGrouping.addEventListener("change", () => {
      saveS1aProfile(getS1aProfileFromInputs());
      renderS1aTable();
    });
  }

  if (s1aExportExcelBtn) {
    s1aExportExcelBtn.addEventListener("click", () => {
      if (fromDateInput?.dataset.hasParseError || toDateInput?.dataset.hasParseError ||
          fromDateText?.classList.contains("is-invalid") || toDateText?.classList.contains("is-invalid")) {
        alert("Không thể xuất file: Ngày nhập vào không hợp lệ. Vui lòng kiểm tra lại định dạng DD/MM/YYYY!");
        return;
      }
      if (s1aExportExcelBtn.disabled || (typeof document !== "undefined" && document.body?.classList?.contains("s1a-has-error"))) {
        return;
      }
      const model = getS1aCurrentModel();
      if (!model) return;
      if (typeof S1aExport !== "undefined" && typeof S1aExport.downloadS1aXlsx === "function") {
        const fromV = fromDateInput ? fromDateInput.value : "start";
        const toV = toDateInput ? toDateInput.value : "end";
        S1aExport.downloadS1aXlsx(model, `So_Doanh_Thu_S1a_HKD_${fromV}_den_${toV}.xlsx`);
      }
    });
  }

  if (s1aExportDocxBtn) {
    s1aExportDocxBtn.addEventListener("click", () => {
      if (fromDateInput?.dataset.hasParseError || toDateInput?.dataset.hasParseError ||
          fromDateText?.classList.contains("is-invalid") || toDateText?.classList.contains("is-invalid")) {
        alert("Không thể xuất file: Ngày nhập vào không hợp lệ. Vui lòng kiểm tra lại định dạng DD/MM/YYYY!");
        return;
      }
      if (s1aExportDocxBtn.disabled || (typeof document !== "undefined" && document.body?.classList?.contains("s1a-has-error"))) {
        return;
      }
      const model = getS1aCurrentModel();
      if (!model) return;
      if (typeof S1aExport !== "undefined" && typeof S1aExport.downloadS1aDocx === "function") {
        const fromV = fromDateInput ? fromDateInput.value : "start";
        const toV = toDateInput ? toDateInput.value : "end";
        S1aExport.downloadS1aDocx(model, `So_Doanh_Thu_S1a_HKD_${fromV}_den_${toV}.docx`);
      }
    });
  }

  if (s1aPrintBtn) {
    s1aPrintBtn.addEventListener("click", () => {
      if (s1aPrintBtn.disabled || (typeof document !== "undefined" && document.body?.classList?.contains("s1a-has-error"))) {
        return;
      }
      const s1aTabBtn = document.getElementById("tab-btn-s1a");
      if (s1aTabBtn && typeof s1aTabBtn.click === "function") {
        s1aTabBtn.click();
      }
      if (typeof window !== "undefined" && typeof window.print === "function") {
        window.print();
      }
    });
  }

  function buildExportRows(monthsMap, activeMonths) {
    const fromVal = (typeof fromDateInput !== "undefined" && fromDateInput) ? fromDateInput.value : "";
    const toVal = (typeof toDateInput !== "undefined" && toDateInput) ? toDateInput.value : "";
    // Array of rows: [ [col1, col2, col3], ... ]
    const rows = [];
    rows.push(["Ngày tháng", "Diễn giải", "Số tiền"]);

    for (const mKey of activeMonths) {
      const [yStr, mStr] = mKey.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const monStr = String(m).padStart(2, "0");
      const mData = monthsMap[mKey];

      rows.push([`Tháng ${monStr}/${y}`, "", ""]);

      if (!mData || !mData.hasBilling) {
        rows.push(["-", "Chưa có dữ liệu doanh thu theo ngày hoàn thành đơn", "-"]);
        rows.push(["", "Tổng Doanh Thu", "-"]);
        rows.push(["", "", ""]);
        continue;
      }

      const daysCount = getDaysInMonth(y, m);
      const dailyMap = mData.days || {};
      let monthTotal = 0;
      let monthHasDays = false;

      for (let d = 1; d <= daysCount; d++) {
        const dStr = String(d).padStart(2, "0");
        const dayKey = `${yStr}-${monStr}-${dStr}`;
        if (fromVal && dayKey < fromVal) continue;
        if (toVal && dayKey > toVal) continue;

        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        const dateFormatted = `${dStr}/${monStr}/${y}`;
        rows.push([dateFormatted, "Doanh thu từ Shopee", amt]);
        monthHasDays = true;
      }

      if (monthHasDays) {
        rows.push(["", "Tổng Doanh Thu", monthTotal]);
      } else {
        rows.push(["-", "Không có ngày nào trong khoảng lọc", "-"]);
      }
      rows.push(["", "", ""]); // empty spacer
    }

    return rows;
  }

  function downloadCsv() {
    if (fromDateInput?.dataset.hasParseError || toDateInput?.dataset.hasParseError ||
        fromDateText?.classList.contains("is-invalid") || toDateText?.classList.contains("is-invalid")) {
      alert("Không thể xuất file: Ngày nhập vào không hợp lệ. Vui lòng kiểm tra lại định dạng DD/MM/YYYY!");
      return;
    }
    const fromVal = (typeof fromDateInput !== "undefined" && fromDateInput) ? fromDateInput.value : "";
    const toVal = (typeof toDateInput !== "undefined" && toDateInput) ? toDateInput.value : "";
    if (fromVal && toVal && fromVal > toVal) {
      alert("Khoảng ngày lọc không hợp lệ: 'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'!");
      return;
    }
    const monthsMap = processData(fromVal, toVal);
    const activeMonths = getFilteredMonthKeys(availableMonths);
    if (activeMonths.length === 0) {
      alert("Không có tháng nào được chọn để xuất CSV!");
      return;
    }

    const missingBillingMonths = activeMonths.filter(m => !monthsMap[m]?.hasBilling);
    if (missingBillingMonths.length > 0) {
      const monthListStr = missingBillingMonths.map(k => {
        const [y, m] = k.split("-");
        return `${m}/${y}`;
      }).join(", ");
      alert(`Không thể xuất file CSV: Tháng ${monthListStr} không có dữ liệu doanh thu theo ngày hoàn thành đơn (chỉ có dữ liệu đối soát Payout theo kỳ chi trả)!`);
      return;
    }

    const rows = buildExportRows(monthsMap, activeMonths);
    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel Vietnamese compatibility
    for (const r of rows) {
      csvContent += r.map(cell => {
        const str = String(cell ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(",") + "\r\n";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fileFrom = fromVal || activeMonths[0];
    const fileTo = toVal || activeMonths[activeMonths.length - 1];
    link.download = `DoanhThu_Shopee_${fileFrom}_den_${fileTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadExcel() {
    if (fromDateInput?.dataset.hasParseError || toDateInput?.dataset.hasParseError ||
        fromDateText?.classList.contains("is-invalid") || toDateText?.classList.contains("is-invalid")) {
      alert("Không thể xuất file: Ngày nhập vào không hợp lệ. Vui lòng kiểm tra lại định dạng DD/MM/YYYY!");
      return;
    }
    const fromVal = (typeof fromDateInput !== "undefined" && fromDateInput) ? fromDateInput.value : "";
    const toVal = (typeof toDateInput !== "undefined" && toDateInput) ? toDateInput.value : "";
    if (fromVal && toVal && fromVal > toVal) {
      alert("Khoảng ngày lọc không hợp lệ: 'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'!");
      return;
    }
    const monthsMap = processData(fromVal, toVal);
    const activeMonths = getFilteredMonthKeys(availableMonths);
    if (activeMonths.length === 0) {
      alert("Không có tháng nào được chọn để xuất Excel!");
      return;
    }

    const missingBillingMonths = activeMonths.filter(m => !monthsMap[m]?.hasBilling);
    if (missingBillingMonths.length > 0) {
      const monthListStr = missingBillingMonths.map(k => {
        const [y, m] = k.split("-");
        return `${m}/${y}`;
      }).join(", ");
      alert(`Không thể xuất file Excel: Tháng ${monthListStr} không có dữ liệu doanh thu theo ngày hoàn thành đơn (chỉ có dữ liệu đối soát Payout theo kỳ chi trả)!`);
      return;
    }

    const rows = buildExportRows(monthsMap, activeMonths);

    // Build SpreadsheetML XML (.xls)
    let xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:Bold="1" ss:Color="#000000"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="MonthHeader">
   <Font ss:Bold="1" ss:Size="11" ss:Color="#1A202C"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellDate">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellDesc">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="CellAmount">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalLabel">
   <Font ss:Bold="1" ss:Color="#000000"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="TotalAmount">
   <Font ss:Bold="1" ss:Color="#EE4D2D"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <NumberFormat ss:Format="#,##0"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Doanh Thu Shopee">
  <Table>
   <Column ss:Width="100"/>
   <Column ss:Width="220"/>
   <Column ss:Width="140"/>
`;

    for (let i = 0; i < rows.length; i++) {
      const [c1, c2, c3] = rows[i];
      if (i === 0) {
        xml += `   <Row>\n    <Cell ss:StyleID="Header"><Data ss:Type="String">${c1}</Data></Cell>\n    <Cell ss:StyleID="Header"><Data ss:Type="String">${c2}</Data></Cell>\n    <Cell ss:StyleID="Header"><Data ss:Type="String">${c3}</Data></Cell>\n   </Row>\n`;
      } else if (String(c1).startsWith("Tháng ")) {
        xml += `   <Row>\n    <Cell ss:StyleID="MonthHeader" ss:MergeAcross="2"><Data ss:Type="String">${c1}</Data></Cell>\n   </Row>\n`;
      } else if (c2 === "Tổng Doanh Thu") {
        const valType = typeof c3 === "number" ? "Number" : "String";
        xml += `   <Row>\n    <Cell ss:StyleID="CellDate"><Data ss:Type="String"></Data></Cell>\n    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">${c2}</Data></Cell>\n    <Cell ss:StyleID="TotalAmount"><Data ss:Type="${valType}">${c3}</Data></Cell>\n   </Row>\n`;
      } else if (c1 === "" && c2 === "") {
        xml += `   <Row></Row>\n`;
      } else {
        const valType = typeof c3 === "number" ? "Number" : "String";
        xml += `   <Row>\n    <Cell ss:StyleID="CellDate"><Data ss:Type="String">${c1}</Data></Cell>\n    <Cell ss:StyleID="CellDesc"><Data ss:Type="String">${c2}</Data></Cell>\n    <Cell ss:StyleID="CellAmount"><Data ss:Type="${valType}">${c3}</Data></Cell>\n   </Row>\n`;
      }
    }

    xml += `  </Table>
 </Worksheet>
</Workbook>`;

    const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const fileFrom = fromVal || activeMonths[0];
    const fileTo = toVal || activeMonths[activeMonths.length - 1];
    link.download = `DoanhThu_Shopee_${fileFrom}_den_${fileTo}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (exportCsvBtn) exportCsvBtn.addEventListener("click", downloadCsv);
  if (exportExcelBtn) exportExcelBtn.addEventListener("click", downloadExcel);

  // Date range selector handling
  function populateDateInputs(months) {
    const gmt7Now = new Date(Date.now() + 7 * 3600000);
    const y = gmt7Now.getUTCFullYear();
    const m = gmt7Now.getUTCMonth() + 1;
    const mm = String(m).padStart(2, "0");
    const lastDay = getDaysInMonth(y, m);
    const defaultFrom = `${y}-${mm}-01`;
    const defaultTo = `${y}-${mm}-${String(lastDay).padStart(2, "0")}`;

    const curFrom = fromDateInput ? fromDateInput.value : "";
    const curTo = toDateInput ? toDateInput.value : "";

    if (fromDateInput) {
      fromDateInput.value = (curFrom && isValidDateString(curFrom)) ? curFrom : defaultFrom;
      if (fromDateText) syncIsoToText(fromDateInput, fromDateText, fromDateError);
    }
    if (toDateInput) {
      toDateInput.value = (curTo && isValidDateString(curTo)) ? curTo : defaultTo;
      if (toDateText) syncIsoToText(toDateInput, toDateText, toDateError);
    }
  }

  function handleFilterChange() {
    const fromVal = (typeof fromDateInput !== "undefined" && fromDateInput) ? fromDateInput.value : "";
    const toVal = (typeof toDateInput !== "undefined" && toDateInput) ? toDateInput.value : "";
    if (fromDateInput?.dataset.hasParseError || toDateInput?.dataset.hasParseError ||
        fromDateText?.classList.contains("is-invalid") || toDateText?.classList.contains("is-invalid")) {
      showStatus("Lỗi bộ lọc: Ngày nhập vào không hợp lệ (DD/MM/YYYY).", "error");
      renderMonthlyTable({}, []);
      renderDailyTables({}, []);
      renderS1aTable();
      return;
    }
    if (fromVal && toVal && fromVal > toVal) {
      showStatus("Lỗi bộ lọc: 'Từ ngày' phải nhỏ hơn hoặc bằng 'Đến ngày'.", "error");
      if (fromDateError) {
        fromDateError.classList.add("active");
        fromDateError.textContent = "Từ ngày phải nhỏ hơn hoặc bằng Đến ngày";
      }
      renderMonthlyTable({}, []);
      renderDailyTables({}, []);
      renderS1aTable();
      return;
    }
    if (fromDateError && !fromDateInput?.dataset.hasParseError) {
      fromDateError.classList.remove("active");
      fromDateError.textContent = "";
    }
    const monthsMap = processData(fromVal, toVal);
    const activeMonths = getFilteredMonthKeys(availableMonths);
    renderMonthlyTable(monthsMap, activeMonths);
    renderDailyTables(monthsMap, activeMonths);
    renderS1aTable();
  }

  setupDateInputPair(fromDateInput, fromDateText, fromDateError, btnFromCalendar);
  setupDateInputPair(toDateInput, toDateText, toDateError, btnToCalendar);

  if (fromDateInput) fromDateInput.addEventListener("change", handleFilterChange);
  if (toDateInput) toDateInput.addEventListener("change", handleFilterChange);
  if (taxModeSelect) taxModeSelect.addEventListener("change", handleFilterChange);

  if (selectPayoutRecon) {
    selectPayoutRecon.addEventListener("change", () => {
      if (btnOpenPayoutRecon) {
        btnOpenPayoutRecon.disabled = !selectPayoutRecon.value;
      }
    });
  }

  if (btnOpenPayoutRecon) {
    btnOpenPayoutRecon.addEventListener("click", () => {
      if (selectPayoutRecon && selectPayoutRecon.value) {
        openPayoutReconDialog(selectPayoutRecon.value, btnOpenPayoutRecon);
      }
    });
  }

  if (s1aTbody) {
    s1aTbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-s1a-recon-inline");
      if (btn && btn.dataset.payoutId) {
        openPayoutReconDialog(btn.dataset.payoutId, btn);
      }
    });
  }

  // Initial render
  function initDataAndRender() {
    const monthsMap = processData();
    const sortedMonths = Object.keys(monthsMap).sort();

    // If no months found from data, generate standard 2026-01 to 2026-12 options
    if (sortedMonths.length === 0) {
      availableMonths = [
        "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
        "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"
      ];
    } else {
      availableMonths = sortedMonths;
    }

    populateDateInputs(availableMonths);
    const fromVal = (typeof fromDateInput !== "undefined" && fromDateInput) ? fromDateInput.value : "";
    const toVal = (typeof toDateInput !== "undefined" && toDateInput) ? toDateInput.value : "";
    const filteredMap = (fromVal || toVal) ? processData(fromVal, toVal) : monthsMap;
    const activeMonths = getFilteredMonthKeys(availableMonths);
    renderMonthlyTable(filteredMap, activeMonths);
    renderDailyTables(filteredMap, activeMonths);
    renderS1aTable();
  }

  // Load from cache or trigger live check
  (async function main() {
    await initS1aProfile();
    const cached = await loadCache();
    const isFresh = cached && cached.updatedAt && (Date.now() - cached.updatedAt < CACHE_TTL_MS) && Array.isArray(cached.list) && cached.list.length > 0;

    if (isFresh) {
      rawBillingList = cached.list;
      initDataAndRender();
      const payoutCount = rawBillingList.filter(it => it.paymentPayout || it.payoutId || it.payoutCreatedTime).length;
      const invoiceCount = rawBillingList.filter(it => it.isFeeInvoice || (!it.order_completed_period_start_time && it.totalServiceFee && (it.monthKey || it.paymentSummaryBillFeeInvoices || it.paymentCompletePeriodStartTime))).length;
      const billingCount = rawBillingList.filter(it => !it.isFeeInvoice && !it.paymentPayout && !it.payoutId && !it.payoutCreatedTime && it.order_completed_period_start_time).length;

      const sourceParts = [];
      if (payoutCount > 0) sourceParts.push(`${payoutCount} kỳ Payout`);
      if (billingCount > 0) sourceParts.push(`${billingCount} bản ghi ngày hoàn thành`);
      if (invoiceCount > 0) sourceParts.push(`${invoiceCount} HĐ phí DV`);
      const sourceLabel = sourceParts.join(" + ") || `${rawBillingList.length} bản ghi`;

      const updatedDate = new Date(cached.updatedAt);
      const remainingHours = Math.max(0, Math.round((CACHE_TTL_MS - (Date.now() - cached.updatedAt)) / 3600000));
      const hasWarnings = Array.isArray(cached.warnings) && cached.warnings.length > 0;
      const warnMsg = hasWarnings ? ` [Cảnh báo: ${cached.warnings.join("; ")}]` : "";

      showStatus(
        `Dữ liệu nạp từ Cache: ${sourceLabel}.${warnMsg} Lưu lúc ${updatedDate.toLocaleTimeString("vi-VN")} ${updatedDate.toLocaleDateString("vi-VN")}. Hết hạn sau ~${remainingHours}h.`,
        hasWarnings ? "normal" : "success",
        "Đã dùng cache (không gọi API). Bấm 'Làm mới từ Shopee' nếu cần tải mới."
      );
    } else if (cached?.list && Array.isArray(cached.list) && cached.list.length > 0) {
      rawBillingList = cached.list;
      initDataAndRender();
      showStatus("Dữ liệu cache đã hết hạn (>24h). Đang kết nối tới Shopee Affiliate để cập nhật...", "normal");
      fetchLiveFromTab(false);
    } else {
      initDataAndRender();
      showStatus("Chưa có dữ liệu trong cache. Đang tìm tab Shopee Affiliate để tải...");
      fetchLiveFromTab(false);
    }
  })();

  if (typeof window !== "undefined") {
    window.processData = processData;
    window.extractS1aData = extractS1aData;
    window.renderS1aTable = renderS1aTable;
    window.getS1aCurrentModel = getS1aCurrentModel;
    window.openPayoutReconDialog = openPayoutReconDialog;
    window.parseDmyToIso = parseDmyToIso;
    window.formatIsoToDmy = formatIsoToDmy;
    window.formatMonthLabel = formatMonthLabel;
    window.fetchLiveFromTab = fetchLiveFromTab;
  }
})();
