const MONEY_SCALE = 100000;
const PAGE_LIMIT = 20;
const API_DELAY_MS = 900;
const API_DELAY_JITTER_MS = 500;
const LIST_TYPE = 3;
const CACHE_KEY = "shopee_report_cache_v1";

let activeScan = null;
let scanProgress = null;
let scanResult = null;
const progressPorts = new Set();

function notify(message) {
  for (const port of progressPorts) {
    try {
      port.postMessage(message);
    } catch {
      // Ignore disconnected ports.
    }
  }
}

function currentSnapshot() {
  return {
    active: activeScan !== null,
    progress: scanProgress,
    result: scanResult
  };
}

function moneyToVnd(raw) {
  return typeof raw === "number" ? raw / MONEY_SCALE : 0;
}

function formatCurrency(number) {
  return new Intl.NumberFormat("vi-VN").format(Math.round(number)) + " đ";
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function mapItems(infoCard) {
  const cards = infoCard?.order_list_cards ?? [];
  const items = [];

  for (const card of cards) {
    const shopName = card.shop_info?.shop_name || "Unknown";
    const shopId = card.shop_info?.shop_id;
    const groups = card.product_info?.item_groups ?? [];
    for (const group of groups) {
      for (const item of group.items ?? []) {
        items.push({
          name: item.name,
          price: Number(item.order_price ?? item.item_price ?? 0),
          qty: Number(item.amount || 1),
          shopName,
          shopId,
          image: item.image,
          itemId: item.item_id,
          modelName: item.model_name
        });
      }
    }
  }

  return items;
}

function computeStats(orders, locale = "vi-VN") {
  let totalSpent = 0;
  let totalBeforeDiscount = 0;
  let totalItems = 0;
  let firstOrder = null;
  let lastOrder = null;
  const shopCount = {};
  const shopSpend = {};
  const shopIds = {};
  const monthlySpend = {};
  const topItemMap = {};
  const expensiveItems = [];
  let minExpensive = 0;
  const dayCounts = Array(7).fill(0);
  const hourCounts = Array(24).fill(0);

  for (const order of orders) {
    const spent = moneyToVnd(order.finalTotal ?? order.subtotal);
    const beforeDiscount = moneyToVnd(order.subtotal ?? order.finalTotal);
    totalSpent += spent;
    totalBeforeDiscount += beforeDiscount;

    const createTime = Number(order.createTime || 0);
    if (createTime > 0 && Number.isFinite(createTime)) {
      if (!firstOrder || createTime < firstOrder.createTime) firstOrder = order;
      if (!lastOrder || createTime > lastOrder.createTime) lastOrder = order;
      const date = new Date(createTime * 1000);
      monthlySpend[monthKey(date)] = (monthlySpend[monthKey(date)] || 0) + spent;
      dayCounts[date.getDay()] += 1;
      hourCounts[date.getHours()] += 1;
    }

    const orderShopSpend = {};
    let orderItemSubtotal = 0;
    for (const item of order.items) {
      const shop = item.shopName || "Unknown";
      const itemSpend = moneyToVnd(item.price) * item.qty;
      orderShopSpend[shop] = (orderShopSpend[shop] || 0) + itemSpend;
      orderItemSubtotal += itemSpend;
      if (item.shopId && !shopIds[shop]) shopIds[shop] = item.shopId;
    }

    for (const item of order.items) {
      totalItems += item.qty;
      const productName = (item.name || "Unknown").slice(0, 80);
      if (!topItemMap[productName]) {
        topItemMap[productName] = {
          name: productName,
          count: 0,
          image: item.image,
          itemId: item.itemId,
          shopId: item.shopId
        };
      }
      topItemMap[productName].count += item.qty;

      const singlePrice = moneyToVnd(item.price);
      const totalPrice = singlePrice * item.qty;
      if (expensiveItems.length < 10) {
        expensiveItems.push({
          name: item.name,
          price: singlePrice,
          qty: item.qty,
          shop: item.shopName || "Unknown",
          image: item.image,
          itemId: item.itemId,
          shopId: item.shopId
        });
        if (expensiveItems.length === 10) {
          minExpensive = Math.min(...expensiveItems.map(entry => entry.price * entry.qty));
        }
      } else if (totalPrice > minExpensive) {
        let replaceIndex = 0;
        let currentMin = expensiveItems[0].price * expensiveItems[0].qty;
        for (let index = 1; index < 10; index += 1) {
          const candidate = expensiveItems[index].price * expensiveItems[index].qty;
          if (candidate < currentMin) {
            currentMin = candidate;
            replaceIndex = index;
          }
        }
        expensiveItems[replaceIndex] = {
          name: item.name,
          price: singlePrice,
          qty: item.qty,
          shop: item.shopName || "Unknown",
          image: item.image,
          itemId: item.itemId,
          shopId: item.shopId
        };
        minExpensive = Math.min(...expensiveItems.map(entry => entry.price * entry.qty));
      }
    }

    for (const [shop, amount] of Object.entries(orderShopSpend)) {
      shopCount[shop] = (shopCount[shop] || 0) + 1;
      const weightedSpend = orderItemSubtotal > 0 ? (amount / orderItemSubtotal) * spent : 0;
      shopSpend[shop] = (shopSpend[shop] || 0) + weightedSpend;
    }
  }

  const topShops = Object.entries(shopCount)
    .sort((left, right) => (shopSpend[right[0]] || 0) - (shopSpend[left[0]] || 0))
    .slice(0, 15)
    .map(([name, ordersCount]) => ({ name, shopId: shopIds[name], orders: ordersCount, spend: shopSpend[name] || 0 }));

  const topItems = Object.values(topItemMap)
    .sort((left, right) => right.count - left.count)
    .slice(0, 10);

  expensiveItems.sort((left, right) => right.price * right.qty - left.price * left.qty);

  const monthlySorted = Object.entries(monthlySpend).sort((left, right) => left[0].localeCompare(right[0]));
  const monthCount = monthlySorted.length;
  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
  const monthlyAvgSpend = monthCount > 0 ? totalSpent / monthCount : 0;
  const monthlyAvgOrders = monthCount > 0 ? orderCount / monthCount : 0;
  const totalSaved = Math.max(0, totalBeforeDiscount - totalSpent);
  const peakMonth = monthlySorted.reduce((best, [month, amount]) => amount > best.amount ? { month, amount } : best, { month: "", amount: 0 });
  const favoriteDayOfWeek = Math.max(...dayCounts) > 0 ? dayCounts.indexOf(Math.max(...dayCounts)) : undefined;
  const favoriteHour = Math.max(...hourCounts) > 0 ? hourCounts.indexOf(Math.max(...hourCounts)) : undefined;

  let longestStreak = 0;
  if (monthlySorted.length > 0) {
    let currentStreak = 1;
    for (let index = 1; index < monthlySorted.length; index += 1) {
      const [prevYear, prevMonth] = monthlySorted[index - 1][0].split("-").map(Number);
      const [year, month] = monthlySorted[index][0].split("-").map(Number);
      const prevIndex = prevYear * 12 + prevMonth;
      const currentIndex = year * 12 + month;
      if (currentIndex - prevIndex === 1) {
        currentStreak += 1;
      } else {
        if (currentStreak > longestStreak) longestStreak = currentStreak;
        currentStreak = 1;
      }
    }
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }

  let spendingVelocity = 0;
  if (firstOrder && lastOrder && firstOrder !== lastOrder) {
    const days = (Number(lastOrder.createTime) - Number(firstOrder.createTime)) / 86400;
    if (days > 0) spendingVelocity = totalSpent / days;
  }

  const dateOptions = { day: "2-digit", month: "2-digit", year: "numeric" };
  return {
    orderCount,
    totalSpent,
    totalSaved,
    totalItems,
    totalShops: Object.keys(shopCount).length,
    avgOrderValue,
    monthlyAvgSpend,
    monthlyAvgOrders,
    monthlySpend,
    monthlySorted,
    topShops,
    topItems,
    expensiveItems,
    firstOrderDate: firstOrder ? new Date(Number(firstOrder.createTime) * 1000).toLocaleDateString(locale, dateOptions) : undefined,
    lastOrderDate: lastOrder ? new Date(Number(lastOrder.createTime) * 1000).toLocaleDateString(locale, dateOptions) : undefined,
    peakMonth: peakMonth.month ? peakMonth : undefined,
    favoriteDayOfWeek,
    favoriteHour,
    longestStreak,
    spendingVelocity
  };
}

async function saveCache(payload) {
  await chrome.storage.local.set({ [CACHE_KEY]: payload });
}

async function loadCache() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  return data[CACHE_KEY] || null;
}

async function fetchOrderPage(tabId, offset) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: async (pageLimit, listType, currentOffset) => {
      try {
        const response = await fetch(`/api/v4/order/get_order_list?_oft=0&limit=${pageLimit}&list_type=${listType}&offset=${currentOffset}`, {
          credentials: "include"
        });
        if (!response.ok) {
          return { ok: false, error: `Shopee tra ve ma ${response.status}.` };
        }
        const json = await response.json();
        return { ok: true, json };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    args: [PAGE_LIMIT, LIST_TYPE, offset]
  });

  if (!result?.ok) {
    throw new Error(result?.error || "Khong tai duoc du lieu tu Shopee.");
  }

  return result.json;
}

function parseOrdersFromResponse(json, logs, offset) {
  const rootError = typeof json?.error === "number" ? json.error : undefined;
  if (typeof rootError === "number" && rootError !== 0) {
    throw new Error(`API error ${rootError}.`);
  }

  const payload = json?.data;
  const details = payload?.details_list ?? [];
  const nextOffset = payload?.next_offset ?? -1;
  logs.push(`Page offset=${offset}, so_don=${details.length}, next_offset=${nextOffset}`);

  return { details, nextOffset };
}

async function runScan(tabId, controller) {
  const logs = [];
  const orders = [];
  const seenOrderIds = new Set();
  let duplicateCount = 0;
  let pageCount = 0;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    if (controller.signal.aborted) {
      throw new Error("SCAN_ABORTED");
    }

    scanProgress = {
      phase: "scanning",
      message: "Dang phan tich don hang...",
      pageCount,
      scannedOrders: orders.length,
      currentOffset: offset
    };
    notify({ type: "progress", progress: scanProgress });

    const json = await fetchOrderPage(tabId, offset);
    const { details, nextOffset } = parseOrdersFromResponse(json, logs, offset);
    pageCount += 1;

    for (const detail of details) {
      const infoCard = detail?.info_card || {};
      const orderId = Number(infoCard.order_id ?? 0);
      if (orderId > 0 && seenOrderIds.has(orderId)) {
        duplicateCount += 1;
        logs.push(`  DUPLICATE orderId=${orderId}`);
        continue;
      }
      if (orderId > 0) {
        seenOrderIds.add(orderId);
      }

      const items = mapItems(infoCard);
      const order = {
        orderId,
        status: detail?.status?.status_label?.text || "",
        createTime: Number(detail?.shipping?.tracking_info?.ctime || 0),
        listType: LIST_TYPE,
        finalTotal: Number(infoCard.final_total || 0),
        subtotal: Number(infoCard.subtotal || 0),
        productCount: Number(infoCard.product_count || 0),
        items
      };
      orders.push(order);
      logs.push(`  orderId=${orderId} final=${formatCurrency(moneyToVnd(order.finalTotal))} subtotal=${formatCurrency(moneyToVnd(order.subtotal))} items=${items.length}`);
    }

    if (nextOffset < 0) {
      hasMore = false;
      break;
    }

    offset = nextOffset;
    const delay = API_DELAY_MS + Math.floor(Math.random() * (API_DELAY_JITTER_MS + 1));
    logs.push(`  WAIT ${delay}ms truoc page tiep theo`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  const stats = computeStats(orders);
  logs.unshift(
    `[SUMMARY] totalSpent=${formatCurrency(stats.totalSpent)}`,
    `[SUMMARY] totalSaved=${formatCurrency(stats.totalSaved)}`,
    `[SUMMARY] totalItems=${stats.totalItems}`,
    `[SUMMARY] totalShops=${stats.totalShops}`,
    `[SUMMARY] orders=${orders.length}, duplicates=${duplicateCount}, pages=${pageCount}`
  );

  const payload = {
    ok: true,
    fetchedAt: new Date().toISOString(),
    pageCount,
    duplicateCount,
    orders,
    stats,
    logs
  };

  return payload;
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== "scan-progress") {
    return;
  }

  progressPorts.add(port);
  port.postMessage({ type: "state", snapshot: currentSnapshot() });
  port.onDisconnect.addListener(() => {
    progressPorts.delete(port);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "getScanState": {
        sendResponse(currentSnapshot());
        return;
      }
      case "getCachedReport": {
        sendResponse({ cache: await loadCache() });
        return;
      }
      case "abortScan": {
        if (activeScan) {
          activeScan.controller.abort();
        }
        sendResponse({ ok: true });
        return;
      }
      case "startScan": {
        if (activeScan) {
          sendResponse({ started: false, reason: "already_scanning" });
          return;
        }

        const tabId = Number(message.tabId || 0);
        if (!tabId) {
          sendResponse({ started: false, reason: "missing_tab" });
          return;
        }

        const controller = new AbortController();
        activeScan = { controller, tabId };
        scanResult = null;
        scanProgress = {
          phase: "scanning",
          message: "Dang bat dau phan tich...",
          pageCount: 0,
          scannedOrders: 0,
          currentOffset: 0
        };
        notify({ type: "progress", progress: scanProgress });
        sendResponse({ started: true });

        try {
          const payload = await runScan(tabId, controller);
          scanResult = payload;
          scanProgress = null;
          await saveCache(payload);
          notify({ type: "result", result: payload });
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          if (messageText === "SCAN_ABORTED") {
            scanResult = {
              ok: false,
              aborted: true,
              logs: ["[ABORTED] Da dung phan tich."],
              error: "Da dung phan tich."
            };
          } else {
            scanResult = {
              ok: false,
              logs: [`[ERROR] ${messageText}`],
              error: messageText
            };
          }
          scanProgress = null;
          notify({ type: "result", result: scanResult });
        } finally {
          activeScan = null;
        }
        return;
      }
      case "openTaxReport": {
        chrome.tabs.create({ url: chrome.runtime.getURL("tax_report.html") });
        sendResponse({ ok: true });
        return;
      }
      default: {
        sendResponse({ ok: false, error: "unknown_message" });
      }
    }
  })();

  return true;
});
