chrome.action.onClicked.addListener((tab) => {
    if (tab.url.includes("shopee.vn")) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
        });
    } else {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => alert("This extension only works on Shopee.vn!")
        });
    }
});
