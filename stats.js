const loadButton = document.getElementById("load-stats");
const switchTabButton = document.getElementById("switch-tab");

const summaryTotal = document.getElementById("summary-total");
const summaryMessage = document.getElementById("summary-message");
const summaryBadge = document.getElementById("summary-badge");

const spentValue = document.getElementById("spent-value");
const ordersValue = document.getElementById("orders-value");
const itemsValue = document.getElementById("items-value");
const savedValue = document.getElementById("saved-value");

const statusEl = document.getElementById("status");
const metaTab = document.getElementById("meta-tab");
const metaOrders = document.getElementById("meta-orders");
const metaUpdated = document.getElementById("meta-updated");

const assessmentTitle = document.getElementById("assessment-title");
const assessmentBody = document.getElementById("assessment-body");

const PURCHASE_PATH = "https://shopee.vn/user/purchase/";

function formatCurrency(number) {
  if (typeof number !== "number" || Number.isNaN(number)) {
    return "--";
  }

  return new Intl.NumberFormat("vi-VN").format(Math.round(number)) + " đ";
}

function formatInteger(number) {
  if (typeof number !== "number" || Number.isNaN(number)) {
    return "--";
  }

  return new Intl.NumberFormat("vi-VN").format(Math.round(number));
}

function getCert(totalSpent) {
  if (totalSpent <= 10000000) {
    return "Hen qua! Ban chua bi Shopee gay nghien.";
  }
  if (totalSpent <= 50000000) {
    return "Thoi xong! Ban bat dau nghien Shopee roi.";
  }
  if (totalSpent < 80000000) {
    return "Oi gioi oi! Ban la con nghien Shopee chinh hieu.";
  }
  return "Xoa app Shopee thoi! Ban nghien Shopee nang qua roi.";
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function isPurchaseTab(tab) {
  return Boolean(tab && tab.url && tab.url.startsWith(PURCHASE_PATH));
}

async function getShopeeTab(preferredTabId) {
  if (preferredTabId) {
    try {
      const tab = await chrome.tabs.get(preferredTabId);
      if (tab && tab.url && tab.url.includes("shopee.vn")) {
        return tab;
      }
    } catch (error) {
      // Ignore and fall back to discovery.
    }
  }

  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => tab.url && tab.url.includes("shopee.vn")) || null;
}

function getPreferredTabId() {
  const params = new URLSearchParams(window.location.search);
  const tabId = Number(params.get("tabId"));
  return Number.isFinite(tabId) ? tabId : null;
}

async function focusShopeeTab() {
  const tab = await getShopeeTab(getPreferredTabId());
  if (tab) {
    const targetUrl = isPurchaseTab(tab) ? tab.url : PURCHASE_PATH;
    await chrome.tabs.update(tab.id, { active: true, url: targetUrl });
    if (typeof tab.windowId === "number") {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  await chrome.tabs.create({ url: PURCHASE_PATH });
}

async function loadStats() {
  const tab = await getShopeeTab(getPreferredTabId());
  if (!tab) {
    setStatus("Khong tim thay tab Shopee nao. Hay mo trang mua hang va dang nhap truoc.", "error");
    metaTab.textContent = "Tab Shopee: khong tim thay";
    return;
  }

  metaTab.textContent = `Tab Shopee: ${tab.title || "Shopee"} (#${tab.id})`;

  if (!isPurchaseTab(tab)) {
    setStatus("Thong ke chi hoat dong tren link https://shopee.vn/user/purchase/.", "error");
    metaOrders.textContent = "Tien do: dung tab mua hang cua Shopee";
    return;
  }

  loadButton.disabled = true;
  setStatus("Dang auto scroll den khi khong con ban ghi moi, sau do tong hop thong ke...");
  metaOrders.textContent = "Tien do: dang cuon trang mua hang";

  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async () => {
        try {
          const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
          const getHeight = () => Math.max(
            document.body ? document.body.scrollHeight : 0,
            document.documentElement ? document.documentElement.scrollHeight : 0
          );

          let stableCount = 0;
          let previousHeight = -1;
          let scrollRounds = 0;
          const maxScrollRounds = 60;

          while (stableCount < 3 && scrollRounds < maxScrollRounds) {
            window.scrollTo(0, getHeight());
            await sleep(1200);

            const currentHeight = getHeight();
            if (currentHeight === previousHeight) {
              stableCount += 1;
            } else {
              stableCount = 0;
              previousHeight = currentHeight;
            }

            scrollRounds += 1;
          }

          window.scrollTo(0, 0);
          await sleep(400);

          const pageSize = 20;
          let offset = 0;
          let totalOrders = 0;
          let totalSpent = 0;
          let totalItems = 0;
          let totalBeforeDiscount = 0;
          let hasMore = true;
          let pageCount = 0;

          while (hasMore) {
            const response = await fetch(`https://shopee.vn/api/v4/order/get_order_list?list_type=8&offset=${offset}&limit=${pageSize}`, {
              credentials: "include"
            });

            if (!response.ok) {
              throw new Error(`Shopee tra ve ma ${response.status}.`);
            }

            const payload = await response.json();
            const orders = payload && payload.data ? payload.data.details_list : null;
            if (!Array.isArray(orders)) {
              throw new Error("Khong doc duoc du lieu don hang tu Shopee.");
            }

            pageCount += 1;
            totalOrders += orders.length;

            orders.forEach(order => {
              totalSpent += (order.info_card?.final_total || 0) / 100000;

              (order.info_card?.order_list_cards || []).forEach(card => {
                (card.product_info?.item_groups || []).forEach(group => {
                  (group.items || []).forEach(item => {
                    totalItems += item.amount || 0;
                    totalBeforeDiscount += (item.order_price || 0) / 100000;
                  });
                });
              });
            });

            hasMore = orders.length >= pageSize;
            offset += pageSize;
          }

          return {
            ok: true,
            totalOrders,
            totalSpent,
            totalItems,
            totalSaved: totalBeforeDiscount - totalSpent,
            fetchedAt: new Date().toISOString(),
            pageCount,
            scrollRounds
          };
        } catch (error) {
          return {
            ok: false,
            error: error && error.message ? error.message : String(error)
          };
        }
      }
    });

    const result = injectionResults && injectionResults[0] ? injectionResults[0].result : null;

    if (!result) {
      throw new Error("Khong nhan duoc ket qua thong ke tu script da chen.");
    }

    if (!result.ok) {
      throw new Error(result.error || "Tai thong ke that bai.");
    }

    renderStats(result);
  } catch (error) {
    setStatus(error.message || "Tai thong ke that bai.", "error");
    metaOrders.textContent = "Tien do: loi khi tai du lieu";
  } finally {
    loadButton.disabled = false;
  }
}

function renderStats(stats) {
  spentValue.textContent = formatCurrency(stats.totalSpent);
  ordersValue.textContent = formatInteger(stats.totalOrders);
  itemsValue.textContent = formatInteger(stats.totalItems);
  savedValue.textContent = formatCurrency(stats.totalSaved);

  summaryTotal.textContent = formatCurrency(stats.totalSpent);
  summaryMessage.textContent = "Tong chi tieu sau giam gia cua tai khoan dang dang nhap tren trang mua hang Shopee.";
  summaryBadge.textContent = getCert(stats.totalSpent);

  assessmentTitle.textContent = getCert(stats.totalSpent);
  assessmentBody.textContent = `Tai khoan nay da dat ${formatInteger(stats.totalOrders)} don va tiet kiem uoc tinh ${formatCurrency(stats.totalSaved)}.`;

  setStatus("Tai thong ke thanh cong sau khi da cuon het danh sach don hang.");
  metaOrders.textContent = `Tien do: ${formatInteger(stats.totalOrders)} don, ${formatInteger(stats.pageCount)} lan goi API, ${formatInteger(stats.scrollRounds)} lan cuon`;
  metaUpdated.textContent = `Cap nhat lan cuoi: ${new Date(stats.fetchedAt).toLocaleString("vi-VN")}`;
}

loadButton.addEventListener("click", loadStats);
switchTabButton.addEventListener("click", focusShopeeTab);

(async () => {
  const tab = await getShopeeTab(getPreferredTabId());
  if (tab) {
    metaTab.textContent = `Tab Shopee: ${tab.title || "Shopee"} (#${tab.id})`;
    if (!isPurchaseTab(tab)) {
      setStatus("Hay mo dung trang https://shopee.vn/user/purchase/ de bat dau thong ke.");
    }
  } else {
    metaTab.textContent = "Tab Shopee: khong tim thay";
  }
})();
