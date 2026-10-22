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

  // Amounts từ Shopee trả về dạng micro-unit (x100.000), ví dụ "7179000000" = 71.790 đ
  // decomposePayout luôn nhận micro-unit (API thật / text dán / cache cũ đều x100.000 trước khi nhập)
  function decScale(val) {
    const num = parseFloat(val || 0) || 0;
    return Math.abs(num) >= 100000 ? Math.round(num / 100000) : num;
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

  function parsePastedTextOrJson(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      if (parsed.data?.getPaymentSummaryBillFeeInvoiceList?.paymentSummaryBillFeeInvoices) {
        return parsed.data.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices.map(x => ({
          isFeeInvoice: true,
          paymentCompletePeriodStartTime: x.paymentCompletePeriodStartTime,
          paymentCompletePeriodEndTime: x.paymentCompletePeriodEndTime,
          totalServiceFee: x.totalServiceFee,
          invoiceNumber: x.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || x.invoiceNumber || ""
        }));
      } else if (parsed.getPaymentSummaryBillFeeInvoiceList?.paymentSummaryBillFeeInvoices) {
        return parsed.getPaymentSummaryBillFeeInvoiceList.paymentSummaryBillFeeInvoices.map(x => ({
          isFeeInvoice: true,
          paymentCompletePeriodStartTime: x.paymentCompletePeriodStartTime,
          paymentCompletePeriodEndTime: x.paymentCompletePeriodEndTime,
          totalServiceFee: x.totalServiceFee,
          invoiceNumber: x.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || x.invoiceNumber || ""
        }));
      } else if (parsed.data?.getPaymentPayoutBillingList?.payoutList) {
        return parsed.data.getPaymentPayoutBillingList.payoutList;
      } else if (parsed.getPaymentPayoutBillingList?.payoutList) {
        return parsed.getPaymentPayoutBillingList.payoutList;
      } else if (parsed.data?.payoutDetail) {
        return [parsed.data.payoutDetail];
      } else if (parsed.payoutDetail) {
        return [parsed.payoutDetail];
      } else if (parsed.payoutList && Array.isArray(parsed.payoutList)) {
        return parsed.payoutList;
      } else if (parsed.data?.list && Array.isArray(parsed.data.list)) {
        return parsed.data.list;
      } else if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.list && Array.isArray(parsed.list)) {
        return parsed.list;
      }
    }

    // Parse plain text / tab-separated table copied from Shopee / Excel
    const lines = trimmed.split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith("Ngày") || l.startsWith("TỔNG") || l.startsWith("Thời gian")) continue;

      // Nhận diện dòng sao chép từ service_fee_invoice (ví dụ: "Thg 09 2026 ₫4.499 7581980 Hợp lệ")
      const thgMatch = l.match(/(?:Thg|Tháng)\s*(\d{1,2})[/\s]+(\d{4})/i);
      const rangeMatch = !thgMatch ? l.match(/(\d{2}\/(\d{2})\/(\d{4})\s*-\s*\d{2}\/\d{2}\/\d{4})/) : null;
      if (thgMatch || rangeMatch) {
        const mKey = thgMatch ? `${thgMatch[2]}-${thgMatch[1].padStart(2, "0")}` : `${rangeMatch[3]}-${rangeMatch[2]}`;
        const dateText = thgMatch ? thgMatch[0] : rangeMatch[1];
        const rem = l.replace(dateText, "");
        const numRegex = /([\d.,]+)\s*đ?/g;
        let mNum;
        const nums = [];
        while ((mNum = numRegex.exec(rem)) !== null) {
          const raw = mNum[1].replace(/\./g, "").replace(/,/g, ".");
          const val = parseFloat(raw);
          if (!isNaN(val)) nums.push(val);
        }
        let fee = 0, inv = "";
        for (const n of nums) {
          if (n >= 100000 && n <= 99999999 && !inv && n.toString().length >= 6) {
            inv = n.toString();
          } else if (n > 0 && n < 1000000 && !fee) {
            fee = n;
          }
        }
        if (fee > 0) {
          items.push({
            isFeeInvoice: true,
            monthKey: mKey,
            totalServiceFee: (fee * 100000).toString(),
            invoiceNumber: inv
          });
          continue;
        }
      }

      const dateMatch = l.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (!dateMatch) continue;
      const [dateStr, d, m, y] = dateMatch;
      const epoch = Math.floor(new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T12:00:00+07:00`).getTime() / 1000);

      // Bóc tách dateStr trước để tránh năm 4 chữ số (vd: 2026) bị khớp nhầm thành payoutId hoặc số tiền
      let rem = l.replace(dateStr, "");
      const idMatch = rem.match(/(?:\.\.\.|SPV-PO-|SPV-PJ-|\b)(\d{4,18})\b/);
      const pid = idMatch ? idMatch[1] : `payout_${d}_${m}_${y}`;
      if (idMatch) rem = rem.replace(idMatch[0], "");

      const nums = [];
      const numRegex = /([\d.,]+)\s*đ?/g;
      let mNum;
      while ((mNum = numRegex.exec(rem)) !== null) {
        const raw = mNum[1].replace(/\./g, "").replace(/,/g, ".");
        const val = parseFloat(raw);
        if (!isNaN(val)) nums.push(val);
      }

      if (nums.length >= 3) {
        let gross = 0, fee = 0, vat = 0, pit = 0, net = 0;
        if (nums.length >= 6) {
          gross = nums[0];
          fee = nums[1];
          // nums[2] là Doanh thu hợp lệ (valid = gross - fee)
          vat = nums[3];
          pit = nums[4];
          net = nums[5];
        } else if (nums.length === 3) {
          gross = nums[0];
          net = nums[2];
          // Nếu số thứ 2 nhỏ (<10% gross) thì là fee; nếu lớn (>50% gross) thì là doanh thu hợp lệ
          if (nums[1] < gross * 0.1) {
            fee = nums[1];
          } else {
            fee = Math.max(0, Math.round(gross - nums[1]));
          }
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
    }

    if (items.length > 0) return items;
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
      if (parsedItems.length > 0 && parsedItems[0].isFeeInvoice) {
        // Hợp nhất hóa đơn phí dịch vụ vào danh sách hiện tại
        const existing = rawBillingList.filter(x => !x.isFeeInvoice);
        rawBillingList = [...existing, ...parsedItems];
      } else {
        rawBillingList = parsedItems;
      }
      saveCache(rawBillingList);
      pasteModal.classList.remove("open");
      pasteTextarea.value = "";
      initDataAndRender();
      showStatus(`Đã nạp thành công ${parsedItems.length} bản ghi dán thủ công và lưu Cache.`, "success");
    } catch (e) {
      alert("Lỗi phân tích cú pháp: " + e.message);
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
          try {
            const PAGE_LIMIT = 20; // 20 trang x 50 kỳ là dư cho toàn bộ đối soát
            let totalCount = 0;
            for (let pageNum = 1; pageNum <= PAGE_LIMIT; pageNum++) {
              if (gql403Count >= 2) break; // circuit breaker anti-bot
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

              let r = await callGql(false);
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
                break;
              }
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
              if (newItems === 0 && payouts.length >= totalCount) break;
              if (newItems === 0) break;
              if (totalCount > 0 && payouts.length >= totalCount) break;
              if (pList.length === 0) break;
            }
          } catch (err) {
            gqlIssues.push(err.message);
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
            if (gql403Count < 2) {
              const callFeeGql = async (withCsrf) => {
                const headers = Object.assign({}, baseHeaders);
                if (withCsrf && csrfToken) headers["CSRF-token"] = csrfToken;
                const res = await fetch("/api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList", {
                  method: "POST",
                  headers: headers,
                  body: JSON.stringify({
                    operationName: "GetPaymentSummaryBillFeeInvoiceListQuery",
                    query: FEE_INVOICE_QUERY,
                    variables: { pageSize: 50, pageNum: 1, serviceFeeInvoiceFilter: {} }
                  })
                });
                let json = null;
                try { json = await res.json(); } catch (_) {}
                return { status: res.status, json: json };
              };

              let r = await callFeeGql(false);
              let node = r.json?.data?.getPaymentSummaryBillFeeInvoiceList;
              if (!node && (r.status === 403 || r.status === 401) && csrfToken) {
                r = await callFeeGql(true);
                node = r.json?.data?.getPaymentSummaryBillFeeInvoiceList;
              }
              if (Array.isArray(node?.paymentSummaryBillFeeInvoices)) {
                for (const inv of node.paymentSummaryBillFeeInvoices) {
                  feeInvoices.push({
                    isFeeInvoice: true,
                    paymentCompletePeriodStartTime: inv.paymentCompletePeriodStartTime,
                    paymentCompletePeriodEndTime: inv.paymentCompletePeriodEndTime,
                    totalServiceFee: inv.totalServiceFee,
                    invoiceNumber: inv.paymentSummaryBillFeeInvoices?.[0]?.invoiceNumber || ""
                  });
                }
              }
            }
          } catch (_) {}

          return { payouts, billingData, feeInvoices, gqlIssues: gqlIssues.join(" | ") };
        },
        args: [s, e]
      });

      const response = results?.[0]?.result;
      if (!response) {
        showStatus("Không nhận được phản hồi từ trang Shopee Affiliate.", "error");
        return;
      }

      const payouts = Array.isArray(response.payouts) ? response.payouts : [];
      const billingList = response.billingData?.code === 0 && Array.isArray(response.billingData.data?.list)
        ? response.billingData.data.list : [];
      const feeInvoices = Array.isArray(response.feeInvoices) ? response.feeInvoices : [];
      const billingErr = response.billingData && !response.billingData.code && response.billingData.error
        ? response.billingData.error : "";

      if (payouts.length === 0 && billingList.length === 0) {
        const detail = response.gqlIssues || response.billingData?.msg || "Shopee trả về rỗng hoặc chưa đăng nhập.";
        showStatus("Không tải được dữ liệu từ Shopee Affiliate: " + detail, "error");
        return;
      }

      rawBillingList = [...payouts, ...billingList, ...feeInvoices];
      await saveCache(rawBillingList);
      initDataAndRender();
      const now = new Date();
      const meta = `Cập nhật lúc ${now.toLocaleTimeString("vi-VN")}`;
      const feeNote = feeInvoices.length > 0 ? ` + ${feeInvoices.length} HĐ phí DV` : "";
      if (payouts.length > 0 && billingList.length > 0) {
        showStatus(`Đã làm mới thành công ${payouts.length} kỳ thanh toán (Payout Record) + ${billingList.length} bản ghi Billing List${feeNote}. Lưu Cache (24h).`, "success", meta);
      } else if (payouts.length > 0) {
        showStatus(`Đã làm mới thành công ${payouts.length} kỳ thanh toán từ Payout Record${feeNote}. Lưu Cache (24h).`, "success", meta);
      } else {
        showStatus(`Đã tải ${billingList.length} bản ghi Billing List${feeNote}. Lưu Cache (24h).`, "success", meta);
      }

      if (payouts.length === 0) {
        const warn = "Cảnh báo: không lấy được kỳ thanh toán từ Payout Record"
          + (response.gqlIssues ? ` (${response.gqlIssues})` : "")
          + ". Sổ tay đang hiển thị tháng mới nhất theo ngày hoàn thành đơn - hãy đảm bảo tab affiliate.shopee.vn/payment/payout_record đang mở và đăng nhập.";
        showStatus(warn, "error", billingErr ? `Billing List lỗi: ${billingErr}` : "");
      }
    } catch (err) {
      showStatus("Lỗi kết nối extension: " + err.message, "error");
    }
  }

  fetchLiveBtn.addEventListener("click", () => fetchLiveFromTab(true));
  clearCacheBtn.addEventListener("click", clearCacheData);

  // Data processing
  function processData() {
    // Cơ chế phân định nguồn dữ liệu kép (Dual-track Reconciliation):
    //  - Các tháng < 2026-10: chuẩn hạch toán theo Ngày hoàn thành đơn (Billing List) + Hóa đơn phí DV (service_fee_invoice).
    //  - Các tháng >= 2026-10: Shopee khấu trừ thuế 5% VAT + 5% PIT theo từng bill => Payout Record là chuẩn đối soát tuyệt đối.
    const monthsMap = {};
    const feeInvoicesMap = {};

    // 1. Rà soát danh sách Hóa đơn phí dịch vụ điện tử (service_fee_invoice)
    for (const it of rawBillingList) {
      if (it.isFeeInvoice || (it.paymentSummaryBillFeeInvoices && it.totalServiceFee) || (it.paymentCompletePeriodStartTime && it.totalServiceFee && !it.order_completed_period_start_time)) {
        const s = parseInt(it.paymentCompletePeriodStartTime || 0, 10);
        const mKey = it.monthKey || (s ? (() => {
          const dt = parseEpochToGmt7(s);
          return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        })() : null);
        if (mKey) feeInvoicesMap[mKey] = decScale(it.totalServiceFee);
      }
    }

    // Pass 1: Billing List theo ngày hoàn thành đơn
    for (const it of rawBillingList) {
      if (it.paymentPayout || it.payoutId || it.isFeeInvoice) continue;
      const s = it.order_completed_period_start_time;
      if (!s) continue;
      const dt = parseEpochToGmt7(s);
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const dayNum = dt.getDate();

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = createMonthEntry(dt.getFullYear(), dt.getMonth() + 1);
      }
      const mObj = monthsMap[mKey];

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

    // Áp dụng số liệu Hóa đơn phí dịch vụ chính thức nếu có
    for (const mKey of Object.keys(feeInvoicesMap)) {
      if (monthsMap[mKey] && !monthsMap[mKey].hasPayout) {
        monthsMap[mKey].fee = feeInvoicesMap[mKey];
        monthsMap[mKey].billTotal = Math.max(0, monthsMap[mKey].gross - monthsMap[mKey].mcn - monthsMap[mKey].fee);
        monthsMap[mKey].netPaid = monthsMap[mKey].billTotal;
      }
    }

    // Pass 2: Payout Record theo từng kỳ chi trả thực tế
    for (const it of rawBillingList) {
      if (!(it.paymentPayout || it.payoutId || it.payoutCreatedTime)) continue;
      if (it.isFeeInvoice) continue;
      const p = it.paymentPayout || it;
      const s = parseInt(p.payoutCreatedTime || p.payArrivalTime || 0, 10);
      if (!s) continue;
      const dt = parseEpochToGmt7(s);
      const mKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const dayNum = dt.getDate();
      const d = decomposePayout(it, mKey);

      const isOctOnwards = mKey >= "2026-10";

      // Trước 10/2026: giữ nguyên số liệu billing list đã khớp hóa đơn điện tử
      if (!isOctOnwards && monthsMap[mKey] && monthsMap[mKey].totalRecords > 0 && !monthsMap[mKey].hasPayout) {
        continue;
      }

      // Từ 10/2026: Payout Record là chuẩn đối soát tuyệt đối theo luật mới
      if (isOctOnwards && (!monthsMap[mKey] || !monthsMap[mKey].hasPayout)) {
        monthsMap[mKey] = createMonthEntry(dt.getFullYear(), dt.getMonth() + 1);
        monthsMap[mKey].hasPayout = true;
      } else if (!monthsMap[mKey]) {
        monthsMap[mKey] = createMonthEntry(dt.getFullYear(), dt.getMonth() + 1);
        monthsMap[mKey].hasPayout = true;
      }

      const mObj = monthsMap[mKey];
      mObj.days[dayNum] = (mObj.days[dayNum] || 0) + d.gross;
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
      withWhtCount: 0,
      withVatCount: 0,
      totalRecords: 0
    };
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
      monthlyTitle.textContent = `Theo tháng ${activeMonths[0]} đến ${activeMonths[activeMonths.length - 1]} (GMT+7 - theo kỳ chi trả khi có dữ liệu Payout, theo ngày đơn hoàn thành cho tháng còn lại)`;
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
      rawBillingList = cached.list;
      initDataAndRender();
      const payoutCount = rawBillingList.filter(it => it.paymentPayout || it.payoutId || it.payoutCreatedTime).length;
      const billingCount = rawBillingList.length - payoutCount;
      const sourceLabel = payoutCount > 0
        ? `${payoutCount} kỳ thanh toán (Payout Record) + ${billingCount} bản ghi ngày hoàn thành`
        : `${rawBillingList.length} bản ghi (theo ngày hoàn thành đơn)`;
      const updatedDate = new Date(cached.updatedAt);
      const remainingHours = Math.max(0, Math.round((CACHE_TTL_MS - (Date.now() - cached.updatedAt)) / 3600000));
      showStatus(
        `Dữ liệu nạp từ Cache: ${sourceLabel}. Lưu lúc ${updatedDate.toLocaleTimeString("vi-VN")} ${updatedDate.toLocaleDateString("vi-VN")}. Hết hạn sau ~${remainingHours}h.`,
        "success",
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
})();
