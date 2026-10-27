# 🛒 Shopee Voucher Saver & Affiliate Tax Assistant

Tiện ích mở rộng (Browser Extension) đa năng dành cho trình duyệt Chromium (Microsoft Edge, Opera, Google Chrome) tích hợp 3 bộ công cụ chính:

1. **⚡ Lưu Voucher Tự Động**: Tự động tìm và lưu toàn bộ mã giảm giá trên các trang voucher Shopee.
2. **🛍️ Thống Kê Mua Sắm Cá Nhân**: Quét ngầm lịch sử mua hàng, tổng hợp chi tiêu, tiết kiệm và thói quen đặt hàng.
3. **📊 Sổ Tay Thuế & Xuất Doanh Thu Affiliate**: Tích hợp trực tiếp trên [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record), lọc linh hoạt theo khoảng ngày (Từ ngày - Đến ngày), tính toán sổ tay thuế theo hóa đơn phí dịch vụ điện tử chính thức, xuất bảng kê chi tiết doanh thu theo ngày ra **Excel (.xls)** và **CSV (.csv)**, và xuất **Sổ doanh thu bán hàng hóa, dịch vụ (Mẫu S1a-HKD - Thông tư 152/2025/TT-BTC)** chuẩn file **Excel (.xlsx)**, **Word (.docx)** và bản in A4 / Lưu PDF.

---

## 📚 Tài liệu chi tiết (Docs)

Hệ thống tài liệu được tổ chức tại thư mục [`docs/`](docs/):

* 📑 **[Sổ tay thuế & Báo cáo doanh thu Affiliate (docs/AFFILIATE_TAX_REPORT.md)](docs/AFFILIATE_TAX_REPORT.md)**: Hướng dẫn chi tiết cách đồng bộ API từ tab Shopee Affiliate, công thức tính Sổ tay thuế (HH gộp, Phí MCN, Phí DV, Thuế vãng lai 10%, Thuế HKD 5% GTGT + 5% TNCN) và mẫu xuất file Excel/CSV kê khai doanh thu.
* 📑 **[Đặc tả cấu trúc dữ liệu Shopee API (docs/SHOPEE_RESPONSE_CONTRACTS.md)](docs/SHOPEE_RESPONSE_CONTRACTS.md)**: Đặc tả chi tiết các hợp đồng dữ liệu thực tế (Billing List, Payout Record, Service Fee Invoice), thang quy đổi tiền tệ (raw x100,000 vs chuỗi _dis VND), đối soát chuyên sâu kỳ chi trả 38.230 đ, và chu kỳ hóa đơn phí 9 kỳ.
* 📑 **[Tài liệu kiến trúc đối soát Lịch sử thanh toán & Tham chiếu S1a (docs/REA_PAYMENT_HISTORY_REFERENCE.md)](docs/REA_PAYMENT_HISTORY_REFERENCE.md)**: Phân tích kiến trúc đối soát thanh toán ngoại tuyến, đối chiếu mô hình đối soát toàn bộ cache theo Payout ID, bảo toàn nguồn doanh thu gộp (Gross trước mọi chi phí theo lựa chọn của người dùng) và nguyên tắc bảo mật cục bộ.
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
├── s1a_export.js              # Bộ xuất OOXML (.xlsx, .docx) chuẩn S1a-HKD không phụ thuộc ngoài
├── tax_report.html            # Trang giao diện Sổ tay thuế & Xuất Excel toàn màn hình
├── tax_report.js              # Logic tính toán sổ tay thuế, bộ lọc ngày & xuất file
├── stats.html                 # Trang thống kê chi tiêu mua sắm toàn màn hình
├── stats.js                   # Logic phân tích đơn mua hàng
├── docs/                      # Thư mục tài liệu hướng dẫn chi tiết
│   ├── AFFILIATE_TAX_REPORT.md
│   ├── BUYER_STATISTICS.md
│   ├── REA_PAYMENT_HISTORY_REFERENCE.md
│   ├── SHOPEE_RESPONSE_CONTRACTS.md
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
* Chọn khoảng thời gian **Từ ngày** - **Đến ngày** (bộ lọc ngày tự nhiên `input type="date"`, chuẩn GMT+7, mặc định từ ngày đầu tiên đến ngày cuối cùng của tháng hiện tại theo GMT+7 kể cả khi chưa có dữ liệu cache).
* Xem bảng Sổ tay thuế đối soát các khoản: HH gộp, Phí MCN, Phí DV (HĐ), Sau phí HĐ, Thuế TNCN/GTGT ước tính, Thực nhận (Payout).
* **Giao diện ngày chuẩn DD/MM/YYYY & Nút mở lịch tự nhiên**: Toàn bộ ô chọn ngày hiển thị và nhận nhập chuẩn `dd/mm/yyyy` (bảo đảm định dạng hiển thị trực quan bất biến kể cả trên trình duyệt Chromium với ngôn ngữ mặc định `en-US`). Tích hợp nút biểu tượng lịch kích hoạt hộp thoại chọn ngày gốc của trình duyệt (`.showPicker()` với cơ chế fallback) đồng bộ hai chiều với ô nhập văn bản và input chuẩn ISO. Chặn xuất file tức thì khi ngày nhập không đúng cú pháp để ngăn ngừa xuất dữ liệu cũ. Toàn bộ nhãn tháng hiển thị chuẩn `MM/YYYY` (ví dụ `Tháng 10/2026`).
* **Tính năng độc quyền: Đối chiếu kỳ Payout (Read-only)**: Tích hợp nút **"🔍 Đối chiếu"** trên từng dòng kỳ chi trả S1a và bộ chọn nhanh trên thanh công cụ S1a, mở hộp thoại `<dialog>` gốc độc lập hoàn toàn ở chế độ chỉ đọc. Tự động liên kết toàn bộ bản ghi Billing hoàn thành đơn tương ứng từ toàn bộ bộ nhớ đệm cache (`String(Billing.payout_id).trim() === String(Payout.payoutId).trim()`) mà không bị giới hạn bởi bộ lọc ngày của bảng Billing. Hiển thị đối chiếu ngày tạo kỳ chi trả (`payoutCreatedTime`) vs ngày tiền về (`payArrivalTime`), tổng HH gộp, giảm trừ tại Billing (`sumGross - sumNet`), tổng thực nhận Billing, thực nhận chi trả Payout, và chênh lệch lúc chi trả (`sumBillingNet - PayoutNet`). Cảnh báo rõ ràng nếu thiếu dữ liệu Billing hoặc tổng doanh thu billing không khớp với Payout Gross mà tuyệt đối không ghi đè số doanh thu gộp của S1a. Không thêm cột thứ 4 vào biểu mẫu in ấn S1a (`.no-print`) và không làm thay đổi cấu trúc hàng file xuất DOCX/XLSX/PDF.
* **Thẩm quyền nguồn lịch Billing (Calendar Source Authority)**: Khi một tháng đã có dữ liệu Billing trong bộ nhớ đệm cache nhưng không có bản ghi nào nằm trong khoảng ngày lọc chi tiết, hệ thống ghi nhận các ngày được chọn có doanh thu 0 đ thay vì báo thiếu nguồn toàn bộ tháng.
* **Chuẩn hóa đơn phí DV điện tử (Service Fee Invoice)**: Áp dụng số phí chính thức từ `service_fee_invoice` theo kỳ dịch vụ (`paymentCompletePeriodStartTime`/`paymentCompletePeriodEndTime`, hóa đơn phát hành đầu tháng sau cho dịch vụ tháng trước ghi nhận đúng về tháng trước, không trừ lùi ngày máy móc). Hóa đơn 0 đ là giá trị hợp lệ. Tháng chưa có hóa đơn hiển thị rõ `Chưa có HĐ`. Khoảng lọc ngày lẻ (không trọn tháng) giữ nguyên dấu `-` (không phân bổ bừa bãi), trong khi doanh thu và thực nhận trong khoảng vẫn sử dụng bình thường.
* **Bảng kê chi tiết theo ngày & Xuất Excel/CSV**: Luôn sử dụng nguồn dữ liệu ngày hoàn thành đơn (`billing_list.order_completed_period_start_time`) lọc đúng trong khoảng ngày đã chọn, định dạng đầy đủ `dd/mm/yyyy` (GMT+7) và tiêu đề `Tháng mm/yyyy`. Do lệch chu kỳ thanh toán tự nhiên giữa hai hệ lịch (ngày đơn hoàn thành và ngày chi trả tiền mặt), tổng doanh thu theo ngày và tổng Payout Gross của tháng có thể chênh lệch hợp lệ; chân bảng ngày luôn tổng kết chính xác doanh thu billing và hiển thị khối đối soát gọn (compact reconciliation) chỉ rõ chênh lệch delta. Khi khoảng chọn có tháng thiếu dữ liệu billing, hệ thống hiển thị cảnh báo nêu rõ tháng thiếu (không bịa đặt số 0 giả lập) và ngăn chặn xuất file.
* **Cơ chế Cache & Bảo toàn khi đồng bộ lỗi (Chống mất mát Payout & Billing)**: Dữ liệu lưu đệm 24h trên `chrome.storage.local`. Khi bấm **“Làm mới từ Shopee”**, nếu gọi API Payout thất bại (HTTP 403, 504, đứt mạng, lỗi phân trang dở dang) trong khi Billing thành công, hệ thống tự động bảo lưu danh sách Payout lịch sử (ví dụ hoa hồng gộp tháng 03/2026 vẫn khớp với S1a) và lưu cảnh báo vào cache (`cache.warnings`) để hiển thị khi mở lại, tránh xóa trắng Payout. Chỉ xóa Payout cũ khi API phản hồi thành công xác nhận rỗng chính thức (`totalCount: 0`). Áp dụng chuẩn thời gian bằng Giây (Unix seconds 2000–2100) trên toàn bộ hệ thống, từ chối mili-giây. Đếm độc lập các bản ghi Payout, Billing và Hóa đơn phí. In bằng Ctrl+P bảo toàn tab đang mở, không nhảy tab.
* **Sổ doanh thu Mẫu S1a-HKD (Thông tư 152/2025/TT-BTC)**: Tích hợp tab **Sổ S1a-HKD** trên giao diện Sổ tay thuế toàn màn hình, hỗ trợ điền thông tin người nộp thuế (lưu an toàn trong `chrome.storage.local`), tự động tổng hợp doanh thu theo tháng hoặc theo kỳ chi trả từ nguồn [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record) theo hoa hồng gộp (`eligibleTotalAmount`) trước mọi chi phí và thuế (không trừ phí MCN, không trừ phí DV, không trừ thuế GTGT/TNCN), độc lập với chế độ tính thuế. Hỗ trợ xuất trực tiếp:
  - **📊 Xuất Excel (S1a .xlsx)**: File OOXML Excel thật, định dạng số tiền `#,##0`, cột ngày `dd/mm/yyyy`, tiêu đề bảng và dòng tổng cộng chuẩn kế toán.
  - **📝 Xuất Word (S1a .docx)**: File OOXML Word thật, khổ giấy A4, font Times New Roman, lặp tiêu đề bảng qua trang (`<w:tblHeader/>`), chống xé dòng (`<w:cantSplit/>`), khối chữ ký hợp lệ.
  - **🖨️ In / Lưu PDF**: In trực tiếp hoặc lưu PDF A4 chuẩn biểu mẫu (dòng Tổng cộng duy nhất 1 lần ở cuối sổ, tự động chặn in khi thiếu dữ liệu hoặc khoảng ngày không hợp lệ).
* **Kiểm thử tự động**: Chạy kiểm tra cú pháp và suite kiểm thử qua `for f in popup.js tax_report.js affiliate_content.js s1a_export.js tests/affiliate_harness.js postman/mocks/shopee-affiliate/default.js; do node --check "$f" || exit 1; done` và `python3 -m unittest discover -s tests -v`. Các kiểm thử chạy cục bộ với mock/fixture offline, không gọi API live và không thay thế tư vấn thuế pháp lý.
* **Xuất file**: Bấm **“📊 Xuất Excel”** hoặc **“📥 Xuất CSV”** để tải bảng kê doanh thu theo ngày (*"Doanh thu là tính tiền sàn trả chưa trừ phí theo ngày hoàn thành đơn"*), hoặc bấm các nút xuất trên tab S1a để tải file `.xlsx`, `.docx` hoặc in/lưu PDF chuẩn A4.

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
