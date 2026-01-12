# 🛒 Shopee Voucher Saver (Microsoft Edge Extension)

Shopee Voucher Saver is a lightweight Microsoft Edge extension that automatically clicks all **“Lưu” (Save)** voucher buttons on Shopee pages, helping you collect vouchers quickly without manual effort.

---

## ✨ Features

* 🔍 Automatically finds all voucher buttons with text **“Lưu”**
* 🖱️ Clicks vouchers one-by-one with random delay (human-like)
* 📜 Auto scrolls page to load all vouchers
* 📊 Shows summary alert after completion
* ▶️ Runs manually by clicking the extension icon
* ⚡ No login, no external API, no tracking

---

## 📂 Project Structure

```
shopee-voucher-saver/
│── manifest.json
│── background.js
│── content.js
│── icon.png
│── README.md
```

---

## 🧩 How It Works

1. You open a Shopee voucher page
2. Click the extension icon
3. The script:

    * Scrolls to the bottom of the page
    * Finds all `<span>` elements with text **"Lưu"**
    * Clicks each voucher with delay
4. When finished, a popup alert shows the result:

```
🎉 Done! Saved X vouchers successfully.
```

---

## 🚀 Installation (Edge)

1. Open **Microsoft Edge**
2. Go to:

```
edge://extensions/
```

3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the `shopee-voucher-saver` folder
6. Done 🎉

---

## ▶️ Usage

1. Go to a Shopee voucher page
2. Make sure vouchers are visible
3. Click the **Shopee Voucher Saver** icon
4. Wait for the process to finish
5. Check the alert summary

---

## 📜 Permissions Explained

| Permission  | Reason                         |
| ----------- | ------------------------------ |
| `tabs`      | Inject script into current tab |
| `scripting` | Run voucher auto-click script  |
| `shopee.vn` | Limit access to Shopee only    |

---

## ⚠️ Notes & Limitations

* Shopee UI may change → selector may need updates
* Some vouchers may require login
* Too many clicks too fast may trigger Shopee rate limits
* Use responsibly

---

## 🛠 Customization

You can adjust delay in `content.js`:

```js
var delay = 1500; // milliseconds
```

---

## 📄 License

MIT License
Free to use, modify, and share.

---

## 🙌 Disclaimer

This extension is for **personal productivity purposes only**.
Use at your own risk.
Not affiliated with or endorsed by Shopee.

---

Happy saving vouchers! 🎉🛍️
