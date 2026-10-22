/**
 * tax_report.js - Sổ tay thuế & Báo cáo doanh thu Shopee Affiliate
 */

(function () {
  "use strict";

  const STORAGE_KEY = "shopee_affiliate_billing_cache_v2";
  const STORAGE_KEY_V1 = "shopee_affiliate_billing_cache_v1";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const SERVICE_FEE_RATE = 0.0098; // 0.98%

  let rawBillingList = [];
  let availableMonths = [];

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

  // Utilities
  function formatVnd(num) {
    if (typeof num !== "number" || isNaN(num)) return "0";
    return new Intl.NumberFormat("vi-VN").format(Math.round(num));
  }

  function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function parseEpochToGmt7(sec) {
    // GMT+7 date
    const d = new Date(sec * 1000);
    const utc = d.getTime() + d.getTimezoneOffset() * 60000;
    return new Date(utc + 7 * 3600000);
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

  // Modal events
  pasteModalBtn.addEventListener("click", () => pasteModal.classList.add("open"));
  closeModalBtn.addEventListener("click", () => pasteModal.classList.remove("open"));
  parsePasteBtn.addEventListener("click", () => {
    const text = pasteTextarea.value.trim();
    if (!text) return;
    try {
      let parsed = JSON.parse(text);
      if (parsed.data?.list && Array.isArray(parsed.data.list)) {
        rawBillingList = parsed.data.list;
      } else if (Array.isArray(parsed)) {
        rawBillingList = parsed;
      } else if (parsed.list && Array.isArray(parsed.list)) {
        rawBillingList = parsed.list;
      } else {
        alert("Không nhận diện được cấu trúc danh sách billing!");
        return;
      }
      saveCache(rawBillingList);
      pasteModal.classList.remove("open");
      pasteTextarea.value = "";
      initDataAndRender();
      showStatus("Đã tải dữ liệu dán thủ công thành công!", "success");
    } catch (e) {
      alert("Lỗi cú pháp JSON: " + e.message);
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
            resolve(res[STORAGE_KEY]);
          } else if (res?.[STORAGE_KEY_V1]) {
            resolve({ updatedAt: Date.now(), list: res[STORAGE_KEY_V1] });
          } else {
            resolve(null);
          }
        });
      } else {
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          resolve(JSON.parse(local));
        } else {
          const v1 = localStorage.getItem(STORAGE_KEY_V1);
          resolve(v1 ? { updatedAt: Date.now(), list: JSON.parse(v1) } : null);
        }
      }
    });
  }

  async function saveCache(list) {
    const payload = {
      updatedAt: Date.now(),
      list: list
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
        showStatus(`Dữ liệu nạp từ Cache (${rawBillingList.length} bản ghi). Lưu lúc ${updatedDate.toLocaleTimeString("vi-VN")} - Hết hạn sau ~${remainingHours}h.`, "success", "Không cần gọi API.");
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
        // Look for any shopee.vn tab
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
        func: async (startTime, endTime) => {
          try {
            const url = `/api/v3/payment/billing_list?order_completed_start_time=${startTime}&order_completed_end_time=${endTime}`;
            const res = await fetch(url, { headers: { "Accept": "application/json" } });
            const data = await res.json();
            return data;
          } catch (err) {
            return { error: err.message };
          }
        },
        args: [s, e]
      });

      const response = results?.[0]?.result;
      if (!response) {
        showStatus("Không nhận được phản hồi từ trang Shopee Affiliate.", "error");
        return;
      }

      if (response.error) {
        showStatus("Lỗi gọi API: " + response.error, "error");
        return;
      }

      if (response.code === 0 && Array.isArray(response.data?.list)) {
        rawBillingList = response.data.list;
        await saveCache(rawBillingList);
        initDataAndRender();
        const now = new Date();
        showStatus(`Đã làm mới thành công ${rawBillingList.length} bản ghi và lưu Cache (24h).`, "success", `Cập nhật lúc ${now.toLocaleTimeString("vi-VN")}`);
      } else {
        showStatus("Shopee trả về lỗi hoặc chưa đăng nhập: " + (response.msg || JSON.stringify(response)), "error");
      }
    } catch (err) {
      showStatus("Lỗi kết nối extension: " + err.message, "error");
    }
  }

  fetchLiveBtn.addEventListener("click", () => fetchLiveFromTab(true));
  clearCacheBtn.addEventListener("click", clearCacheData);

  // Data processing
  function processData() {
    // Structure: { [monthKey: "2026-01"]: { days: { [day: 1]: amt }, summary: { ... } } }
    const monthsMap = {};

    for (const it of rawBillingList) {
      const s = it.order_completed_period_start_time;
      if (!s) continue;
      const dt = parseEpochToGmt7(s);
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const dayNum = dt.getDate();

      // Tiền sàn trả chưa trừ phí
      const grossAmt = parseFloat(it.eligible_total_amount_dis || 0) || 0;
      const mcnAmt = parseFloat(it.mcn_management_fee_dis || 0) || 0;
      const billTotalAmt = parseFloat(it.total_payment_amount_dis || 0) || 0;

      // wht / vat / fee from bills if available
      let whtAmt = parseFloat(it.wht_amount_dis || it.pit_amount_dis || it.wht_amount || it.pit_amount || 0) || 0;
      let vatAmt = parseFloat(it.vat_amount_dis || it.vat_amount || 0) || 0;
      let feeAmt = parseFloat(it.service_fee_dis || it.service_fee || 0) || 0;
      if (Array.isArray(it.bills)) {
        for (const b of it.bills) {
          whtAmt += parseFloat(b.wht_amount_dis || b.pit_amount_dis || b.wht_amount || b.pit_amount || 0) || 0;
          vatAmt += parseFloat(b.vat_amount_dis || b.vat_amount || 0) || 0;
          feeAmt += parseFloat(b.service_fee_dis || b.service_fee || 0) || 0;
        }
      }

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = {
          year: dt.getFullYear(),
          month: dt.getMonth() + 1,
          days: {},
          gross: 0,
          mcn: 0,
          billTotal: 0,
          wht: 0,
          vat: 0,
          fee: 0,
          withWhtCount: 0,
          withVatCount: 0,
          totalRecords: 0
        };
      }

      const mObj = monthsMap[mKey];
      mObj.days[dayNum] = (mObj.days[dayNum] || 0) + grossAmt;
      mObj.gross += grossAmt;
      mObj.mcn += mcnAmt;
      mObj.billTotal += billTotalAmt;
      mObj.wht += whtAmt;
      mObj.vat += vatAmt;
      mObj.fee += feeAmt;
      if (it.with_wht) mObj.withWhtCount++;
      if (it.with_vat) mObj.withVatCount++;
      mObj.totalRecords++;
    }

    return monthsMap;
  }

  function getFilteredMonthKeys(allMonths) {
    const fromVal = fromMonthSelect.value;
    const toVal = toMonthSelect.value;
    return allMonths.filter(m => (!fromVal || m >= fromVal) && (!toVal || m <= toVal));
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

      if (isOctober2026Onwards) {
        // Giai đoạn từ 10/2026: Tách 5% VAT và 5% PIT, 10% vãng lai = 0, Phí DV 0.98% = 0
        feeDv = (data && data.fee > 0) ? data.fee : 0;
        vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
        tncnKd5 = (data && data.wht > 0) ? data.wht : Math.round(afterMcn * 0.05);
        wht10 = 0;
        billReal = afterMcn - feeDv;
        netTk = (data && data.billTotal > 0) ? data.billTotal : (billReal - vat5 - tncnKd5);
      } else {
        // Giai đoạn trước 10/2026:
        if (taxMode === "hkd") {
          vat5 = (data && data.vat > 0) ? data.vat : Math.round(afterMcn * 0.05);
          tncnKd5 = (data && data.wht > 0) ? data.wht : Math.round(afterMcn * 0.05);
          wht10 = 0;
          feeDv = (data && data.fee > 0) ? data.fee : 0;
          billReal = afterMcn - feeDv;
          netTk = (data && data.billTotal > 0) ? data.billTotal : (billReal - vat5 - tncnKd5);
        } else if (taxMode === "individual") {
          wht10 = (data && data.wht > 0) ? data.wht : 0;
          vat5 = 0;
          tncnKd5 = 0;
          feeDv = (data && data.fee > 0) ? data.fee : 0;
          billReal = (data && data.billTotal > 0) ? data.billTotal : (afterMcn - feeDv);
          netTk = (data && data.billTotal > 0) ? data.billTotal : (billReal - wht10);
        } else {
          // "actual": Lấy chính xác dữ liệu thực tế từ API Shopee trả về
          // Chỉ hiển thị thuế TNCN khi trên bill thực tế có trừ (data.wht > 0)
          // Nếu thu nhập dưới ngưỡng khấu trừ (data.wht === 0) thì thuế TNCN bằng 0 đ!
          wht10 = (data && data.wht > 0) ? data.wht : 0;
          vat5 = (data && data.vat > 0) ? data.vat : 0;
          tncnKd5 = 0;
          feeDv = (data && data.fee > 0) ? data.fee : 0;
          billReal = (data && data.billTotal > 0) ? data.billTotal : (afterMcn - feeDv);
          netTk = (data && data.billTotal > 0) ? data.billTotal : (billReal - wht10 - vat5);
        }
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

      tbodyHtml += `
        <tr>
          <td>${mKey}</td>
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
          <td style="text-align: left;">Doanh thu từ Shopee</td>
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
      monthlyTitle.textContent = `Theo tháng ${activeMonths[0]} đến ${activeMonths[activeMonths.length - 1]} (theo ngày đơn hoàn thành, GMT+7)`;
    }
  }

  function renderDailyTables(monthsMap, activeMonths) {
    if (activeMonths.length === 0) {
      dailyContainer.innerHTML = `<p style="padding: 20px; color: var(--muted); text-align: center;">Chưa có dữ liệu theo ngày.</p>`;
      return;
    }

    let html = "";
    for (const mKey of activeMonths) {
      const [yStr, mStr] = mKey.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const daysCount = getDaysInMonth(y, m);
      const mData = monthsMap[mKey];
      const dailyMap = mData ? mData.days : {};

      let rowsHtml = "";
      let monthTotal = 0;

      for (let d = 1; d <= daysCount; d++) {
        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        rowsHtml += `
          <tr>
            <td class="col-date">${d}</td>
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
                <th style="width: 100px;">Ngày tháng</th>
                <th>Diễn giải</th>
                <th style="width: 130px;">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr class="month-header">
                <td colspan="3">Tháng ${m} (${mKey})</td>
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

  function buildExportRows(monthsMap, activeMonths) {
    // Array of rows: [ [col1, col2, col3], ... ]
    const rows = [];
    rows.push(["Ngày tháng", "Diễn giải", "Số tiền"]);

    for (const mKey of activeMonths) {
      const [yStr, mStr] = mKey.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const daysCount = getDaysInMonth(y, m);
      const mData = monthsMap[mKey];
      const dailyMap = mData ? mData.days : {};

      rows.push([`Tháng ${m}`, "", ""]);
      let monthTotal = 0;

      for (let d = 1; d <= daysCount; d++) {
        const amt = Math.round(dailyMap[d] || 0);
        monthTotal += amt;
        rows.push([d, "Doanh thu từ Shopee", amt]);
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
        xml += `   <Row>\n    <Cell ss:StyleID="CellDate"><Data ss:Type="String"></Data></Cell>\n    <Cell ss:StyleID="TotalLabel"><Data ss:Type="String">${c2}</Data></Cell>\n    <Cell ss:StyleID="TotalAmount"><Data ss:Type="Number">${c3}</Data></Cell>\n   </Row>\n`;
      } else if (c1 === "" && c2 === "") {
        xml += `   <Row></Row>\n`;
      } else {
        xml += `   <Row>\n    <Cell ss:StyleID="CellDate"><Data ss:Type="Number">${c1}</Data></Cell>\n    <Cell ss:StyleID="CellDesc"><Data ss:Type="String">${c2}</Data></Cell>\n    <Cell ss:StyleID="CellAmount"><Data ss:Type="Number">${c3}</Data></Cell>\n   </Row>\n`;
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
  }

  // Load from cache or trigger live check
  (async function main() {
    const cached = await loadCache();
    const isFresh = cached && cached.updatedAt && (Date.now() - cached.updatedAt < CACHE_TTL_MS) && Array.isArray(cached.list) && cached.list.length > 0;

    if (isFresh) {
      // Dữ liệu còn hạn trong Cache -> Ưu tiên dùng ngay, KHÔNG gọi API
      rawBillingList = cached.list;
      initDataAndRender();
      const updatedDate = new Date(cached.updatedAt);
      const remainingHours = Math.max(0, Math.round((CACHE_TTL_MS - (Date.now() - cached.updatedAt)) / 3600000));
      showStatus(
        `Dữ liệu nạp từ Cache (${rawBillingList.length} bản ghi). Lưu lúc ${updatedDate.toLocaleTimeString("vi-VN")} ${updatedDate.toLocaleDateString("vi-VN")}. Hết hạn sau ~${remainingHours}h.`,
        "success",
        "Đã dùng cache (không gọi API). Bấm 'Làm mới từ Shopee' nếu cần tải mới."
      );
    } else if (cached?.list && Array.isArray(cached.list) && cached.list.length > 0) {
      // Cache đã quá hạn 24h -> nạp tạm cache để hiển thị ngay, rồi mới tự động refresh ngầm
      rawBillingList = cached.list;
      initDataAndRender();
      showStatus("Dữ liệu cache đã hết hạn (>24h). Đang kết nối tới Shopee Affiliate để cập nhật...", "normal");
      fetchLiveFromTab(false);
    } else {
      // Chưa có cache -> mới cần gọi API
      initDataAndRender();
      showStatus("Chưa có dữ liệu trong cache. Đang tìm tab Shopee Affiliate để tải lần đầu...");
      fetchLiveFromTab(false);
    }
  })();
})();
