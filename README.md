# 🛒 Shopee Voucher Saver & Affiliate Tax Assistant

Tiện ích mở rộng (Browser Extension) đa năng dành cho trình duyệt Chromium (Microsoft Edge, Opera, Google Chrome) tích hợp 3 bộ công cụ chính:

1. **⚡ Lưu Voucher Tự Động**: Tự động tìm và lưu toàn bộ mã giảm giá trên các trang voucher Shopee.
2. **🛍️ Thống Kê Mua Sắm Cá Nhân**: Quét ngầm lịch sử mua hàng, tổng hợp chi tiêu, tiết kiệm và thói quen đặt hàng.
3. **📊 Sổ Tay Thuế & Xuất Doanh Thu Affiliate**: Tích hợp trực tiếp trên [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record), tính toán sổ tay thuế theo tháng và xuất bảng kê chi tiết doanh thu theo ngày ra **Excel (.xls)** và **CSV (.csv)** chuẩn kê khai.

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
* Bấm **“📊 Xuất Excel”** hoặc **“📥 Xuất CSV”** để tải bảng kê doanh thu theo ngày (*"Doanh thu là tính tiền sàn trả chưa trừ phí"*).

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
