const PURCHASE_URL = "https://shopee.vn/user/purchase/";
const DAY_NAMES = ["Chu nhat", "Thu 2", "Thu 3", "Thu 4", "Thu 5", "Thu 6", "Thu 7"];

const showVoucherButton = document.getElementById("show-voucher");
const showReportButton = document.getElementById("show-report");
const showAffiliateButton = document.getElementById("show-affiliate");
const voucherView = document.getElementById("voucher-view");
const reportView = document.getElementById("report-view");
const affiliateView = document.getElementById("affiliate-view");

const openTaxPageButton = document.getElementById("open-tax-page");
const fetchAffiliateDataButton = document.getElementById("fetch-affiliate-data");
const affiliateStatusEl = document.getElementById("affiliate-status");
const popupFromDate = document.getElementById("popup-from-date");
const popupToDate = document.getElementById("popup-to-date");
const popupFromDateText = document.getElementById("popup-from-date-text");
const popupToDateText = document.getElementById("popup-to-date-text");
const btnPopupFromCalendar = document.getElementById("btn-popup-from-calendar");
const btnPopupToCalendar = document.getElementById("btn-popup-to-calendar");
const popupExportExcel = document.getElementById("popup-export-excel");
const popupExportCsv = document.getElementById("popup-export-csv");
const affiliateTotalGross = document.getElementById("affiliate-total-gross");
const affiliateNetTk = document.getElementById("affiliate-net-tk");
const affiliateTaxTotal = document.getElementById("affiliate-tax-total");

const btnAffSimple = document.getElementById("btn-aff-simple");
const btnAffFull = document.getElementById("btn-aff-full");
const btnAffDaily = document.getElementById("btn-aff-daily");
const affModeSimple = document.getElementById("aff-mode-simple");
const affModeFull = document.getElementById("aff-mode-full");
const affModeDaily = document.getElementById("aff-mode-daily");
const affSimpleTbody = document.getElementById("aff-simple-tbody");
const affSimpleTfoot = document.getElementById("aff-simple-tfoot");
const affFullTbody = document.getElementById("aff-full-tbody");
const affFullTfoot = document.getElementById("aff-full-tfoot");
const affDailyTbody = document.getElementById("aff-daily-tbody");
const affDailyTfoot = document.getElementById("aff-daily-tfoot");

const saveButton = document.getElementById("save-vouchers");
const voucherStatusEl = document.getElementById("voucher-status");

const loadReportButton = document.getElementById("load-report");
const stopReportButton = document.getElementById("stop-report");
const openShopeeButton = document.getElementById("open-shopee");
const reportStatusEl = document.getElementById("report-status");
const scanProgressTextEl = document.getElementById("scan-progress-text");
const scanBackgroundHintEl = document.getElementById("scan-background-hint");
const debugLogEl = document.getElementById("debug-log");

const totalSpentEl = document.getElementById("total-spent");
const spentNoteEl = document.getElementById("spent-note");
const orderCountEl = document.getElementById("order-count");
const itemCountEl = document.getElementById("item-count");
const shopCountEl = document.getElementById("shop-count");
const firstOrderEl = document.getElementById("first-order");
const lastOrderEl = document.getElementById("last-order");
const avgOrderEl = document.getElementById("avg-order");
const avgMonthEl = document.getElementById("avg-month");
const avgOrdersMonthEl = document.getElementById("avg-orders-month");
const totalSavedEl = document.getElementById("total-saved");
const peakMonthEl = document.getElementById("peak-month");
const favDayEl = document.getElementById("fav-day");
const favHourEl = document.getElementById("fav-hour");
const streakEl = document.getElementById("streak");
const velocityEl = document.getElementById("velocity");

const monthlyBody = document.getElementById("monthly-body");
const shopsBody = document.getElementById("shops-body");
const itemsBody = document.getElementById("items-body");
const expensiveBody = document.getElementById("expensive-body");

const reportHeadlineEl = document.getElementById("report-headline");
const reportTabEl = document.getElementById("report-tab");
const reportProgressEl = document.getElementById("report-progress");
const reportUpdatedEl = document.getElementById("report-updated");

let scanPort = null;

function setActiveView(view) {
  voucherView.classList.toggle("active", view === "voucher");
  reportView.classList.toggle("active", view === "report");
  affiliateView.classList.toggle("active", view === "affiliate");
  showVoucherButton.classList.toggle("active", view === "voucher");
  showReportButton.classList.toggle("active", view === "report");
  showAffiliateButton.classList.toggle("active", view === "affiliate");
  if (view === "affiliate") {
    loadAffiliateSummary();
  }
}

function setVoucherStatus(message, type = "") {
  voucherStatusEl.textContent = message;
  voucherStatusEl.className = `status${type ? ` ${type}` : ""}`;
}

function setReportStatus(message, type = "") {
  reportStatusEl.textContent = message;
  reportStatusEl.className = `status${type ? ` ${type}` : ""}`;
}

function setDebugLog(lines) {
  debugLogEl.textContent = Array.isArray(lines) && lines.length ? lines.join("\n") : "Chua co log.";
}

function formatCurrency(number) {
  if (typeof number !== "number" || Number.isNaN(number)) return "--";
  return new Intl.NumberFormat("vi-VN").format(Math.round(number)) + " đ";
}

function formatInteger(number) {
  if (typeof number !== "number" || Number.isNaN(number)) return "--";
  return new Intl.NumberFormat("vi-VN").format(Math.round(number));
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setRows(target, rows, colspan) {
  if (!rows.length) {
    target.innerHTML = `<tr><td colspan="${colspan}">Khong co du lieu</td></tr>`;
    return;
  }
  target.innerHTML = rows.join("");
}

function getHeadline(totalSpent) {
  if (totalSpent <= 10000000) return "Hen qua! Ban chua bi Shopee gay nghien.";
  if (totalSpent <= 50000000) return "Thoi xong! Ban bat dau nghien Shopee roi.";
  if (totalSpent < 80000000) return "Oi gioi oi! Ban la con nghien Shopee chinh hieu.";
  return "Xoa app Shopee thoi! Ban nghien Shopee nang qua roi.";
}

function formatFavoriteHour(hour) {
  if (typeof hour !== "number") return "--";
  const next = (hour + 1) % 24;
  return `${String(hour).padStart(2, "0")}:00 - ${String(next).padStart(2, "0")}:00`;
}

function updateScanningUi(scanning, progress) {
  loadReportButton.style.display = scanning ? "none" : "block";
  stopReportButton.style.display = scanning ? "block" : "none";
  scanBackgroundHintEl.style.display = scanning ? "block" : "none";
  if (scanning && progress) {
    scanProgressTextEl.textContent = `${progress.message || "Dang phan tich..."} Offset ${progress.currentOffset || 0}, ${progress.scannedOrders || 0} don, ${progress.pageCount || 0} page.`;
  } else {
    scanProgressTextEl.textContent = "Chua co tien trinh dang chay.";
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isShopeeTab(tab) {
  return Boolean(tab && tab.url && tab.url.includes("shopee.vn"));
}

async function runVoucherSaver() {
  const tab = await getActiveTab();
  if (!isShopeeTab(tab)) {
    setVoucherStatus("Vui long mo mot trang Shopee truoc khi luu voucher.", "error");
    return;
  }

  saveButton.disabled = true;
  setVoucherStatus("Dang quet trang va tu dong luu cac voucher kha dung...");

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
        function getVoucherElements() {
          const spans = document.getElementsByTagName("span");
          const spanVouchers = Array.from(spans).filter(span => span.textContent.trim() === "Lưu");
          const buttons = document.getElementsByTagName("button");
          const buttonVouchers = Array.from(buttons).filter(button => button.textContent.trim() === "Lưu");
          return [...spanVouchers, ...buttonVouchers];
        }

        window.scrollTo(0, document.body.scrollHeight);
        await sleep(900);

        const vouchers = getVoucherElements();
        if (vouchers.length === 0) {
          return { ok: false, message: "Khong tim thay voucher nao co the luu tren trang hien tai." };
        }

        const delay = 1500;
        for (let index = 0; index < vouchers.length; index += 1) {
          vouchers[index].click();
          await sleep(Math.floor(500 + Math.random() * delay * 2));
        }

        return { ok: true, message: `Da luu ${vouchers.length} voucher thanh cong.` };
      }
    });

    if (!result?.ok) throw new Error(result?.message || "Khong the luu voucher tren trang nay.");
    setVoucherStatus(result.message, "success");
  } catch (error) {
    setVoucherStatus(error.message || "Co loi xay ra khi luu voucher.", "error");
  } finally {
    saveButton.disabled = false;
  }
}

async function openShopee() {
  const tab = await getActiveTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url: PURCHASE_URL });
    window.close();
    return;
  }
  await chrome.tabs.create({ url: PURCHASE_URL });
  window.close();
}

function renderReport(payload) {
  if (!payload?.stats) return;

  const stats = payload.stats;
  totalSpentEl.textContent = formatCurrency(stats.totalSpent);
  spentNoteEl.textContent = `${formatInteger(stats.orderCount)} don, ${formatInteger(stats.totalShops)} shop, cap nhat ${new Date(payload.fetchedAt).toLocaleString("vi-VN")}`;
  orderCountEl.textContent = formatInteger(stats.orderCount);
  itemCountEl.textContent = formatInteger(stats.totalItems);
  shopCountEl.textContent = formatInteger(stats.totalShops);
  firstOrderEl.textContent = stats.firstOrderDate || "--";
  lastOrderEl.textContent = stats.lastOrderDate || "--";
  avgOrderEl.textContent = formatCurrency(stats.avgOrderValue);
  avgMonthEl.textContent = formatCurrency(stats.monthlyAvgSpend);
  avgOrdersMonthEl.textContent = formatInteger(stats.monthlyAvgOrders);
  totalSavedEl.textContent = formatCurrency(stats.totalSaved);
  peakMonthEl.textContent = stats.peakMonth ? `${stats.peakMonth.month.replace("-", "/")} (${formatCurrency(stats.peakMonth.amount)})` : "--";
  favDayEl.textContent = typeof stats.favoriteDayOfWeek === "number" ? DAY_NAMES[stats.favoriteDayOfWeek] : "--";
  favHourEl.textContent = formatFavoriteHour(stats.favoriteHour);
  streakEl.textContent = stats.longestStreak ? `${formatInteger(stats.longestStreak)} thang` : "--";
  velocityEl.textContent = stats.spendingVelocity ? `${formatCurrency(stats.spendingVelocity)}/ngay` : "--";

  reportHeadlineEl.textContent = `Danh gia: ${getHeadline(stats.totalSpent)}`;
  reportProgressEl.textContent = `Tien do: ${formatInteger(payload.orders?.length || 0)} don unique, ${formatInteger(payload.pageCount || 0)} page API, trung ${formatInteger(payload.duplicateCount || 0)}`;
  reportUpdatedEl.textContent = `Cap nhat lan cuoi: ${new Date(payload.fetchedAt).toLocaleString("vi-VN")}`;

  setRows(monthlyBody, stats.monthlySorted.map(([month, amount]) => `<tr><td>${escapeHtml(month)}</td><td>${escapeHtml(formatCurrency(amount))}</td></tr>`), 2);
  setRows(shopsBody, stats.topShops.map(shop => `<tr><td>${escapeHtml(shop.name)}</td><td>${escapeHtml(formatInteger(shop.orders))}</td><td>${escapeHtml(formatCurrency(shop.spend))}</td></tr>`), 3);
  setRows(itemsBody, stats.topItems.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatInteger(item.count))}</td></tr>`), 2);
  setRows(expensiveBody, stats.expensiveItems.map(item => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(formatCurrency(item.price * item.qty))}</td></tr>`), 2);
  setDebugLog(payload.logs);
}

function handleScanResult(result) {
  updateScanningUi(false, null);
  if (result?.ok) {
    renderReport(result);
    setReportStatus("Phan tich hoan tat. Du lieu da duoc cache va se hien lai khi mo popup.", "success");
    return;
  }

  setDebugLog(result?.logs || []);
  setReportStatus(result?.error || "Phan tich that bai.", result?.aborted ? "" : "error");
}

function ensurePortConnected() {
  if (scanPort) return;
  scanPort = chrome.runtime.connect({ name: "scan-progress" });
  scanPort.onMessage.addListener(message => {
    if (message.type === "state") {
      updateScanningUi(Boolean(message.snapshot?.active), message.snapshot?.progress || null);
      if (message.snapshot?.result?.ok) {
        renderReport(message.snapshot.result);
      }
      return;
    }
    if (message.type === "progress") {
      updateScanningUi(true, message.progress);
      setReportStatus("Da ket noi Shopee. Qua trinh phan tich dang tiep tuc chay ngam.");
      reportProgressEl.textContent = `Tien do: ${formatInteger(message.progress?.scannedOrders || 0)} don, ${formatInteger(message.progress?.pageCount || 0)} page`;
      return;
    }
    if (message.type === "result") {
      handleScanResult(message.result);
    }
  });
  scanPort.onDisconnect.addListener(() => {
    scanPort = null;
  });
}

async function loadCachedReport() {
  const response = await chrome.runtime.sendMessage({ type: "getCachedReport" });
  if (response?.cache?.ok) {
    renderReport(response.cache);
    setReportStatus("Dang hien du lieu cache gan nhat. Ban co the phan tich lai bat cu luc nao.");
  }
}

async function syncScanState() {
  const state = await chrome.runtime.sendMessage({ type: "getScanState" });
  updateScanningUi(Boolean(state?.active), state?.progress || null);
  if (state?.result?.ok) {
    renderReport(state.result);
  }
}

async function startBackgroundScan() {
  const tab = await getActiveTab();
  reportTabEl.textContent = `Tab Shopee: ${tab?.title || "khong xac dinh"}${tab?.id ? ` (#${tab.id})` : ""}`;

  if (!tab || !isShopeeTab(tab)) {
    setReportStatus("Can mot tab Shopee dang dang nhap de phan tich don hang.", "error");
    return;
  }

  setReportStatus("Dang yeu cau service worker bat dau phan tich...");
  const response = await chrome.runtime.sendMessage({ type: "startScan", tabId: tab.id });
  if (!response?.started) {
    if (response?.reason === "already_scanning") {
      setReportStatus("Tien trinh da dang chay o cua so khac. Ban co the dong popup nay va mo lai sau.");
      updateScanningUi(true, null);
      return;
    }
    setReportStatus("Khong the bat dau phan tich.", "error");
    return;
  }

  updateScanningUi(true, { message: "Dang bat dau phan tich...", scannedOrders: 0, pageCount: 0, currentOffset: 0 });
  setReportStatus("Da ket noi Shopee. Qua trinh phan tich dang tiep tuc chay ngam.");
}

async function stopBackgroundScan() {
  await chrome.runtime.sendMessage({ type: "abortScan" });
  setReportStatus("Dang dung phan tich...");
}

const AFFILIATE_CACHE_KEY_V2 = "shopee_affiliate_billing_cache_v2";
const AFFILIATE_CACHE_KEY_V1 = "shopee_affiliate_billing_cache_v1";
let cachedAffiliateList = [];

function setAffiliateStatus(msg, type = "") {
  affiliateStatusEl.textContent = msg;
  affiliateStatusEl.className = `status${type ? ` ${type}` : ""}`;
}

function isValidDateStringPopup(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m - 1) && dt.getUTCDate() === d;
}

function getDaysInMonthPopup(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatIsoToDmyPopup(isoStr) {
  if (!isoStr || typeof isoStr !== "string") return "";
  const parts = isoStr.trim().split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function parseDmyToIsoPopup(str) {
  if (!str || typeof str !== "string") return "";
  const s = str.trim();
  if (!s) return "";
  const match = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const d = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const y = parseInt(match[3], 10);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const daysInM = getDaysInMonthPopup(y, m);
  if (d > daysInM) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatMonthLabelPopup(mKey) {
  if (!mKey || typeof mKey !== "string") return "";
  const parts = mKey.trim().split("-");
  if (parts.length < 2) return mKey;
  return `${parts[1]}/${parts[0]}`;
}

function syncIsoToTextPopup(canonicalEl, textEl) {
  if (!canonicalEl || !textEl) return;
  const val = canonicalEl.value;
  if (val && isValidDateStringPopup(val)) {
    textEl.value = formatIsoToDmyPopup(val);
    delete canonicalEl.dataset.hasParseError;
  } else if (!val && !canonicalEl.dataset.hasParseError) {
    textEl.value = "";
  }
}

function setupDateInputPairPopup(canonicalEl, textEl, btnEl) {
  if (!canonicalEl) return;
  if (btnEl) {
    btnEl.addEventListener("click", () => {
      if (typeof canonicalEl.showPicker === "function") {
        try {
          canonicalEl.showPicker();
          return;
        } catch (e) {}
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
        if (canonicalEl.value !== "") {
          canonicalEl.value = "";
          updateAffiliateSummaryMetrics();
        }
        return;
      }
      if (raw.length < 10) {
        canonicalEl.dataset.hasParseError = "true";
        return;
      }
      const iso = parseDmyToIsoPopup(raw);
      if (iso) {
        delete canonicalEl.dataset.hasParseError;
        canonicalEl.value = iso;
        updateAffiliateSummaryMetrics();
      } else {
        canonicalEl.dataset.hasParseError = "true";
        canonicalEl.value = "";
        updateAffiliateSummaryMetrics();
      }
    };
    const handleCommit = () => {
      const raw = textEl.value.trim();
      if (!raw) {
        delete canonicalEl.dataset.hasParseError;
        if (canonicalEl.value !== "") {
          canonicalEl.value = "";
          updateAffiliateSummaryMetrics();
        }
        return;
      }
      const iso = parseDmyToIsoPopup(raw);
      if (iso) {
        delete canonicalEl.dataset.hasParseError;
        textEl.value = formatIsoToDmyPopup(iso);
        canonicalEl.value = iso;
        updateAffiliateSummaryMetrics();
      } else {
        canonicalEl.dataset.hasParseError = "true";
        canonicalEl.value = "";
        updateAffiliateSummaryMetrics();
      }
    };
    textEl.addEventListener("input", handleInput);
    textEl.addEventListener("change", handleCommit);
    textEl.addEventListener("blur", handleCommit);
  }
  canonicalEl.addEventListener("change", () => {
    syncIsoToTextPopup(canonicalEl, textEl);
  });
}

function getInvoiceServiceMonthPopup(it) {
  if (it.monthKey && /^\d{4}-\d{2}$/.test(it.monthKey)) {
    return it.monthKey;
  }
  let s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
  let e = parseInt(it.paymentCompletePeriodEndTime || 0, 10);
  if (!s && it.paymentSummaryBillFeeInvoices && it.paymentSummaryBillFeeInvoices.length > 0) {
    const first = it.paymentSummaryBillFeeInvoices[0];
    s = parseInt(first.paymentCompletePeriodStartTime || 0, 10);
    e = parseInt(first.paymentCompletePeriodEndTime || 0, 10);
  }
  if (s > 0 && s < 1e11) {
    const dtStart = new Date(s * 1000 + 7 * 3600000);
    const yStart = dtStart.getUTCFullYear();
    const mStart = dtStart.getUTCMonth() + 1;
    return `${yStart}-${String(mStart).padStart(2, "0")}`;
  }
  return null;
}

// Amounts từ Shopee trả về dạng micro-unit (x100.000), ví dụ "7179000000" = 71.790 đ
// decompose luôn nhận micro-unit (API thật / text dán / cache cũ đều x100.000 trước khi nhập)
function affiliateDecScale(val) {
  if (val === undefined || val === null || String(val).trim() === "") return 0;
  const num = Number(String(val).trim());
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num / 100000);
}

function readMoneyAmountPopup(disVal, rawVal) {
  if (disVal !== undefined && disVal !== null) {
    if (typeof disVal === "number") {
      return Number.isFinite(disVal) && disVal >= 0 ? disVal : 0;
    }
    const str = String(disVal).trim();
    if (str !== "") {
      if (/^\d+$/.test(str)) return Number(str);
      if (/^\d{1,3}(?:\.\d{3})+$/.test(str)) return Number(str.replace(/\./g, ""));
      const n = Number(str.replace(/,/g, "."));
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== "") {
    return affiliateDecScale(rawVal);
  }
  return 0;
}

const AFFILIATE_SERVICE_FEE_RATE = 0.0098; // 0.98%

// Phân rã 1 kỳ thanh toán (bill) theo chuẩn đối soát 10/2026:
// Gross - Phí DV 0,98% = Doanh thu hợp lệ; Doanh thu hợp lệ - 5% VAT - 5% PIT = Thực nhận.
// API thật chỉ trả eligibleTotalAmount + totalPaymentAmount nên suy luận từ diff:
//   diff ~ 10,98% x Gross -> VAT = PIT = round(5% x Gross), fee = phần còn lại
//   diff ~ 0,98% x Gross  -> fee = diff, VAT = PIT = 0 (kỳ dưới ngưỡng trừ thuế)
function decomposeAffiliatePayout(it, mKey) {
  const p = it.paymentPayout || it;
  const gross = affiliateDecScale(p.eligibleTotalAmount);
  const paid = affiliateDecScale(p.totalPaymentAmount);
  const mcn = affiliateDecScale(it.payoutValidationInfo?.mcnManagementFee || p.mcnManagementFee);
  const feeApi = affiliateDecScale(p.totalServiceFee);
  const vatApi = affiliateDecScale(p.vatTotalAmount);
  const pitApi = affiliateDecScale(p.whtTotalAmount);

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
    fee = Math.round(gross * AFFILIATE_SERVICE_FEE_RATE);
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

async function loadAffiliateSummary() {
  const cached = await new Promise(resolve => {
    if (chrome?.storage?.local) {
      chrome.storage.local.get([AFFILIATE_CACHE_KEY_V2, AFFILIATE_CACHE_KEY_V1], res => {
        if (res?.[AFFILIATE_CACHE_KEY_V2]?.list) {
          resolve(res[AFFILIATE_CACHE_KEY_V2]);
        } else if (res?.[AFFILIATE_CACHE_KEY_V1]) {
          resolve({ updatedAt: Date.now(), list: res[AFFILIATE_CACHE_KEY_V1] });
        } else {
          resolve(null);
        }
      });
    } else {
      const v2 = localStorage.getItem(AFFILIATE_CACHE_KEY_V2);
      if (v2) {
        resolve(JSON.parse(v2));
      } else {
        const v1 = localStorage.getItem(AFFILIATE_CACHE_KEY_V1);
        resolve(v1 ? { updatedAt: Date.now(), list: JSON.parse(v1) } : null);
      }
    }
  });

  const gmt7Now = new Date(Date.now() + 7 * 3600000);
  const curY = gmt7Now.getUTCFullYear();
  const curM = gmt7Now.getUTCMonth() + 1;
  const curMm = String(curM).padStart(2, "0");
  const lastDay = getDaysInMonthPopup(curY, curM);
  const defaultFrom = `${curY}-${curMm}-01`;
  const defaultTo = `${curY}-${curMm}-${String(lastDay).padStart(2, "0")}`;

  if (popupFromDate && (!popupFromDate.value || !isValidDateStringPopup(popupFromDate.value))) {
    popupFromDate.value = defaultFrom;
  }
  if (popupToDate && (!popupToDate.value || !isValidDateStringPopup(popupToDate.value))) {
    popupToDate.value = defaultTo;
  }
  if (popupFromDate && popupFromDateText) syncIsoToTextPopup(popupFromDate, popupFromDateText);
  if (popupToDate && popupToDateText) syncIsoToTextPopup(popupToDate, popupToDateText);

  cachedAffiliateList = Array.isArray(cached?.list)
    ? cached.list.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
    : [];
  if (cachedAffiliateList.length === 0) {
    setAffiliateStatus("Chưa có dữ liệu cache. Hãy bấm 'Đồng bộ dữ liệu' từ tab Affiliate hoặc mở Sổ tay thuế.");
    return;
  }

  updateAffiliateSummaryMetrics();
  const payoutCount = cachedAffiliateList.filter(it => it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime).length;
  const invoiceCount = cachedAffiliateList.filter(it => it.isFeeInvoice || (!it.order_completed_period_start_time && it.totalServiceFee && (it.monthKey || it.paymentSummaryBillFeeInvoices || it.paymentCompletePeriodStartTime))).length;
  const billingCount = cachedAffiliateList.filter(it => !it.isFeeInvoice && !it.paymentPayout && !it.payoutId && !it.payoutCreatedTime && !it.payArrivalTime && it.order_completed_period_start_time).length;

  const countParts = [];
  if (payoutCount > 0) countParts.push(`${payoutCount} Payout`);
  if (billingCount > 0) countParts.push(`${billingCount} ngày hoàn thành`);
  if (invoiceCount > 0) countParts.push(`${invoiceCount} HĐ phí DV`);
  const countLabel = countParts.join(" + ") || `${cachedAffiliateList.length} bản ghi`;

  const dateStr = cached?.updatedAt ? new Date(cached.updatedAt).toLocaleTimeString("vi-VN") : "";
  const hasWarn = Array.isArray(cached?.warnings) && cached.warnings.length > 0;
  const warnText = hasWarn ? ` [Cảnh báo: ${cached.warnings.join("; ")}]` : "";
  setAffiliateStatus(`Dữ liệu nạp từ Cache (${countLabel})${warnText}${dateStr ? ` - Lưu lúc ${dateStr}` : ""}.`, hasWarn ? "normal" : "success");
}

function enumerateCalendarMonthsPopup(startM, endM) {
  if (!startM || !endM || startM > endM) return [];
  const res = [];
  const [y1, m1] = startM.split("-").map(Number);
  const [y2, m2] = endM.split("-").map(Number);
  let curY = y1, curM = m1;
  while (curY < y2 || (curY === y2 && curM <= m2)) {
    res.push(`${curY}-${String(curM).padStart(2, "0")}`);
    curM++;
    if (curM > 12) {
      curY++;
      curM = 1;
    }
  }
  return res;
}

function updateAffiliateSummaryMetrics() {
  if (popupFromDate?.dataset.hasParseError || popupToDate?.dataset.hasParseError ||
      popupFromDateText?.classList.contains("is-invalid") || popupToDateText?.classList.contains("is-invalid")) {
    const affDailyReconEl = document.getElementById("aff-daily-reconciliation");
    if (affDailyReconEl) affDailyReconEl.innerHTML = "";
    affSimpleTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:18px;">Ngày nhập vào không hợp lệ (định dạng DD/MM/YYYY)</td></tr>`;
    affSimpleTfoot.innerHTML = "";
    affFullTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px;">Ngày nhập vào không hợp lệ (định dạng DD/MM/YYYY)</td></tr>`;
    affFullTfoot.innerHTML = "";
    affDailyTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:18px;">Ngày nhập vào không hợp lệ (định dạng DD/MM/YYYY)</td></tr>`;
    affDailyTfoot.innerHTML = "";
    affiliateTotalGross.textContent = "--";
    affiliateNetTk.textContent = "--";
    affiliateTaxTotal.textContent = "--";
    return;
  }
  const fromDate = (popupFromDate && isValidDateStringPopup(popupFromDate.value)) ? popupFromDate.value : "";
  const toDate = (popupToDate && isValidDateStringPopup(popupToDate.value)) ? popupToDate.value : "";

  if (fromDate && toDate && fromDate > toDate) {
    const affDailyReconEl = document.getElementById("aff-daily-reconciliation");
    if (affDailyReconEl) affDailyReconEl.innerHTML = "";
    affSimpleTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:18px;">Khoảng ngày lọc không hợp lệ (Từ ngày > Đến ngày)</td></tr>`;
    affSimpleTfoot.innerHTML = "";
    affFullTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px;">Khoảng ngày lọc không hợp lệ (Từ ngày > Đến ngày)</td></tr>`;
    affFullTfoot.innerHTML = "";
    affDailyTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:18px;">Khoảng ngày lọc không hợp lệ (Từ ngày > Đến ngày)</td></tr>`;
    affDailyTfoot.innerHTML = "";
    affiliateTotalGross.textContent = "--";
    affiliateNetTk.textContent = "--";
    affiliateTaxTotal.textContent = "--";
    return;
  }

  let totalGross = 0;
  let totalNet = 0;
  let totalTax = 0;
  let totalMcn = 0;
  let totalAfterMcn = 0;
  let totalFeeDv = 0;
  let totalBill = 0;
  let totalTaxVangLai = 0;
  let totalTaxVat = 0;
  let totalTaxPitKd = 0;

  const monthlyMap = {};
  const dailyMap = {};
  const feeInvoicesMap = {};
  const hasInvoiceFeeMap = {};
  const seenInvoiceKeys = new Set();
  for (const it of cachedAffiliateList) {
    if (it.isFeeInvoice || (it.paymentSummaryBillFeeInvoices && it.totalServiceFee !== undefined) || (it.paymentCompletePeriodStartTime && it.totalServiceFee !== undefined && !it.order_completed_period_start_time)) {
      const m = getInvoiceServiceMonthPopup(it);
      if (!m) continue;
      const invId = it.invoiceNumber || it.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || "";
      const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
      const dedupKey = invId ? `inv_${invId}` : `${s || 0}_${it.totalServiceFee || 0}_${m}`;
      if (seenInvoiceKeys.has(dedupKey)) continue;
      seenInvoiceKeys.add(dedupKey);
      hasInvoiceFeeMap[m] = true;
      feeInvoicesMap[m] = (feeInvoicesMap[m] || 0) + affiliateDecScale(it.totalServiceFee);
    }
  }

  // 0. Xác định các tháng có nguồn Payout gốc và nguồn Billing gốc trong raw cache
  const rawPayoutMonths = new Set();
  const rawBillingMonths = new Set();
  for (const it of cachedAffiliateList) {
    if (!it || typeof it !== "object" || it.isFeeInvoice) continue;
    if (it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime) {
      const p = it.paymentPayout || it;
      let rawTime = p.payoutCreatedTime ?? it.payoutCreatedTime ?? p.payArrivalTime ?? it.payArrivalTime;
      if (rawTime === undefined || rawTime === null || String(rawTime).trim() === "") continue;
      const numTime = Number(String(rawTime).trim());
      if (!Number.isFinite(numTime) || numTime <= 0 || numTime >= 1e11) continue;
      const dt = new Date(numTime * 1000 + 7 * 3600000);
      rawPayoutMonths.add(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`);
    } else {
      const s = it.order_completed_period_start_time;
      if (!s) continue;
      const dt = new Date(s * 1000 + 7 * 3600000);
      rawBillingMonths.add(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`);
    }
  }

  const fromM = fromDate ? fromDate.slice(0, 7) : "";
  const toM = toDate ? toDate.slice(0, 7) : "";
  for (const mKey of rawPayoutMonths) {
    if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = {
          month: mKey,
          gross: 0,
          mcn: 0,
          billTotal: 0,
          wht10: 0,
          pit: 0,
          vat: 0,
          fee: 0,
          netPaid: 0,
          hasPayout: true,
          hasBilling: false,
          billingGross: 0,
          totalRecords: 0
        };
      }
    }
  }

  for (const mKey of rawBillingMonths) {
    if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = {
          month: mKey,
          gross: 0,
          mcn: 0,
          billTotal: 0,
          wht10: 0,
          pit: 0,
          vat: 0,
          fee: 0,
          netPaid: 0,
          hasPayout: rawPayoutMonths.has(mKey),
          hasBilling: true,
          billingGross: 0,
          totalRecords: 0
        };
      } else {
        monthlyMap[mKey].hasBilling = true;
      }
    }
  }

  // Pass 1: Billing List theo ngày hoàn thành đơn (chuẩn hạch toán doanh thu theo ngày và fallback khi thiếu Payout)
  for (const it of cachedAffiliateList) {
    if (it.paymentPayout || it.payoutId || it.payoutCreatedTime || it.payArrivalTime || it.isFeeInvoice) continue;
    const s = it.order_completed_period_start_time;
    if (!s) continue;
    const dt = new Date(s * 1000 + 7 * 3600000);
    const yStr = dt.getUTCFullYear();
    const mStr = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dStr = String(dt.getUTCDate()).padStart(2, "0");
    const dateKey = `${yStr}-${mStr}-${dStr}`;
    const m = `${yStr}-${mStr}`;

    if (fromDate && dateKey < fromDate) continue;
    if (toDate && dateKey > toDate) continue;

    const gross = readMoneyAmountPopup(it.eligible_total_amount_dis, it.eligible_total_amount);
    const mcn = readMoneyAmountPopup(it.mcn_management_fee_dis, it.mcn_management_fee);
    const billTotal = readMoneyAmountPopup(it.total_payment_amount_dis, it.total_payment_amount);
    const whtAmt = readMoneyAmountPopup(it.wht_amount_dis ?? it.pit_amount_dis, it.wht_amount ?? it.pit_amount);
    const vatAmt = readMoneyAmountPopup(it.vat_amount_dis, it.vat_amount);
    let feeAmt = readMoneyAmountPopup(it.service_fee_dis, it.service_fee);
    if (Array.isArray(it.bills)) {
      for (const b of it.bills) {
        feeAmt += readMoneyAmountPopup(b.service_fee_dis, b.service_fee);
      }
    }
    if (feeAmt === 0 && billTotal > 0 && (gross - mcn) > billTotal) {
      feeAmt = Math.round((gross - mcn) - billTotal);
    }

    if (!monthlyMap[m]) {
      monthlyMap[m] = {
        month: m,
        gross: 0,
        mcn: 0,
        billTotal: 0,
        wht10: 0,
        pit: 0,
        vat: 0,
        fee: 0,
        netPaid: 0,
        hasPayout: rawPayoutMonths.has(m),
        hasBilling: false
      };
    }
    monthlyMap[m].hasBilling = true;
    monthlyMap[m].billingGross = (monthlyMap[m].billingGross || 0) + gross;
    // Tháng có nguồn Payout gốc: Payout là nguồn chuẩn duy nhất cho doanh thu gộp và thực nhận
    if (!rawPayoutMonths.has(m)) {
      monthlyMap[m].gross += gross;
      monthlyMap[m].mcn += mcn;
      monthlyMap[m].billTotal += billTotal;
      monthlyMap[m].wht10 += whtAmt;
      monthlyMap[m].pit += whtAmt;
      monthlyMap[m].vat += vatAmt;
      monthlyMap[m].fee += feeAmt;
      monthlyMap[m].netPaid += billTotal;
    }

    const dayStr = `${dStr}/${mStr}/${yStr}`;
    if (!dailyMap[dayStr]) {
      dailyMap[dayStr] = {
        dateStr: dayStr,
        timestamp: s,
        amount: 0
      };
    }
    dailyMap[dayStr].amount += gross;
  }

  // Pass 2: Payout Record theo từng kỳ chi trả thực tế (chuẩn đối soát tài chính cho mọi tháng có Payout)
  const seenPayouts = new Map();
  for (const it of cachedAffiliateList) {
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
    const dt = new Date(s * 1000 + 7 * 3600000);
    const yStr = dt.getUTCFullYear();
    const mStr = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dStr = String(dt.getUTCDate()).padStart(2, "0");
    const dateKey = `${yStr}-${mStr}-${dStr}`;
    const m = `${yStr}-${mStr}`;
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
      seenPayouts.set(payoutId, { amt, s, mKey: m });
    }

    if (!monthlyMap[m] || !monthlyMap[m].hasPayout) {
      const hadBilling = Boolean(monthlyMap[m]?.hasBilling);
      const prevBillingGross = monthlyMap[m]?.billingGross || 0;
      monthlyMap[m] = {
        month: m,
        gross: 0,
        mcn: 0,
        billTotal: 0,
        wht10: 0,
        pit: 0,
        vat: 0,
        fee: 0,
        netPaid: 0,
        hasPayout: true,
        hasBilling: hadBilling,
        billingGross: prevBillingGross
      };
    }

    const d = decomposeAffiliatePayout(it, m);
    monthlyMap[m].gross += d.gross;
    monthlyMap[m].mcn += d.mcn;
    monthlyMap[m].billTotal += d.billTotal;
    monthlyMap[m].wht10 += d.wht10;
    monthlyMap[m].pit += d.pit;
    monthlyMap[m].vat += d.vat;
    monthlyMap[m].fee += d.fee;
    monthlyMap[m].netPaid += d.net;
  }

  // Đảm bảo các tháng chỉ có hóa đơn (không có billing/payout) vẫn xuất hiện nếu thuộc phạm vi lọc
  for (const mKey of Object.keys(feeInvoicesMap)) {
    if ((!fromM || mKey >= fromM) && (!toM || mKey <= toM)) {
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = {
          month: mKey,
          gross: 0,
          mcn: 0,
          billTotal: 0,
          wht10: 0,
          pit: 0,
          vat: 0,
          fee: 0,
          netPaid: 0,
          hasPayout: false,
          hasBilling: false,
          billingGross: 0,
          totalRecords: 0
        };
      }
    }
  }

  // Pass 3: Áp dụng Hóa đơn phí dịch vụ điện tử từ service_fee_invoice
  // Định chế chuẩn: HĐ phí DV có hiệu lực pháp lý cao nhất cho toàn bộ tháng đã chọn
  for (const m of Object.keys(monthlyMap)) {
    const [y, mon] = m.split("-").map(Number);
    const daysInM = getDaysInMonthPopup(y, mon);
    const mStart = `${m}-01`;
    const mEnd = `${m}-${String(daysInM).padStart(2, "0")}`;
    const isFullMonth = (!fromDate || fromDate <= mStart) && (!toDate || toDate >= mEnd);
    monthlyMap[m].isFullMonth = isFullMonth;

    if (hasInvoiceFeeMap[m]) {
      monthlyMap[m].invoiceFee = feeInvoicesMap[m] || 0;
      monthlyMap[m].hasInvoice = true;
      if (isFullMonth) {
        monthlyMap[m].fee = feeInvoicesMap[m] || 0;
      } else {
        monthlyMap[m].fee = null; // Khoảng ngày một phần tháng: chưa đủ cơ sở tính phí
      }
    } else {
      monthlyMap[m].hasInvoice = false;
      monthlyMap[m].fee = null; // Chưa có HĐ
    }
  }

  // Đồng bộ tính toán theo tháng và theo tab đảm bảo khớp chuẩn kế toán
  const sortedMonths = Object.keys(monthlyMap).sort();
  let feeSummaryComplete = true;

  for (const m of sortedMonths) {
    const data = monthlyMap[m];
    const gross = data.gross;
    const mcn = data.mcn;
    const afterMcn = gross - mcn;
    const isOctober2026Onwards = m >= "2026-10";

    const feeDv = data.fee; // number | null
    const afterFee = (feeDv !== null) ? Math.max(0, afterMcn - feeDv) : null;

    let wht10 = 0;
    let vat5 = 0;
    let tncnKd5 = 0;
    let netTk = 0;

    if (data.hasPayout) {
      wht10 = data.wht10;
      vat5 = data.vat;
      tncnKd5 = data.pit;
      netTk = data.netPaid; // Thực nhận Payout giữ nguyên
    } else if (isOctober2026Onwards) {
      vat5 = Math.round(afterMcn * 0.05);
      tncnKd5 = Math.round(afterMcn * 0.05);
      netTk = (afterFee !== null ? afterFee : afterMcn) - vat5 - tncnKd5;
    } else {
      wht10 = Math.round(afterMcn * 0.10);
      netTk = (afterFee !== null ? afterFee : afterMcn) - wht10;
    }

    const taxMonth = wht10 + vat5 + tncnKd5;

    data.afterMcn = afterMcn;
    data.feeDv = feeDv;
    data.afterFee = afterFee;
    data.taxVangLai = wht10;
    data.taxVat = vat5;
    data.taxPitKd = tncnKd5;
    data.netTk = netTk;

    totalGross += gross;
    totalMcn += mcn;
    totalAfterMcn += afterMcn;
    if (feeDv !== null) {
      totalFeeDv += feeDv;
    } else {
      feeSummaryComplete = false;
    }
    if (afterFee !== null) {
      totalBill += afterFee;
    }
    totalTaxVangLai += wht10;
    totalTaxVat += vat5;
    totalTaxPitKd += tncnKd5;
    totalTax += taxMonth;
    totalNet += netTk;
  }

  // Update summary cards
  affiliateTotalGross.textContent = formatCurrency(totalGross);
  affiliateNetTk.textContent = formatCurrency(totalNet);
  affiliateTaxTotal.textContent = formatCurrency(totalTax);

  if (sortedMonths.length === 0) {
    affSimpleTbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:18px;">Chưa có dữ liệu</td></tr>`;
    affSimpleTfoot.innerHTML = "";
    affFullTbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:18px;">Chưa có dữ liệu</td></tr>`;
    affFullTfoot.innerHTML = "";
    affDailyTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:18px;">Chưa có dữ liệu</td></tr>`;
    affDailyTfoot.innerHTML = "";
    return;
  }

  const simpleRows = [];
  const fullRows = [];

  for (const m of sortedMonths) {
    const r = monthlyMap[m];
    const hasPayout = Boolean(r.hasPayout);
    const hasBilling = Boolean(r.hasBilling);
    const sourceLabel = hasPayout ? "(Payout)" : (hasBilling ? "(Fallback Billing)" : "");
    const badge = hasPayout
      ? '<span style="font-size:10px; color:#0984e3; margin-left:3px;">[Payout]</span>'
      : (hasBilling ? '<span style="font-size:10px; color:#d35400; margin-left:3px;">[Billing]</span>' : '');

    let feeHtml = "";
    if (r.feeDv === null) {
      if (!r.isFullMonth) {
        if (r.hasInvoice && r.invoiceFee !== undefined && r.invoiceFee !== null) {
          feeHtml = `<span style="color:#e67e22;" title="Hóa đơn phí dịch vụ tính theo chu kỳ ngày 02 đến ngày 01 tháng sau: ${formatCurrency(r.invoiceFee)}; không áp dụng cho khoảng ngày lẻ">- (${formatCurrency(r.invoiceFee)})</span>`;
        } else {
          feeHtml = '<span style="color:#e67e22;" title="Hóa đơn phí dịch vụ tính theo cả kỳ; không áp dụng cho khoảng ngày lẻ">-</span>';
        }
      } else {
        feeHtml = '<span style="color:var(--muted);" title="Chưa có hóa đơn phí dịch vụ">Chưa có HĐ</span>';
      }
    } else {
      feeHtml = formatCurrency(r.feeDv);
    }

    const afterFeeHtml = (r.afterFee !== null) ? formatCurrency(r.afterFee) : "-";

    const mLabel = formatMonthLabelPopup(m);
    simpleRows.push(`
      <tr>
        <td class="sticky-col" data-month="${m}">${mLabel}</td>
        <td style="text-align:left;">Doanh thu từ Shopee ${sourceLabel}</td>
        <td>${formatCurrency(r.gross)}</td>
        <td style="color:#2ed573; font-weight:600;">${formatCurrency(r.netTk)}</td>
      </tr>
    `);

    fullRows.push(`
      <tr>
        <td class="sticky-col" data-month="${m}">${mLabel}${badge}</td>
        <td>${formatCurrency(r.gross)}</td>
        <td>${formatCurrency(r.mcn)}</td>
        <td>${formatCurrency(r.afterMcn)}</td>
        <td>${feeHtml}</td>
        <td>${afterFeeHtml}</td>
        <td>${formatCurrency(r.taxVangLai)}</td>
        <td>${formatCurrency(r.taxVat)}</td>
        <td>${formatCurrency(r.taxPitKd)}</td>
        <td style="color:#2ed573; font-weight:600;">${formatCurrency(r.netTk)}</td>
      </tr>
    `);
  }

  affSimpleTbody.innerHTML = simpleRows.join("");
  affSimpleTfoot.innerHTML = `
    <tr>
      <td class="sticky-col">Tổng cộng</td>
      <td style="text-align:left;">-</td>
      <td>${formatCurrency(totalGross)}</td>
      <td style="color:#2ed573;">${formatCurrency(totalNet)}</td>
    </tr>
  `;

  const totalFeeDisplay = feeSummaryComplete ? formatCurrency(totalFeeDv) : '<span style="color:var(--muted); font-size:11px;">Chưa đủ HĐ</span>';
  const totalAfterFeeDisplay = feeSummaryComplete ? formatCurrency(totalBill) : "-";

  affFullTbody.innerHTML = fullRows.join("");
  affFullTfoot.innerHTML = `
    <tr>
      <td class="sticky-col">Tổng cộng</td>
      <td>${formatCurrency(totalGross)}</td>
      <td>${formatCurrency(totalMcn)}</td>
      <td>${formatCurrency(totalAfterMcn)}</td>
      <td>${totalFeeDisplay}</td>
      <td>${totalAfterFeeDisplay}</td>
      <td>${formatCurrency(totalTaxVangLai)}</td>
      <td>${formatCurrency(totalTaxVat)}</td>
      <td>${formatCurrency(totalTaxPitKd)}</td>
      <td style="color:#2ed573;">${formatCurrency(totalNet)}</td>
    </tr>
  `;

  // Render Daily Table & Compact Reconciliation
  const dailyList = Object.values(dailyMap).sort((a, b) => a.timestamp - b.timestamp);
  let totalDailyBilling = 0;
  for (const d of dailyList) {
    totalDailyBilling += d.amount;
  }

  const startM = fromDate ? fromDate.slice(0, 7) : (sortedMonths[0] || "");
  const endM = toDate ? toDate.slice(0, 7) : (sortedMonths[sortedMonths.length - 1] || "");
  const selectedCalendarMonths = (startM && endM) ? enumerateCalendarMonthsPopup(startM, endM) : sortedMonths;
  let allBillingComplete = true;
  let allPayoutComplete = true;
  let totalBillingInSelected = 0;
  let totalPayoutInSelected = 0;
  const missingBillingMonths = [];
  const missingPayoutMonths = [];

  for (const m of selectedCalendarMonths) {
    const data = monthlyMap[m];
    if (data && data.hasBilling) {
      totalBillingInSelected += (data.billingGross || 0);
    } else {
      allBillingComplete = false;
      missingBillingMonths.push(m);
    }

    if (data && data.hasPayout) {
      totalPayoutInSelected += (data.gross || 0);
    } else {
      allPayoutComplete = false;
      missingPayoutMonths.push(m);
    }
  }

  const affDailyReconEl = document.getElementById("aff-daily-reconciliation");
  if (affDailyReconEl) {
    if (selectedCalendarMonths.length === 0) {
      affDailyReconEl.innerHTML = "";
    } else {
      const billingLabel = allBillingComplete
        ? `${formatCurrency(totalBillingInSelected)}`
        : `Chưa đầy đủ (thiếu ${missingBillingMonths.map(formatMonthLabelPopup).join(', ')})`;
      const payoutLabel = allPayoutComplete
        ? `${formatCurrency(totalPayoutInSelected)}`
        : `Chưa đầy đủ (thiếu ${missingPayoutMonths.map(formatMonthLabelPopup).join(', ')})`;

      let reconDiffHtml = "";
      if (allBillingComplete && allPayoutComplete) {
        const diff = totalPayoutInSelected - totalBillingInSelected;
        const sign = diff > 0 ? `+${formatCurrency(diff)}` : (diff < 0 ? `-${formatCurrency(Math.abs(diff))}` : "0 đ");
        reconDiffHtml = `Chênh lệch (Kỳ chi trả - Hoàn thành đơn): <strong style="color:${diff !== 0 ? '#d63031' : 'inherit'};">${sign}</strong>`;
      } else {
        reconDiffHtml = `Chênh lệch đối soát: <span style="color:var(--muted, #636e72);">Chưa đủ dữ liệu cả hai nguồn</span>`;
      }

      affDailyReconEl.innerHTML = `
        <div style="font-weight:600; margin-bottom:2px;">Nguồn bảng kê ngày: Ngày hoàn thành đơn (Billing)</div>
        <div>Billing hoàn thành: <strong>${billingLabel}</strong> | Payout gộp: <strong>${payoutLabel}</strong> | ${reconDiffHtml}</div>
      `;
    }
  }

  if (dailyList.length === 0) {
    affDailyTbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:18px;">Chưa có dữ liệu doanh thu theo ngày hoàn thành đơn</td></tr>`;
    affDailyTfoot.innerHTML = "";
  } else {
    const dailyRows = dailyList.map(d => `
      <tr>
        <td class="sticky-col">${d.dateStr}</td>
        <td style="text-align:left;">Doanh thu từ Shopee</td>
        <td>${formatCurrency(d.amount)}</td>
      </tr>
    `);
    affDailyTbody.innerHTML = dailyRows.join("");
    affDailyTfoot.innerHTML = `
      <tr>
        <td class="sticky-col">Tổng Doanh Thu</td>
        <td style="text-align:left;">${dailyList.length} ngày</td>
        <td style="color:#ee4d2d; font-weight:800;">${formatCurrency(totalDailyBilling)}</td>
      </tr>
    `;
  }
}

async function fetchAffiliateLive() {
  if (!cachedAffiliateList || cachedAffiliateList.length === 0) {
    const cached = await new Promise(resolve => {
      if (chrome?.storage?.local) {
        chrome.storage.local.get([AFFILIATE_CACHE_KEY_V2, AFFILIATE_CACHE_KEY_V1], res => {
          resolve(res?.[AFFILIATE_CACHE_KEY_V2]?.list || res?.[AFFILIATE_CACHE_KEY_V1] || []);
        });
      } else {
        const v2 = localStorage.getItem(AFFILIATE_CACHE_KEY_V2);
        resolve(v2 ? JSON.parse(v2)?.list || [] : []);
      }
    });
    const cleanList = Array.isArray(cached)
      ? cached.filter(x => Boolean(x) && typeof x === "object" && !Array.isArray(x))
      : [];
    if (cleanList.length > 0) {
      cachedAffiliateList = cleanList;
    }
  }

  setAffiliateStatus("Đang tìm tab Shopee Affiliate...");
  const tabs = await chrome.tabs.query({ url: "*://affiliate.shopee.vn/*" });
  if (!tabs || tabs.length === 0) {
    setAffiliateStatus("Chưa mở tab Affiliate. Vui lòng vào affiliate.shopee.vn/payment/payout_record để lấy dữ liệu.", "error");
    chrome.tabs.create({ url: "https://affiliate.shopee.vn/payment/payout_record" });
    return;
  }

  const tabId = tabs[0].id;
  setAffiliateStatus("Đang đồng bộ dữ liệu thanh toán từ Shopee Affiliate...");

  try {
    const currentYear = new Date().getFullYear();
    const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
    const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      // world: "MAIN" - chạy đúng ngữ cảnh trang affiliate như probe đã thành công
      // (fetch nội bộ của portal có thể tự bổ sung header anti-fraud cần thiết)
      world: "MAIN",
      func: async (startTime, endTime) => {
        // Header cơ bản: portal gọi gql thành công với POST KHÔNG cần CSRF-token.
        // Chỉ thêm CSRF-token khi gặp 403/401, tìm token theo cơ chế portal:
        // 1) localStorage ConfigClient, 2) GET /api/v3/config/website,
        // 3) response header csrf-token, 4) cookie csrftoken (phương án cuối).
        const baseHeaders = {
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

        // Anti-bot pacing (theo SHOPEE_ANTIBOT_CRITERIA): nghỉ ngẫu nhiên 0.4-1.2s
        // giữa các trang GraphQL - không request burst, giữ nhịp gần hành vi portal thật.
        const sleepJitter = (minMs, maxMs) =>
          new Promise((resolve) => setTimeout(resolve, minMs + Math.floor(Math.random() * (maxMs - minMs + 1))));

        // 1. GraphQL getPaymentPayoutBillingList - lặp đủ trang theo totalCount.
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
          const PAGE_LIMIT = 20;
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
            let newItems = 0;
            for (const it of pList) {
              const pid = it?.paymentPayout?.payoutId || it?.payoutId;
              const normPid = pid !== undefined && pid !== null && String(pid).trim() !== "" ? String(pid).trim() : null;
              if (!normPid || seenPayoutIds.has(normPid)) continue;
              seenPayoutIds.add(normPid);
              payouts.push(it);
              newItems++;
            }
            const total = parseInt(node.pagination?.totalCount, 10);
            if (!isNaN(total)) payoutTotalCount = total;

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

    const res = results?.[0]?.result;
    const hasValidPayoutsArray = Array.isArray(res?.payouts);
    const payouts = hasValidPayoutsArray ? res.payouts : [];
    const isPayoutSuccess = res?.payoutSuccess === true && hasValidPayoutsArray;
    const payoutIncomplete = res?.payoutIncomplete === true || res?.payoutIncomplete === "true";
    const prevPayouts = (cachedAffiliateList || []).filter(x => x && (x.paymentPayout || x.payoutId || x.payoutCreatedTime || x.payArrivalTime) && !x.isFeeInvoice);
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
      payoutWarning = `Chưa tải đủ kỳ thanh toán Payout Record (${payouts.length}${res?.payoutTotalCount ? '/' + res.payoutTotalCount : ''}: ${res?.gqlIssues || "lỗi kết nối"}). Giữ lại ${retained.length} kỳ cũ không trùng.`;
    } else if (prevPayouts.length > 0) {
      finalPayouts = prevPayouts;
      retainedPayoutsCount = prevPayouts.length;
      payoutWarning = `Không thể làm mới kỳ thanh toán Payout Record (${res?.gqlIssues ? `Payout lỗi: ${res.gqlIssues}` : "thiếu dữ liệu Payout"}). Giữ lại ${prevPayouts.length} kỳ cũ.`;
    } else {
      finalPayouts = [];
      if (!isPayoutSuccess || payoutIncomplete) {
        payoutWarning = res?.gqlIssues ? `Payout lỗi: ${res.gqlIssues}` : "Không lấy được kỳ Payout Record";
      }
    }

    const isBillingSuccess = res?.billingData && res.billingData.code === 0 && Array.isArray(res.billingData.data?.list) && res.billingData.data.list.every(x => Boolean(x) && typeof x === "object" && !Array.isArray(x));
    const newBillingList = isBillingSuccess ? res.billingData.data.list : null;
    const billingErr = !isBillingSuccess
      ? (res?.billingData?.error || res?.billingData?.msg || (res?.billingData ? `Mã lỗi Billing: ${res.billingData.code}` : "Lỗi tải Billing List"))
      : "";

    const prevBilling = (cachedAffiliateList || []).filter(x => !x.paymentPayout && !x.payoutId && !x.payoutCreatedTime && !x.payArrivalTime && !x.isFeeInvoice && x.order_completed_period_start_time);
    let finalBillingList = [];
    let billingWarning = "";

    if (isBillingSuccess) {
      finalBillingList = newBillingList;
    } else {
      finalBillingList = prevBilling;
      billingWarning = `Không thể làm mới doanh thu theo ngày (${billingErr}). Giữ lại ${prevBilling.length} bản ghi cũ.`;
    }

    const newFeeInvoices = res && Array.isArray(res.feeInvoices) ? res.feeInvoices : [];
    const feeIncomplete = !!res?.feeIncomplete;
    const feeIssues = res?.feeIssues || "";

    // 0-guard: Only guard against wipeout when NOT authoritative success for both revenue APIs
    const isBothRevenueAuthoritative = isPayoutSuccess && !payoutIncomplete && isBillingSuccess;
    if (finalPayouts.length === 0 && finalBillingList.length === 0 && !isBothRevenueAuthoritative) {
      const detail = res?.gqlIssues || billingErr || res?.billingData?.msg || "Kiểm tra đăng nhập Shopee Affiliate.";
      setAffiliateStatus("Không tải được dữ liệu: " + detail, "error");
      return;
    }

    // Bảo toàn hóa đơn phí DV đã biết nếu đồng bộ mới bị lỗi/không khả dụng
    const prevInvoices = (cachedAffiliateList || []).filter(x => x.isFeeInvoice);
    let finalFeeInvoices = [];
    if (newFeeInvoices.length > 0) {
      if (feeIncomplete && prevInvoices.length > 0) {
        const getFeeMonthKey = (it) => {
          if (it.monthKey) return it.monthKey;
          const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
          if (s) {
            const dt = new Date(s * 1000 + 7 * 3600000);
            return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
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
      if (res?.feeTotalCount === 0 && !feeIncomplete) {
        finalFeeInvoices = [];
      } else {
        finalFeeInvoices = prevInvoices;
      }
    }

    cachedAffiliateList = [...finalPayouts, ...finalBillingList, ...finalFeeInvoices];
    const cacheWarnings = [];
    if (payoutWarning) cacheWarnings.push(payoutWarning);
    if (billingWarning) cacheWarnings.push(billingWarning);
    if (feeIncomplete && feeIssues) cacheWarnings.push(`HĐ phí DV chưa đầy đủ: ${feeIssues}`);
    if (finalPayouts.length === 0 && (!isPayoutSuccess || payoutIncomplete || res?.gqlIssues)) {
      if (!cacheWarnings.some(w => w.includes("Payout"))) {
        cacheWarnings.push(res?.gqlIssues ? `Payout lỗi: ${res.gqlIssues}` : "Không lấy được kỳ Payout Record");
      }
    }

    if (chrome?.storage?.local) {
      await chrome.storage.local.set({
        [AFFILIATE_CACHE_KEY_V2]: {
          updatedAt: Date.now(),
          list: cachedAffiliateList,
          warnings: cacheWarnings
        }
      });
    }
    await loadAffiliateSummary();

    let feeNote = "";
    if (newFeeInvoices.length > 0 && !feeIncomplete) {
      feeNote = ` + ${newFeeInvoices.length} HĐ phí DV`;
    } else if (newFeeInvoices.length > 0 && feeIncomplete) {
      feeNote = ` + ${newFeeInvoices.length} HĐ phí DV (chưa đầy đủ: ${feeIssues || "lỗi kết nối"})`;
    } else if (prevInvoices.length > 0 && (feeIssues || feeIncomplete)) {
      feeNote = ` + giữ lại ${prevInvoices.length} HĐ phí DV đã lưu (đồng bộ mới không khả dụng: ${feeIssues})`;
    } else if (feeIssues) {
      feeNote = ` (HĐ phí DV lỗi: ${feeIssues})`;
    }

    let billingNote = "";
    if (isBillingSuccess) {
      billingNote = ` + ${finalBillingList.length} bản ghi ngày hoàn thành`;
    } else if (prevBilling.length > 0) {
      billingNote = ` + giữ lại ${prevBilling.length} bản ghi ngày hoàn thành cũ`;
    }

    let mainMsg = "";
    if (isPayoutSuccess && !payoutIncomplete) {
      if (payouts.length > 0) {
        mainMsg = `Đã đồng bộ ${payouts.length} kỳ thanh toán (Payout Record)${billingNote}${feeNote} thành công!`;
      } else {
        mainMsg = `Đã đồng bộ dữ liệu (0 kỳ thanh toán)${billingNote}${feeNote} thành công!`;
      }
    } else if (payouts.length > 0) {
      mainMsg = `Đã đồng bộ ${payouts.length} kỳ thanh toán mới (chưa đầy đủ)${retainedPayoutsCount > 0 ? `, giữ lại ${retainedPayoutsCount} kỳ cũ` : ""}${billingNote}${feeNote}.`;
    } else if (prevPayouts.length > 0) {
      mainMsg = `Đã đồng bộ dữ liệu + giữ lại ${prevPayouts.length} kỳ thanh toán cũ (đồng bộ mới không khả dụng: ${res?.gqlIssues || "thiếu dữ liệu Payout"})${billingNote}${feeNote}.`;
    } else {
      mainMsg = `Đã đồng bộ dữ liệu${billingNote}${feeNote}.`;
    }
    if (billingWarning) {
      mainMsg += ` (${billingWarning})`;
    }
    if (!isPayoutSuccess) {
      const warn = " Cảnh báo: không lấy được kỳ thanh toán từ Payout Record"
        + (res?.gqlIssues ? ` (${res.gqlIssues})` : "")
        + (prevPayouts.length > 0 ? ` - đã giữ lại ${prevPayouts.length} kỳ cũ.` : ". Số liệu tháng mới hiển thị theo ngày hoàn thành đơn.");
      setAffiliateStatus(mainMsg + warn, "error");
    } else if (payoutIncomplete) {
      const warn = ` Cảnh báo: chưa tải đủ kỳ thanh toán từ Payout Record (${payouts.length}${res?.payoutTotalCount ? '/' + res.payoutTotalCount : ''})`
        + (res?.gqlIssues ? ` (${res.gqlIssues})` : "")
        + ".";
      setAffiliateStatus(mainMsg + warn, "error");
    } else {
      const statusType = (!feeIncomplete && isBillingSuccess) ? "success" : "normal";
      setAffiliateStatus(mainMsg, statusType);
    }
  } catch (err) {
    setAffiliateStatus("Lỗi kết nối tab: " + err.message, "error");
  }
}

showVoucherButton.addEventListener("click", () => setActiveView("voucher"));
showReportButton.addEventListener("click", () => setActiveView("report"));
showAffiliateButton.addEventListener("click", () => setActiveView("affiliate"));
saveButton.addEventListener("click", runVoucherSaver);
loadReportButton.addEventListener("click", startBackgroundScan);
stopReportButton.addEventListener("click", stopBackgroundScan);
openShopeeButton.addEventListener("click", openShopee);

openTaxPageButton.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tax_report.html") });
});
fetchAffiliateDataButton.addEventListener("click", fetchAffiliateLive);
setupDateInputPairPopup(popupFromDate, popupFromDateText, btnPopupFromCalendar);
setupDateInputPairPopup(popupToDate, popupToDateText, btnPopupToCalendar);
if (popupFromDate) popupFromDate.addEventListener("change", updateAffiliateSummaryMetrics);
if (popupToDate) popupToDate.addEventListener("change", updateAffiliateSummaryMetrics);

popupExportExcel.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tax_report.html") });
});
popupExportCsv.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("tax_report.html") });
});

function setAffMode(mode) {
  btnAffSimple.classList.toggle("active", mode === "simple");
  btnAffFull.classList.toggle("active", mode === "full");
  btnAffDaily.classList.toggle("active", mode === "daily");
  affModeSimple.style.display = mode === "simple" ? "block" : "none";
  affModeFull.style.display = mode === "full" ? "block" : "none";
  affModeDaily.style.display = mode === "daily" ? "block" : "none";
}

btnAffSimple.addEventListener("click", () => setAffMode("simple"));
btnAffFull.addEventListener("click", () => setAffMode("full"));
btnAffDaily.addEventListener("click", () => setAffMode("daily"));

(async () => {
  ensurePortConnected();
  await loadCachedReport();
  await syncScanState();
  const tab = await getActiveTab();
  if (tab) {
    reportTabEl.textContent = `Tab Shopee: ${tab.title || "khong xac dinh"} (#${tab.id})`;
  }
})();
