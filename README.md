# 🛒 Shopee Voucher Saver & Affiliate Tax Assistant

Tiện ích mở rộng (Browser Extension) đa năng dành cho trình duyệt Chromium (Microsoft Edge, Opera, Google Chrome) tích hợp 3 bộ công cụ chính:

1. **⚡ Lưu Voucher Tự Động**: Tự động tìm và lưu toàn bộ mã giảm giá trên các trang voucher Shopee.
2. **🛍️ Thống Kê Mua Sắm Cá Nhân**: Quét ngầm lịch sử mua hàng, tổng hợp chi tiêu, tiết kiệm và thói quen đặt hàng.
3. **📊 Sổ Tay Thuế & Xuất Doanh Thu Affiliate**: Tích hợp trực tiếp trên [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record), tính toán sổ tay thuế theo tháng, xuất bảng kê chi tiết doanh thu theo ngày ra **Excel (.xls)** và **CSV (.csv)**, và xuất **Sổ doanh thu bán hàng hóa, dịch vụ (Mẫu S1a-HKD - Thông tư 152/2025/TT-BTC)** chuẩn in A4 / Lưu PDF.

---

## 📚 Tài liệu chi tiết (Docs)

Hệ thống tài liệu được tổ chức tại thư mục [`docs/`](docs/):

* 📑 **[Sổ tay thuế & Báo cáo doanh thu Affiliate (docs/AFFILIATE_TAX_REPORT.md)](docs/AFFILIATE_TAX_REPORT.md)**: Hướng dẫn chi tiết cách đồng bộ API từ tab Shopee Affiliate, công thức tính Sổ tay thuế (HH gộp, Phí MCN, Phí DV, Thuế vãng lai 10%, Thuế HKD 5% GTGT + 5% TNCN) và mẫu xuất file Excel/CSV kê khai doanh thu.
* 🛍️ **[Thống kê chi tiêu mua sắm Shopee (docs/BUYER_STATISTICS.md)](docs/BUYER_STATISTICS.md)**: Hướng dẫn phân tích chi tiêu, lịch sử đơn hàng và bảng xếp hạng mua sắm của người mua.
* ⚡ **[Tự động lưu voucher (docs/VOUCHER_SAVER.md)](docs/VOUCHER_SAVER.md)**: Hướng dẫn tự động thu thập voucher với cơ chế chống chặn spam của Shopee.

---

## ✨ Cấu trúc dự án

```
shopee-voucher-saver/
├── manifest.json              # Khai báo cấu hình Extension (Manifest V3)
├── background.js              # Service worker xử lý quét ngầm và định tuyến tab
├── content.js                 # Content script tự động click voucher
├── affiliate_content.js       # Content script hiển thị nút nổi trên Shopee Affiliate
├── popup.html                 # Giao diện Popup extension (3 tab: Voucher, Mua sắm, Sổ tay thuế)
├── popup.js                   # Xử lý sự kiện và logic hiển thị popup
├── tax_report.html            # Trang giao diện Sổ tay thuế & Xuất Excel toàn màn hình
├── tax_report.js              # Logic tính toán sổ tay thuế, bộ lọc từ tháng-đến tháng & xuất file
├── stats.html                 # Trang thống kê chi tiêu mua sắm toàn màn hình
├── stats.js                   # Logic phân tích đơn mua hàng
├── docs/                      # Thư mục tài liệu hướng dẫn chi tiết
│   ├── AFFILIATE_TAX_REPORT.md
│   ├── BUYER_STATISTICS.md
│   └── VOUCHER_SAVER.md
├── tests/                     # Bộ kiểm thử đơn vị logic tính thuế và xuất file
│   └── test_tax_calculator.py
├── icon.png                   # Biểu tượng extension
└── README.md
```

---

## 🚀 Hướng dẫn cài đặt

1. Mở trình duyệt (Microsoft Edge, Opera hoặc Google Chrome).
2. Truy cập vào trang quản lý tiện ích:
   * **Microsoft Edge**: `edge://extensions/`
   * **Opera**: `opera://extensions/`
   * **Google Chrome**: `chrome://extensions/`
3. Bật **Chế độ dành cho nhà phát triển** (**Developer mode**).
4. Nhấn nút **Tải tiện ích đã giải nén** (**Load unpacked**).
5. Chọn thư mục `shopee-voucher-saver`.
6. Hoàn tất! 🎉

---

## 💡 Hướng dẫn sử dụng nhanh

### 1. Xuất doanh thu & Xem Sổ tay thuế Shopee Affiliate
* Mở tab [https://affiliate.shopee.vn/payment/payout_record](https://affiliate.shopee.vn/payment/payout_record) hoặc `/payment/billing`.
* Nhấp vào nút nổi **“📊 Sổ tay thuế & Xuất Excel Shopee”** ở góc dưới bên phải màn hình (hoặc mở từ popup extension, chuyển sang tab **Sổ tay thuế**).
* Chọn khoảng thời gian **Từ tháng** - **Đến tháng** (mặc định các tháng trong năm 2026).
* Xem bảng Sổ tay thuế đối soát các khoản: HH gộp, Phí MCN, Sau MCN, Phí DV 0.98%, Thực nhận, Thuế vãng lai 10%, Thuế HKD (5% GTGT + 5% TNCN), Ước thực về TK.
* **Chuẩn đối soát từng bill (Payout Record cho mọi tháng có Payout)**: Tháng có kỳ chi trả tổng hợp chuẩn xác theo **Payout Record** (GraphQL `getPaymentPayoutBillingList`, tự lặp đủ trang có pacing, phân rã từ `Gross` và `Thực nhận` => Phí DV 0,98% / 5% VAT / 5% PIT) — áp dụng cho mọi tháng (kể cả trước hay sau 10/2026), đồng bộ hoàn toàn với Sổ S1a-HKD và các Card thống kê. Hóa đơn phí DV từ `service_fee_invoice` áp dụng cho các tháng hạch toán theo billing, không ghi đè kỳ Payout thực tế. Tháng chưa có kỳ chi trả tự động fallback theo ngày hoàn thành đơn và có nhãn hiển thị trực quan `[Billing (Fallback)]`.
* **Bảng kê chi tiết theo ngày & Xuất Excel/CSV**: Luôn sử dụng nguồn dữ liệu ngày hoàn thành đơn (`billing_list.order_completed_period_start_time`), định dạng đầy đủ `dd/mm/yyyy` (GMT+7) và tiêu đề `Tháng mm/yyyy`. Do lệch chu kỳ thanh toán tự nhiên giữa hai hệ lịch (ngày đơn hoàn thành và ngày chi trả tiền mặt), tổng doanh thu theo ngày và tổng Payout Gross của tháng có thể chênh lệch hợp lệ; chân bảng ngày luôn tổng kết chính xác doanh thu billing và hiển thị khối đối soát gọn (compact reconciliation) chỉ rõ chênh lệch delta. Khi khoảng chọn có tháng thiếu dữ liệu billing, hệ thống hiển thị cảnh báo nêu rõ tháng thiếu (không bịa đặt số 0 giả lập) và ngăn chặn xuất file.
* **Cơ chế Cache & Bảo toàn khi đồng bộ lỗi (Chống mất mát Payout & Billing)**: Dữ liệu lưu đệm 24h trên `chrome.storage.local`. Khi bấm **“Làm mới từ Shopee”**, nếu gọi API Payout thất bại (HTTP 403, 504, đứt mạng, lỗi phân trang dở dang) trong khi Billing thành công, hệ thống tự động bảo lưu danh sách Payout lịch sử (ví dụ hoa hồng gộp tháng 03/2026 vẫn khớp với S1a) và lưu cảnh báo vào cache (`cache.warnings`) để hiển thị khi mở lại, tránh xóa trắng Payout. Chỉ xóa Payout cũ khi API phản hồi thành công xác nhận rỗng chính thức (`totalCount: 0`). Áp dụng chuẩn thời gian bằng Giây (Unix seconds 2000–2100) trên toàn bộ hệ thống, từ chối mili-giây. Đếm độc lập các bản ghi Payout, Billing và Hóa đơn phí. In bằng Ctrl+P bảo toàn tab đang mở, không nhảy tab.
* **Sổ doanh thu Mẫu S1a-HKD (Thông tư 152/2025/TT-BTC)**: Tích hợp tab **Sổ S1a-HKD** trên giao diện Sổ tay thuế toàn màn hình, hỗ trợ điền thông tin người nộp thuế (lưu an toàn trong `chrome.storage.local`), tự động tổng hợp doanh thu theo tháng hoặc theo kỳ chi trả từ nguồn [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record) theo hoa hồng gộp (`eligibleTotalAmount`) trước mọi chi phí và thuế (không trừ phí MCN, không trừ phí DV, không trừ thuế GTGT/TNCN), độc lập với chế độ tính thuế. Bấm **“🖨️ In / Lưu PDF”** để in trực tiếp hoặc lưu file PDF khổ A4 chuẩn biểu mẫu kế toán mà không cần cài đặt thêm thư viện ngoài (dòng Tổng cộng hiển thị duy nhất 1 lần ở cuối sổ, tự động chặn in khi thiếu dữ liệu hoặc phát hiện lỗi; khuyến nghị bỏ chọn "Tiêu đề đầu trang và chân trang" trong hộp thoại in để bản in sạch đẹp).
* **Kiểm thử tự động**: Chạy kiểm tra cú pháp và suite kiểm thử qua `for f in popup.js tax_report.js affiliate_content.js tests/affiliate_harness.js postman/mocks/shopee-affiliate/default.js; do node --check "$f" || exit 1; done` và `python3 -m unittest discover -s tests -v`. Các kiểm thử chạy cục bộ với mock/fixture offline, không gọi API live và không thay thế tư vấn thuế pháp lý.
* **Xuất file**: Bấm **“📊 Xuất Excel”** hoặc **“📥 Xuất CSV”** để tải bảng kê doanh thu theo ngày (*"Doanh thu là tính tiền sàn trả chưa trừ phí theo ngày hoàn thành đơn"*), hoặc bấm **“🖨️ In / Lưu PDF”** trên tab S1a để lưu sổ doanh thu chuẩn A4.

### 2. Quét thống kê mua sắm cá nhân
* Đăng nhập `shopee.vn`, bấm icon extension, chọn tab **“Mua sắm”** và bấm **“Bắt đầu phân tích”**.

### 3. Tự động lưu voucher
* Mở bất kỳ trang mã giảm giá nào trên Shopee, bấm icon extension và chọn **“Lưu tất cả voucher”**.

---

## 🔗 Liên kết Git Repository

* **GitHub Repository**: [https://github.com/nguyennoi1992/shopee-voucher-saver](https://github.com/nguyennoi1992/shopee-voucher-saver)
* **Branch phát triển**: `NoiNV`

---

## 📜 Quyền hạn (Permissions)

| Quyền | Mục đích |
| :--- | :--- |
| `tabs` | Tìm kiếm tab Shopee / Shopee Affiliate đang mở để tương tác và mở trang báo cáo |
| `scripting` | Khởi chạy kịch bản tự động lưu voucher và gọi API nội bộ trực tiếp từ phiên đăng nhập |
| `storage` | Lưu trữ bộ nhớ đệm (Cache) đơn hàng và danh sách billing doanh thu để xem lại tức thì |
| `*://*.shopee.vn/*` | Giới hạn phạm vi hoạt động chỉ trong hệ sinh thái Shopee Việt Nam |

---

## ⚠️ Miễn trừ trách nhiệm

* Tiện ích này phục vụ mục đích hỗ trợ năng suất cá nhân và quản lý dữ liệu đối soát.
* Các số liệu thuế trên báo cáo mang tính chất ước tính dựa trên thuật toán và dữ liệu cung cấp bởi Shopee, không thay thế cho tư vấn thuế chuyên nghiệp. Người dùng vui lòng kiểm tra với cơ quan thuế hoặc kế toán trước khi thực hiện kê khai chính thức.
* Không liên kết hoặc được ủy quyền chính thức bởi Shopee.
