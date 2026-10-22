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
const popupFromMonth = document.getElementById("popup-from-month");
const popupToMonth = document.getElementById("popup-to-month");
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

  cachedAffiliateList = Array.isArray(cached?.list) ? cached.list : [];
  if (cachedAffiliateList.length === 0) {
    setAffiliateStatus("Chưa có dữ liệu cache. Hãy bấm 'Đồng bộ dữ liệu' từ tab Affiliate hoặc mở Sổ tay thuế.");
    return;
  }

  // Find all months
  const monthsSet = new Set();
  for (const it of cachedAffiliateList) {
    const s = it.order_completed_period_start_time;
    if (!s) continue;
    const dt = new Date(s * 1000 + 7 * 3600000);
    const m = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    monthsSet.add(m);
  }

  const sortedMonths = Array.from(monthsSet).sort();
  const curFrom = popupFromMonth.value;
  const curTo = popupToMonth.value;

  popupFromMonth.innerHTML = "";
  popupToMonth.innerHTML = "";

  for (const m of sortedMonths) {
    const o1 = document.createElement("option");
    o1.value = m; o1.textContent = m;
    popupFromMonth.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = m; o2.textContent = m;
    popupToMonth.appendChild(o2);
  }

  if (sortedMonths.length > 0) {
    const first2026 = sortedMonths.find(m => m.startsWith("2026-01")) || sortedMonths[0];
    popupFromMonth.value = curFrom && sortedMonths.includes(curFrom) ? curFrom : first2026;
    popupToMonth.value = curTo && sortedMonths.includes(curTo) ? curTo : sortedMonths[sortedMonths.length - 1];
  }

  updateAffiliateSummaryMetrics();
  const dateStr = cached?.updatedAt ? new Date(cached.updatedAt).toLocaleTimeString("vi-VN") : "";
  setAffiliateStatus(`Dữ liệu nạp từ Cache (${cachedAffiliateList.length} bản ghi)${dateStr ? ` - Lưu lúc ${dateStr}` : ""}.`, "success");
}

function updateAffiliateSummaryMetrics() {
  const fromM = popupFromMonth.value;
  const toM = popupToMonth.value;

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
  const dailyList = [];

  for (const it of cachedAffiliateList) {
    const s = it.order_completed_period_start_time;
    if (!s) continue;
    const dt = new Date(s * 1000 + 7 * 3600000);
    const m = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
    if (fromM && m < fromM) continue;
    if (toM && m > toM) continue;

    const gross = parseFloat(it.eligible_total_amount_dis || 0) || 0;
    const mcn = parseFloat(it.mcn_management_fee_dis || 0) || 0;
    const afterMcn = gross - mcn;
    const feeDv = afterMcn * 0.0098;
    const bill = afterMcn - feeDv;

    let tax = 0;
    let taxVangLai = 0;
    let taxVat = 0;
    let taxPitKd = 0;

    if (it.with_vat) {
      taxVat = afterMcn * 0.05;
      taxPitKd = afterMcn * 0.05;
      tax = taxVat + taxPitKd;
    } else {
      taxVangLai = afterMcn * 0.10;
      tax = taxVangLai;
    }

    const netTk = bill - tax;

    if (!monthlyMap[m]) {
      monthlyMap[m] = {
        month: m,
        gross: 0,
        mcn: 0,
        afterMcn: 0,
        feeDv: 0,
        bill: 0,
        taxVangLai: 0,
        taxVat: 0,
        taxPitKd: 0,
        netTk: 0
      };
    }

    monthlyMap[m].gross += gross;
    monthlyMap[m].mcn += mcn;
    monthlyMap[m].afterMcn += afterMcn;
    monthlyMap[m].feeDv += feeDv;
    monthlyMap[m].bill += bill;
    monthlyMap[m].taxVangLai += taxVangLai;
    monthlyMap[m].taxVat += taxVat;
    monthlyMap[m].taxPitKd += taxPitKd;
    monthlyMap[m].netTk += netTk;

    totalGross += gross;
    totalNet += netTk;
    totalTax += tax;
    totalMcn += mcn;
    totalAfterMcn += afterMcn;
    totalFeeDv += feeDv;
    totalBill += bill;
    totalTaxVangLai += taxVangLai;
    totalTaxVat += taxVat;
    totalTaxPitKd += taxPitKd;

    const dayStr = `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
    dailyList.push({
      dateStr: dayStr,
      timestamp: s,
      amount: gross
    });
  }

  // Update summary cards
  affiliateTotalGross.textContent = formatCurrency(totalGross);
  affiliateNetTk.textContent = formatCurrency(totalNet);
  affiliateTaxTotal.textContent = formatCurrency(totalTax);

  // Render Simple Table & Full Table
  const sortedMonths = Object.keys(monthlyMap).sort();
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
    simpleRows.push(`
      <tr>
        <td class="sticky-col">${m}</td>
        <td style="text-align:left;">Doanh thu từ Shopee</td>
        <td>${formatCurrency(r.gross)}</td>
        <td style="color:#2ed573; font-weight:600;">${formatCurrency(r.netTk)}</td>
      </tr>
    `);

    fullRows.push(`
      <tr>
        <td class="sticky-col">${m}</td>
        <td>${formatCurrency(r.gross)}</td>
        <td>${formatCurrency(r.mcn)}</td>
        <td>${formatCurrency(r.afterMcn)}</td>
        <td>${formatCurrency(r.feeDv)}</td>
        <td>${formatCurrency(r.bill)}</td>
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

  affFullTbody.innerHTML = fullRows.join("");
  affFullTfoot.innerHTML = `
    <tr>
      <td class="sticky-col">Tổng cộng</td>
      <td>${formatCurrency(totalGross)}</td>
      <td>${formatCurrency(totalMcn)}</td>
      <td>${formatCurrency(totalAfterMcn)}</td>
      <td>${formatCurrency(totalFeeDv)}</td>
      <td>${formatCurrency(totalBill)}</td>
      <td>${formatCurrency(totalTaxVangLai)}</td>
      <td>${formatCurrency(totalTaxVat)}</td>
      <td>${formatCurrency(totalTaxPitKd)}</td>
      <td style="color:#2ed573;">${formatCurrency(totalNet)}</td>
    </tr>
  `;

  // Render Daily Table
  dailyList.sort((a, b) => a.timestamp - b.timestamp);
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
      <td style="color:#ee4d2d; font-weight:800;">${formatCurrency(totalGross)}</td>
    </tr>
  `;
}

async function fetchAffiliateLive() {
  setAffiliateStatus("Đang tìm tab Shopee Affiliate...");
  const tabs = await chrome.tabs.query({ url: "*://affiliate.shopee.vn/*" });
  if (!tabs || tabs.length === 0) {
    setAffiliateStatus("Không có tab affiliate.shopee.vn đang mở. Đang mở trang Payout Record...", "error");
    chrome.tabs.create({ url: "https://affiliate.shopee.vn/payment/payout_record" });
    return;
  }

  const tabId = tabs[0].id;
  setAffiliateStatus("Đang gọi API billing_list từ Shopee Affiliate...");

  try {
    const currentYear = new Date().getFullYear();
    const s = Math.floor(new Date(`${currentYear}-01-01T00:00:00+07:00`).getTime() / 1000);
    const e = Math.floor(new Date(`${currentYear}-12-31T23:59:59+07:00`).getTime() / 1000);

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (startTime, endTime) => {
        try {
          const res = await fetch(`/api/v3/payment/billing_list?order_completed_start_time=${startTime}&order_completed_end_time=${endTime}`);
          return await res.json();
        } catch (err) {
          return { error: err.message };
        }
      },
      args: [s, e]
    });

    const res = results?.[0]?.result;
    if (res?.code === 0 && Array.isArray(res.data?.list)) {
      cachedAffiliateList = res.data.list;
      if (chrome?.storage?.local) {
        chrome.storage.local.set({
          [AFFILIATE_CACHE_KEY_V2]: {
            updatedAt: Date.now(),
            list: cachedAffiliateList
          }
        });
      }
      loadAffiliateSummary();
      setAffiliateStatus(`Đã đồng bộ ${cachedAffiliateList.length} bản ghi thành công!`, "success");
    } else {
      setAffiliateStatus("Không tải được dữ liệu: " + (res?.msg || res?.error || "Vui lòng kiểm tra đăng nhập Shopee Affiliate."), "error");
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
popupFromMonth.addEventListener("change", updateAffiliateSummaryMetrics);
popupToMonth.addEventListener("change", updateAffiliateSummaryMetrics);

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
