# Sổ tay thuế & Báo cáo doanh thu Shopee Affiliate (Excel & CSV)

Phân hệ **Sổ tay thuế & Doanh thu Shopee Affiliate** hỗ trợ các Publisher / KOC / Affiliate Marketer tự động tổng hợp hoa hồng, đối soát chi phí, ước tính nghĩa vụ thuế (Cá nhân hoặc Hộ kinh doanh), và xuất file Excel/CSV theo đúng mẫu kê khai doanh thu.

---

## 1. Tính năng chính

* **Tự động trích xuất dữ liệu từ Shopee Affiliate**:
  * Tích hợp trực tiếp trên trang thanh toán `https://affiliate.shopee.vn/payment/payout_record` và `/payment/billing`.
  * Hiển thị nút bấm tiện ích nổi (Floating Pill) ngay góc màn hình: *“📊 Sổ tay thuế & Xuất Excel Shopee”*.
  * Tự động gọi API nội bộ `/api/v3/payment/billing_list` với phiên đăng nhập hiện tại để lấy dữ liệu doanh thu chính xác nhất.
* **Cơ chế Cache thông minh 24h (Tối ưu API)**:
  * Dữ liệu đối soát các tháng đã hoàn thành là cố định (bất biến), vì vậy extension tự động lưu vào bộ nhớ đệm `chrome.storage.local`.
  * **Chỉ gọi API khi**:
    1. Lần đầu tiên truy cập (chưa có cache).
    2. Dữ liệu trong cache đã hết hạn (quá 24 giờ).
    3. Người dùng chủ động yêu cầu làm mới bằng cách bấm nút **“🔄 Làm mới từ Shopee”**.
  * Giúp mở trang báo cáo tức thì, không làm quá tải endpoint của Shopee và không lo bị rate limit.
  * Cung cấp nút **“🗑️ Xóa cache”** để dọn dẹp bộ nhớ đệm bất cứ lúc nào.
* **Lọc theo khoảng thời gian tùy chọn**:
  * Cho phép chọn **Từ tháng** (ví dụ `2026-01`) đến **Đến tháng** (ví dụ `2026-10`).
  * Tự động cập nhật bảng tổng hợp và bảng chi tiết theo ngày theo phạm vi đã chọn.
* **Bảng Sổ tay thuế tổng hợp theo tháng**:
  * **HH gộp**: Tiền sàn trả chưa trừ phí (`eligible_total_amount_dis`).
  * **Phí MCN**: Phí quản lý mạng lưới nếu có tham gia MCN (`mcn_management_fee_dis`).
  * **Sau MCN**: `HH gộp` - `Phí MCN`.
  * **Phí DV 0,98%**: Phí dịch vụ sàn Shopee khấu trừ (0.98% của số tiền sau MCN).
  * **Thực nhận theo bill**: Số tiền thực tế ghi nhận trên bảng kê của Shopee.
  * **10% TNCN (vãng lai)**: Thuế TNCN khấu trừ tại nguồn đối với cá nhân chưa đăng ký Hộ kinh doanh (10% của Sau MCN).
  * **5% GTGT & 5% TNCN (KD)**: Nghĩa vụ thuế theo mô hình Hộ kinh doanh (mỗi loại 5% của Sau MCN).
  * **Ước thực về TK**: Số tiền thực tế về tài khoản ngân hàng sau khi trừ toàn bộ thuế và phí.
  * **Dòng Cộng**: Tổng lũy kế toàn bộ các cột trong kỳ báo cáo.
* **Bảng kê chi tiết doanh thu theo ngày (Mẫu kê khai)**:
  * Trình bày dạng bảng với 3 cột chuẩn:
    * `Ngày tháng` (1, 2, ..., 31)
    * `Diễn giải` (*"Doanh thu từ Shopee"*)
    * `Số tiền` (*Doanh thu tiền sàn trả chưa trừ phí*)
  * Từng tháng có dòng tiêu đề `Tháng X` và dòng tổng kết `Tổng Doanh Thu` in đậm.
* **Xuất file Excel (.xls) và CSV (.csv)**:
  * **File Excel (.xls)**: Định dạng chuẩn SpreadsheetML với đường viền (borders), tiêu đề in đậm, định dạng số có dấu phân cách hàng nghìn (`#,##0`).
  * **File CSV (.csv)**: Chuẩn UTF-8 có BOM (`\uFEFF`) giúp mở trực tiếp trên Microsoft Excel và Google Sheets không bị lỗi font tiếng Việt.
* **Hỗ trợ dán dữ liệu thủ công (Fallback)**:
  * Cung cấp popup dán JSON nếu muốn phân tích offline hoặc khi máy khác không cài extension.

---

## 2. Hướng dẫn sử dụng

### Cách 1: Sử dụng trực tiếp trên tab Shopee Affiliate (Khuyên dùng)
1. Đăng nhập vào tài khoản Shopee Affiliate trên trình duyệt (Opera, Chrome, Edge).
2. Truy cập trang: [https://affiliate.shopee.vn/payment/payout_record](https://affiliate.shopee.vn/payment/payout_record) hoặc `https://affiliate.shopee.vn/payment/billing`.
3. Bấm vào nút nổi màu cam **“📊 Sổ tay thuế & Xuất Excel Shopee”** ở góc dưới bên phải màn hình.
4. Tab báo cáo sẽ mở ra và tự động đồng bộ hóa toàn bộ danh sách billing của năm hiện tại.
5. Chọn khoảng tháng cần xem (ví dụ: `2026-01` đến `2026-10`).
6. Bấm **“📊 Xuất Excel”** hoặc **“📥 Xuất CSV”** để tải file kê khai doanh thu về máy.

### Cách 2: Sử dụng từ Extension Popup
1. Mở icon extension trên thanh công cụ trình duyệt.
2. Chuyển sang tab **“Sổ tay thuế”**.
3. Bấm **“Đồng bộ dữ liệu từ Shopee Affiliate”** (hoặc nạp tự động từ Cache 24h).
4. Chọn khoảng tháng (**Từ tháng** - **Đến tháng**).
5. Chuyển đổi giữa 3 chế độ xem trực quan ngay trong Popup:
   * **📋 Đơn giản (Excel)**: Bảng tóm tắt tinh gọn theo tháng (`Tháng`, `Diễn giải`, `Doanh thu sàn`, `Ước thực nhận`).
   * **📊 Chi tiết (10 cột)**: Đầy đủ 10 cột Sổ tay thuế, hỗ trợ thanh cuộn ngang/dọc mượt mà, cố định cột *Tháng* (Sticky Column) và ghim dòng tiêu đề/tổng cộng (Sticky Header/Footer).
   * **📅 Bảng kê theo ngày**: Liệt kê chi tiết từng ngày trong kỳ đối soát (`Ngày tháng`, `Diễn giải: Doanh thu từ Shopee`, `Số tiền`).
6. Bấm **“Xuất Excel”** / **“Xuất CSV”** trực tiếp, hoặc bấm **“Mở Sổ tay thuế đầy đủ & Xuất Excel”** để xem trên trang toàn màn hình.

### Cách 3: Dán dữ liệu thủ công (Offline)
1. Mở trang báo cáo `tax_report.html`.
2. Bấm nút **“📋 Dán dữ liệu”**.
3. Dán chuỗi JSON lấy từ endpoint `/api/v3/payment/billing_list` vào khung văn bản.
4. Bấm **“Xử lý & Cập nhật”**.

---

## 3. Công thức tính toán & Quy chuẩn doanh thu

### 3.1. Phân định cơ chế thuế theo mốc thời gian & Ngưỡng khấu trừ

* **Giai đoạn trước Tháng 10/2026**:
  * **Ngưỡng khấu trừ thuế TNCN**: Theo quy định pháp luật và chính sách chi trả của Shopee trước 10/2026, thu nhập vãng lai **từ 2.000.000 đ/lần chi trả trở lên** mới thuộc diện khấu trừ 10% tại nguồn.
  * **Dữ liệu thực tế từ API**: Các kỳ đối soát có thu nhập dưới ngưỡng này có `with_wht: false` và `wht_amount: 0`. Shopee **không khấu trừ 10% thuế TNCN** và **không trừ phí DV 0,98%**, người dùng nhận trọn vẹn 100% doanh thu (`total_payment_amount_dis = eligible_total_amount_dis`).
  * Extension tự động trích xuất trực tiếp số tiền khấu trừ thực tế từ API (`wht_amount_dis`, `total_payment_amount_dis`), **không tự ý fix cứng áp 10%** nếu kỳ thanh toán không bị trừ thuế.
* **Giai đoạn từ Tháng 10/2026 trở đi (Cập nhật chính sách mới)**:
  * Shopee chính thức **tách riêng 2 khoản thuế khấu trừ tại nguồn** cho toàn bộ Publisher / KOC:
    * **5% Thuế Giá trị gia tăng (VAT / GTGT)**
    * **5% Thuế Thu nhập cá nhân (PIT / TNCN)**
    * **10% TNCN (vãng lai) = 0 đ** (không gộp chung như trước).
  * **Không trừ phí dịch vụ 0,98%** trên các khoản thanh toán đối soát mới.
  * **Thực nhận về TK = 90%** của Doanh thu hợp lệ sau MCN (`Sau MCN` - `5% VAT` - `5% PIT`). Khớp 100% với mục *"Tổng thanh toán sau thuế"* trên trang chi tiết khoản thanh toán của Shopee.

### 3.2. Bảng quy chuẩn các khoản mục & Đồng bộ tính toán giữa các Tab

Để đảm bảo tính nhất quán và chuẩn mực kế toán 100% giữa **Popup Extension**, trang **Sổ tay thuế toàn màn hình**, và giữa các chế độ xem (**Đơn giản**, **Chi tiết 10 cột**, **Bảng kê theo ngày**):

* **Hệ thống luôn bảo toàn 2 bất đẳng thức kế toán cơ bản ở từng dòng tháng và dòng Tổng cộng**:
  1. `Sau MCN` - `Phí DV 0,98%` = `Thực nhận theo bill`
  2. `Thực nhận theo bill` - `10% TNCN (vãng lai)` - `5% GTGT` - `5% TNCN (KD)` = `Ước thực về TK`

| Khoản mục | Quy tắc tính trước 10/2026 | Quy tắc tính từ 10/2026 | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Doanh thu (HH gộp)** | Tổng `eligible_total_amount_dis` | Tổng `eligible_total_amount_dis` | Tiền sàn trả chưa trừ bất kỳ phí hay thuế nào. Khớp với tổng doanh thu theo ngày. |
| **Phí MCN** | `mcn_management_fee_dis` | `mcn_management_fee_dis` | Phí quản lý mạng lưới nếu có tham gia MCN. |
| **Sau MCN** | `HH gộp` - `Phí MCN` | `HH gộp` - `Phí MCN` | Số tiền cơ sở sau khi trừ MCN. |
| **Phí DV 0,98%** | Lấy theo `service_fee_dis` hoặc chênh lệch giữa `Sau MCN` và `billTotal` | **0 đ** | Shopee không trừ phí DV 0,98% từ 10/2026. |
| **Thực nhận bill** | `Sau MCN` - `Phí DV 0,98%` | Bằng chính `Sau MCN` | Doanh thu trước khi trừ các khoản thuế khấu trừ tại nguồn. |
| **10% TNCN (vãng lai)** | Theo `wht_amount_dis` từ API (**0 đ** nếu dưới ngưỡng) | **0 đ** | Từ 10/2026 đã tách riêng thành 5% VAT và 5% PIT. |
| **5% GTGT** | 0 đ (hoặc 5% nếu chọn chế độ HKD) | **5%** (hoặc theo `vat_amount_dis`) | Thuế GTGT khấu trừ tại nguồn. |
| **5% TNCN (KD/PIT)** | 0 đ (hoặc 5% nếu chọn chế độ HKD) | **5%** (hoặc theo `wht_amount_dis`) | Thuế TNCN khấu trừ tại nguồn. |
| **Ước thực về TK** | `Thực nhận bill` - các loại thuế khấu trừ | `Thực nhận bill` - `5% VAT` - `5% PIT` | Khớp chính xác giữa Tab Đơn giản, Tab Chi tiết và Card Thống kê. |

### 3.3. Cơ chế Hóa đơn phí dịch vụ (service_fee_invoice) & Đối soát thanh toán

Trang `https://affiliate.shopee.vn/payment/service_fee_invoice` là nơi Shopee lưu trữ các **Hóa đơn điện tử GTGT (e-Invoice)** phát hành cho Publisher. Người dùng thường không thấy khoản phí này bị trừ trong `payment/billing` hay `payment/payout_record` do các nguyên nhân sau:

1. **Bản chất của Hóa đơn phí dịch vụ**:
   * Khi bạn tham gia Shopee Affiliate, Shopee (Công ty TNHH Shopee) đóng vai trò là đơn vị cung cấp hạ tầng công nghệ và hệ thống tiếp thị. Đổi lại, Shopee thu một khoản phí dịch vụ nền tảng.
   * Theo quy định của Luật Quản lý Thuế và Nghị định 123/2020/NĐ-CP, khi Shopee thu khoản phí này, Shopee **bắt buộc phải xuất hóa đơn GTGT hợp pháp** cho Publisher.
2. **Tại sao không thấy khoản trừ này trong `billing` và `payout_record`?**:
   * **Cấn trừ trước khi kết xuất số liệu (Gross vs Net)**: Khoản phí dịch vụ này thực chất đã được Shopee cấn trừ ngay tại tầng xử lý giao dịch hoa hồng đơn hàng trước khi chốt danh sách. Số tiền *"Tổng doanh thu hợp lệ"* (`eligible_total_amount_dis`) bạn nhìn thấy trên `billing` và `payout_record` chính là số tiền đã trừ phí nền tảng này.
   * **Tách biệt dòng tiền và chứng từ thuế**:
     * `payout_record`: Là **sổ luân chuyển tiền mặt** (Cash Payout), ghi nhận số tiền chuyển khoản về tài khoản ngân hàng và nghĩa vụ thuế Shopee nộp thay (PIT/VAT).
     * `service_fee_invoice`: Là **kho chứng từ thuế** (Tax Accounting), phục vụ cho Publisher làm Hộ kinh doanh hoặc Doanh nghiệp lấy hóa đơn đầu vào để hạch toán chi phí hợp lý khi quyết toán thuế.
   * Do đó, hệ thống không trừ thêm một lần nữa trên `payout_record` để tránh trừ trùng hai lần tiền phí.

### 3.4. Phân biệt Dữ liệu Payout Record (Ngày thanh toán) và Billing List (Ngày hoàn thành đơn)

Extension hỗ trợ đồng bộ và nhận diện tự động cả 2 nguồn dữ liệu chính từ Shopee Affiliate:

1. **Theo Lịch sử thanh toán (`payment/payout_record` - Khuyên dùng cho Sổ tay thuế & Tiền về TK)**:
   * **Nguồn API**: GraphQL `getPaymentPayoutBillingList` (`/api/v3/gql?q=getPayoutList`) hoặc chi tiết từng bill `getPayoutDetail`.
   * **Bản chất**: Phản ánh chính xác **dòng tiền thực nhận về tài khoản ngân hàng** theo thời điểm chi trả (`payoutCreatedTime` / `payArrivalTime`).
   * **Thực tế tháng 10/2026 (5 kỳ thanh toán)**:
     * **Kỳ 01-10-2026** (Mã `...1001`): Thực nhận **23.331 đ** (Doanh thu các ngày cuối tháng 9 dưới ngưỡng khấu trừ, **chưa trừ thuế PIT và VAT -> Thuế = 0 đ**).
     * **Kỳ 05-10-2026** (Mã `...1005`): Doanh thu hợp lệ 37.854 đ, **5% VAT: -1.912 đ, 5% PIT: -1.912 đ**, Thực nhận: **34.030 đ**.
     * **Kỳ 08-10-2026** (Mã `...1008`): Doanh thu hợp lệ 49.496 đ, **5% VAT: -2.499 đ, 5% PIT: -2.499 đ**, Thực nhận: **44.498 đ**.
     * **Kỳ 12-10-2026** (Mã `...1012`): Doanh thu hợp lệ 23.489 đ, **5% VAT: -1.186 đ, 5% PIT: -1.186 đ**, Thực nhận: **21.117 đ**.
     * **Kỳ 19-10-2026** (Mã `...1019`): Doanh thu hợp lệ 71.086 đ, **5% VAT: -3.590 đ, 5% PIT: -3.590 đ**, Thực nhận: **63.906 đ**.
     * **Tổng Sau thuế (Thực nhận về TK)** = `23.331 + 34.030 + 44.498 + 21.117 + 63.906` = **186.882 đ**.
     * **Tổng Thuế PIT (TNCN)** = `0 + 1.912 + 2.499 + 1.186 + 3.590` = **9.187 đ**.
     * **Tổng Thuế VAT (GTGT)** = `0 + 1.912 + 2.499 + 1.186 + 3.590` = **9.187 đ**.
     * **Tổng 2 khoản thuế** = `9.187 + 9.187` = **18.374 đ**.
     * **Tổng doanh thu hợp lệ trước thuế** = `186.882 + 18.374` = **205.256 đ** *(Lưu ý: Nếu chỉ cộng 1 khoản thuế 9.187 như nháp nhanh thì ra 196.069 đ, nhưng thực tế Shopee khấu trừ cả VAT 9.187 đ và PIT 9.187 đ nên tổng trước thuế chuẩn kế toán là 205.256 đ)*.
     * **Tổng tiền sàn trả cơ sở (Gross)** = **207.288 đ** *(trước phí dịch vụ sàn 0.98% là 2.032 đ)*.

2. **Theo Ngày hoàn thành đơn hàng (`payment/billing` - Khuyên dùng cho Kê khai ngày phát sinh)**:
   * **Nguồn API**: `/api/v3/payment/billing_list` lọc theo `order_completed_period_start_time`.
   * **Bản chất**: Phản ánh ngày phát sinh hoa hồng từ đơn hàng thực tế của người mua (Ngày 1, 2, ..., 31) để xuất file Excel/CSV kê khai thuế theo ngày.

---

## 4. Cấu trúc file xuất (Excel & CSV)

```
Ngày tháng,Diễn giải,Số tiền
Tháng 1,,
1,Doanh thu từ Shopee,63384
2,Doanh thu từ Shopee,16656
...
31,Doanh thu từ Shopee,236105
,Tổng Doanh Thu,1224353

Tháng 2,,
1,Doanh thu từ Shopee,45200
...
,Tổng Doanh Thu,697783
```
