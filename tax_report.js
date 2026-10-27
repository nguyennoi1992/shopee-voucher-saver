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
    const net = paid > 0 ? paid : Math.max(0, billTotal - vat - pit - wht10);
    return { gross, mcn, fee, vat, pit, wht10, billTotal, net };
  }

  // DOM Elements
  const fromMonthSelect = document.getElementById("select-from-month");
  const toMonthSelect = document.getElementById("select-to-month");
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
  const s1aSaveProfileBtn = document.getElementById("btn-s1a-save-profile");
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
    if (typeof num !== "number" || isNaN(num)) return "0";
    return new Intl.NumberFormat("vi-VN").format(Math.round(num));
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
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

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
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
      } else if (parsed.data?.getPaymentPayoutBillingList?.payoutList) {
        candidate = parsed.data.getPaymentPayoutBillingList.payoutList;
      } else if (parsed.getPaymentPayoutBillingList?.payoutList) {
        candidate = parsed.getPaymentPayoutBillingList.payoutList;
      } else if (parsed.data?.payoutDetail) {
        candidate = [parsed.data.payoutDetail];
      } else if (parsed.payoutDetail) {
        candidate = [parsed.payoutDetail];
      } else if (parsed.payoutList && Array.isArray(parsed.payoutList)) {
        candidate = parsed.payoutList;
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
  function processData() {
    // Cơ chế phân định nguồn dữ liệu đối soát:
    //  - Mọi tháng có dữ liệu Payout Record: ưu tiên tuyệt đối Payout Record theo hoa hồng gộp (eligibleTotalAmount).
    //  - Tháng chưa có Payout: tự động fallback theo Ngày hoàn thành đơn (Billing List) + Hóa đơn phí DV (service_fee_invoice).
    const monthsMap = {};
    const feeInvoicesMap = {};
    const seenInvoiceKeys = new Set();

    // 1. Rà soát danh sách Hóa đơn phí dịch vụ điện tử (service_fee_invoice)
    for (const it of rawBillingList) {
      if (it.isFeeInvoice || (it.paymentSummaryBillFeeInvoices && it.totalServiceFee) || (it.paymentCompletePeriodStartTime && it.totalServiceFee && !it.order_completed_period_start_time)) {
        const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
        const mKey = it.monthKey || (s ? (() => {
          const dt = parseEpochToGmt7(s);
          return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        })() : null);
        if (!mKey) continue;
        const invId = it.invoiceNumber || it.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || "";
        const dedupKey = invId ? `${invId}_${mKey}` : `${s || 0}_${it.totalServiceFee || 0}_${mKey}`;
        if (seenInvoiceKeys.has(dedupKey)) continue;
        seenInvoiceKeys.add(dedupKey);
        feeInvoicesMap[mKey] = (feeInvoicesMap[mKey] || 0) + decScale(it.totalServiceFee);
      }
    }

    // Pass 1: Billing List theo ngày hoàn thành đơn
    for (const it of rawBillingList) {
      if (it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime || it.isFeeInvoice) continue;
      const s = it.order_completed_period_start_time;
      if (!s) continue;
      const dt = parseEpochToGmt7(s);
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const dayNum = dt.getDate();

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = createMonthEntry(dt.getFullYear(), dt.getMonth() + 1);
      }
      const mObj = monthsMap[mKey];
      mObj.hasBilling = true;

      const grossAmt = parseFloat(it.eligible_total_amount_dis || it.eligible_total_amount || 0) || 0;
      const mcnAmt = parseFloat(it.mcn_management_fee_dis || it.mcn_management_fee || 0) || 0;
      const billTotalAmt = parseFloat(it.total_payment_amount_dis || it.total_payment_amount || 0) || 0;
      const whtAmt = parseFloat(it.wht_amount_dis || it.pit_amount_dis || it.wht_amount || it.pit_amount || 0) || 0;
      const vatAmt = parseFloat(it.vat_amount_dis || it.vat_amount || 0) || 0;
      let feeAmt = parseFloat(it.service_fee_dis || it.service_fee || 0) || 0;
      if (Array.isArray(it.bills)) {
        for (const b of it.bills) {
          feeAmt += parseFloat(b.service_fee_dis || b.service_fee || 0) || 0;
        }
      }
      if (feeAmt === 0 && billTotalAmt > 0 && (grossAmt - mcnAmt) > billTotalAmt) {
        feeAmt = Math.round((grossAmt - mcnAmt) - billTotalAmt);
      }

      mObj.days[dayNum] = (mObj.days[dayNum] || 0) + grossAmt;
      mObj.billingGross = (mObj.billingGross || 0) + grossAmt;
      mObj.gross += grossAmt;
      mObj.mcn += mcnAmt;
      mObj.billTotal += billTotalAmt;
      mObj.wht10 += whtAmt;
      mObj.pit += whtAmt;
      mObj.vat += vatAmt;
      mObj.fee += feeAmt;
      mObj.netPaid += billTotalAmt > 0 ? billTotalAmt : 0;
      mObj.totalRecords++;
      if (it.with_wht || whtAmt > 0) mObj.withWhtCount++;
      if (it.with_vat || vatAmt > 0) mObj.withVatCount++;
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
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

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
          // Bản ghi trùng lặp: không cộng dồn hai lần
          continue;
        }
        seenPayouts.set(payoutId, { amt, s, mKey });
      }

      const d = decomposePayout(it, mKey);

      // Cho MỌI tháng có Payout: Payout Record là chuẩn đối soát tài chính
      if (!monthsMap[mKey] || !monthsMap[mKey].hasPayout) {
        const prevDays = monthsMap[mKey]?.days || {};
        const prevHasBilling = Boolean(monthsMap[mKey]?.hasBilling);
        const prevBillingGross = monthsMap[mKey]?.billingGross || 0;
        monthsMap[mKey] = createMonthEntry(dt.getFullYear(), dt.getMonth() + 1);
        monthsMap[mKey].days = prevDays;
        monthsMap[mKey].hasBilling = prevHasBilling;
        monthsMap[mKey].billingGross = prevBillingGross;
        monthsMap[mKey].hasPayout = true;
      }

      const mObj = monthsMap[mKey];
      // Tuyệt đối không đưa số tiền payout vào days của ngày hoàn thành đơn!
      mObj.gross += d.gross;
      mObj.mcn += d.mcn;
      mObj.billTotal += d.billTotal;
      mObj.wht10 += d.wht10;
      mObj.vat += d.vat;
      mObj.pit += d.pit;
      mObj.fee += d.fee;
      mObj.netPaid += d.net;
      mObj.totalRecords++;
      if (d.wht10 > 0) mObj.withWhtCount++;
      if (d.vat > 0 || d.pit > 0) mObj.withVatCount++;
    }

    // Pass 3: Áp dụng Hóa đơn phí dịch vụ điện tử từ service_fee_invoice cho các tháng hạch toán theo billing
    // Không ghi đè các tháng đã có Payout Record thực tế (Payout ghi nhận theo ngày chi trả tiền mặt)
    for (const mKey of Object.keys(feeInvoicesMap)) {
      if (monthsMap[mKey] && !monthsMap[mKey].hasPayout) {
        monthsMap[mKey].fee = feeInvoicesMap[mKey];
        monthsMap[mKey].billTotal = Math.max(0, monthsMap[mKey].gross - monthsMap[mKey].mcn - monthsMap[mKey].fee);
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
      billTotal: 0,
      wht10: 0,
      vat: 0,
      pit: 0,
      fee: 0,
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
    const fromVal = fromMonthSelect ? fromMonthSelect.value : "";
    const toVal = toMonthSelect ? toMonthSelect.value : "";
    const start = fromVal || (allMonths && allMonths.length > 0 ? allMonths[0] : "");
    const end = toVal || (allMonths && allMonths.length > 0 ? allMonths[allMonths.length - 1] : "");
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
      let feeDv = 0;
      let billReal = 0;
      let netTk = 0;

      if (data && data.hasPayout) {
        // Nguồn dữ liệu từ Payout Record: Lấy chuẩn xác theo từng kỳ chi trả thực tế
        feeDv = data.fee;
        billReal = data.billTotal;
        wht10 = data.wht10;
        vat5 = data.vat;
        tncnKd5 = data.pit;
        netTk = data.netPaid > 0 ? data.netPaid : (billReal - wht10 - vat5 - tncnKd5);
      } else if (isOctober2026Onwards) {
        // Giai đoạn từ 10/2026: Tách 5% VAT và 5% PIT, 10% vãng lai = 0
        feeDv = (data && data.fee > 0) ? data.fee : 0;
        billReal = afterMcn - feeDv;
        wht10 = 0;
        vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
        tncnKd5 = (data && data.pit > 0) ? data.pit : Math.round(afterMcn * 0.05);
        netTk = billReal - vat5 - tncnKd5;
      } else {
        // Giai đoạn trước 10/2026:
        // Shopee trừ phí dịch vụ nền tảng 0.98% trực tiếp vào billTotal
        if (data && data.fee > 0) {
          feeDv = data.fee;
        } else if (data && data.billTotal > 0 && afterMcn > data.billTotal) {
          feeDv = Math.round(afterMcn - data.billTotal);
        } else {
          feeDv = 0;
        }
        billReal = afterMcn - feeDv;

        if (taxMode === "hkd") {
          vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
          tncnKd5 = (data && data.pit > 0) ? data.pit : Math.round(afterMcn * 0.05);
          wht10 = 0;
        } else if (taxMode === "individual") {
          wht10 = (data && data.wht10 > 0) ? data.wht10 : 0;
          vat5 = 0;
          tncnKd5 = 0;
        } else {
          // "actual": Lấy chính xác dữ liệu thực tế từ API Shopee trả về
          // Chỉ hiển thị thuế TNCN khi trên bill thực tế có trừ (data.wht10 > 0)
          // Nếu thu nhập dưới ngưỡng khấu trừ (data.wht10 === 0) thì thuế TNCN bằng 0 đ!
          wht10 = (data && data.wht10 > 0) ? data.wht10 : 0;
          vat5 = (data && data.vat > 0) ? data.vat : 0;
          tncnKd5 = 0;
        }
        netTk = billReal - wht10 - vat5 - tncnKd5;
      }

      totalGross += gross;
      totalMcn += mcn;
      totalAfterMcn += afterMcn;
      totalFee += feeDv;
      totalBill += billReal;
      totalWht10 += wht10;
      totalVat5 += vat5;
      totalTncnKd5 += tncnKd5;
      totalNetTk += netTk;

      const hasPayout = Boolean(data && data.hasPayout);
      const hasBilling = Boolean(data && data.hasBilling);
      const sourceBadge = hasPayout
        ? '<span class="badge-source badge-payout" style="display:inline-block; margin-left:4px; padding:1px 5px; background:#e8f4fd; color:#0984e3; border-radius:3px; font-size:11px; font-weight:600;">Payout</span>'
        : (hasBilling ? '<span class="badge-source badge-billing" style="display:inline-block; margin-left:4px; padding:1px 5px; background:#fff3cd; color:#d35400; border-radius:3px; font-size:11px; font-weight:600;">Billing (Fallback)</span>' : '');

      tbodyHtml += `
        <tr>
          <td>${mKey} ${sourceBadge}</td>
          <td>${formatVnd(gross)}</td>
          <td>${formatVnd(mcn)}</td>
          <td>${formatVnd(afterMcn)}</td>
          <td>${formatVnd(feeDv)}</td>
          <td>${formatVnd(billReal)}</td>
          <td>${formatVnd(wht10)}</td>
          <td>${formatVnd(vat5)}</td>
          <td>${formatVnd(tncnKd5)}</td>
          <td style="font-weight:700; color:#2d3436;">${formatVnd(netTk)}</td>
        </tr>
      `;

      simpleHtml += `
        <tr>
          <td>${mKey}</td>
          <td style="text-align: left;">Doanh thu từ Shopee ${hasPayout ? '(Kỳ chi trả Payout)' : (hasBilling ? '(Hoàn thành đơn - Fallback Billing)' : '')}</td>
          <td>${formatVnd(gross)}</td>
          <td style="font-weight:700; color:#107c41;">${formatVnd(netTk)}</td>
        </tr>
      `;
    }

    monthlyTbody.innerHTML = tbodyHtml;

    monthlyTfoot.innerHTML = `
      <tr>
        <td>Cộng</td>
        <td>${formatVnd(totalGross)}</td>
        <td>${formatVnd(totalMcn)}</td>
        <td>${formatVnd(totalAfterMcn)}</td>
        <td>${formatVnd(totalFee)}</td>
        <td>${formatVnd(totalBill)}</td>
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
      const startY = activeMonths[0].split("-")[0];
      const endY = activeMonths[activeMonths.length - 1].split("-")[0];
      const yearLabel = startY === endY ? startY : `${startY} - ${endY}`;
      bannerTitle.textContent = `Sổ tay thuế ${yearLabel}`;
      monthlyTitle.textContent = `Theo tháng ${activeMonths[0]} đến ${activeMonths[activeMonths.length - 1]} (GMT+7 - theo kỳ chi trả khi có dữ liệu Payout, theo ngày đơn hoàn thành cho tháng còn lại)`;
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
                  <td colspan="3">Tháng ${monStr}/${y} (${mKey}) - Doanh thu theo ngày hoàn thành đơn</td>
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

      for (let d = 1; d <= daysCount; d++) {
        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        const dStr = String(d).padStart(2, "0");
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
                <td colspan="3">Tháng ${monStr}/${y} (${mKey}) - Doanh thu theo ngày hoàn thành đơn</td>
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
    const grouping = (typeof opt1 === "string" && (opt1 === "monthly" || opt1 === "daily")) ? opt1 : (opt2 || "monthly");

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
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;

      // If outside selected active months, skip
      if (!activeMonths.includes(mKey)) continue;

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
          // Same payoutId with same data: deduplicate, do not double totals
          continue;
        }
        seenPayouts.set(payoutId, { amt, s, mKey });
      }

      monthRecords[mKey].push({
        epoch: s,
        dt,
        payoutId,
        amount: amt,
        timeField
      });
    }

    // Check missing months in selected range
    const missingMonths = [];
    for (const m of activeMonths) {
      if (monthRecords[m].length === 0) {
        missingMonths.push(m);
      }
    }

    if (missingMonths.length > 0) {
      const formatted = missingMonths.map(k => {
        const [y, m] = k.split("-");
        return `${m}/${y}`;
      }).join(", ");
      return {
        error: `Không thể lập sổ S1a-HKD: Tháng ${formatted} không có dữ liệu từ nguồn kỳ chi trả Payout (payoutCreatedTime). Vui lòng thu hẹp khoảng tháng đã chọn.`,
        rows: [],
        grandTotal: 0,
        missingMonths
      };
    }

    const rows = [];
    let grandTotal = 0;

    if (grouping === "daily") {
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
          amount: r.amount
        });
        grandTotal += r.amount;
      }
    } else {
      // grouping === "monthly" (default)
      for (const mKey of activeMonths) {
        const [yStr, mStr] = mKey.split("-");
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const lastDay = getDaysInMonth(y, m);
        const dateFormatted = `${String(lastDay).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
        const recs = monthRecords[mKey];
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

    return {
      error: null,
      rows,
      grandTotal,
      missingMonths: []
    };
  }

  function renderS1aTable() {
    if (!s1aTbody) return;
    const activeMonths = getFilteredMonthKeys(availableMonths);
    const grouping = s1aSelectGrouping ? s1aSelectGrouping.value : "monthly";

    if (s1aDispPeriod) {
      s1aDispPeriod.textContent = formatS1aPeriodText(activeMonths);
    }

    if (s1aDispSigDate) {
      const now = new Date(Date.now() + 7 * 3600000);
      const d = String(now.getUTCDate()).padStart(2, "0");
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const y = now.getUTCFullYear();
      s1aDispSigDate.textContent = `Ngày ${d} tháng ${m} năm ${y}`;
    }

    updateS1aProfileDisplay();

    const data = extractS1aData(rawBillingList, activeMonths, grouping);

    if (data.error) {
      if (s1aWarningBanner && s1aWarningText) {
        s1aWarningText.textContent = data.error;
        s1aWarningBanner.style.display = "flex";
      }
      if (s1aSheetWrapper) s1aSheetWrapper.style.display = "none";
      if (s1aSheet) s1aSheet.style.display = "none";
      if (typeof document !== "undefined" && document.body?.classList) {
        document.body.classList.add("s1a-has-error");
      }
      s1aTbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: #c0392b; padding: 24px;">${escapeHtml(data.error)}</td></tr>`;
      if (s1aDispTotal) s1aDispTotal.textContent = "-";
      if (s1aPrintBtn) s1aPrintBtn.disabled = true;
      return;
    }

    if (s1aWarningBanner) {
      s1aWarningBanner.style.display = "none";
    }
    if (s1aSheetWrapper) s1aSheetWrapper.style.display = "";
    if (s1aSheet) s1aSheet.style.display = "block";
    if (typeof document !== "undefined" && document.body?.classList) {
      document.body.classList.remove("s1a-has-error");
    }
    if (s1aPrintBtn) {
      s1aPrintBtn.disabled = false;
    }

    let rowsHtml = "";
    for (const r of data.rows) {
      rowsHtml += `
        <tr>
          <td class="col-s1a-date">${escapeHtml(r.date)}</td>
          <td class="col-s1a-desc">${escapeHtml(r.desc)}</td>
          <td class="col-s1a-amt">${formatVnd(r.amount)}</td>
        </tr>
      `;
    }

    // Pad at least 5 rows for authentic paper form layout
    const minRows = 5;
    if (data.rows.length < minRows) {
      for (let i = data.rows.length; i < minRows; i++) {
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
      s1aDispTotal.textContent = formatVnd(data.grandTotal);
    }
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

      for (let d = 1; d <= daysCount; d++) {
        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        const dStr = String(d).padStart(2, "0");
        const dateFormatted = `${dStr}/${monStr}/${y}`;
        rows.push([dateFormatted, "Doanh thu từ Shopee", amt]);
      }

      rows.push(["", "Tổng Doanh Thu", monthTotal]);
      rows.push(["", "", ""]); // empty spacer
    }

    return rows;
  }

  function downloadCsv() {
    const monthsMap = processData();
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
    link.download = `DoanhThu_Shopee_${activeMonths[0]}_den_${activeMonths[activeMonths.length - 1]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadExcel() {
    const monthsMap = processData();
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
    link.download = `DoanhThu_Shopee_${activeMonths[0]}_den_${activeMonths[activeMonths.length - 1]}.xls`;
    link.click();
    URL.revokeObjectURL(url);
  }

  exportCsvBtn.addEventListener("click", downloadCsv);
  exportExcelBtn.addEventListener("click", downloadExcel);

  // Month range selector handling
  function populateMonthSelects(months) {
    const curFrom = fromMonthSelect.value;
    const curTo = toMonthSelect.value;

    fromMonthSelect.innerHTML = "";
    toMonthSelect.innerHTML = "";

    for (const m of months) {
      const optFrom = document.createElement("option");
      optFrom.value = m;
      optFrom.textContent = m;
      fromMonthSelect.appendChild(optFrom);

      const optTo = document.createElement("option");
      optTo.value = m;
      optTo.textContent = m;
      toMonthSelect.appendChild(optTo);
    }

    if (months.length > 0) {
      // Default to first month of current year or start
      const firstOfYear = months.find(m => m.startsWith("2026-01")) || months[0];
      fromMonthSelect.value = curFrom && months.includes(curFrom) ? curFrom : firstOfYear;
      toMonthSelect.value = curTo && months.includes(curTo) ? curTo : months[months.length - 1];
    }
  }

  function handleFilterChange() {
    const monthsMap = processData();
    const activeMonths = getFilteredMonthKeys(availableMonths);
    renderMonthlyTable(monthsMap, activeMonths);
    renderDailyTables(monthsMap, activeMonths);
    renderS1aTable();
  }

  fromMonthSelect.addEventListener("change", handleFilterChange);
  toMonthSelect.addEventListener("change", handleFilterChange);
  taxModeSelect.addEventListener("change", handleFilterChange);

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

    populateMonthSelects(availableMonths);
    const activeMonths = getFilteredMonthKeys(availableMonths);
    renderMonthlyTable(monthsMap, activeMonths);
    renderDailyTables(monthsMap, activeMonths);
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
  }
})();
