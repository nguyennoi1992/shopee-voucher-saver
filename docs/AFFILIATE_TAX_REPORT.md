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

### 3.1. Phân định cơ chế thuế theo mốc thời gian

* **Giai đoạn trước Tháng 10/2026**:
  * Phí dịch vụ sàn: **0,98%** (`Sau MCN` × 0,0098).
  * Thuế TNCN vãng lai: **10%** (`Sau MCN` × 0,10) đối với cá nhân, hoặc **5% GTGT + 5% TNCN** đối với tài khoản đăng ký Hộ kinh doanh.
* **Giai đoạn từ Tháng 10/2026 trở đi (Cập nhật chính sách mới)**:
  * Shopee chính thức **tách riêng 2 khoản thuế khấu trừ tại nguồn** cho toàn bộ Publisher / KOC:
    * **5% Thuế Giá trị gia tăng (VAT / GTGT)**
    * **5% Thuế Thu nhập cá nhân (PIT / TNCN)**
    * **10% TNCN (vãng lai) = 0 đ** (không gộp chung như trước).
  * **Không trừ phí dịch vụ 0,98%** trên các khoản thanh toán đối soát mới.
  * **Thực nhận về TK = 90%** của Doanh thu hợp lệ sau MCN (`Sau MCN` - `5% VAT` - `5% PIT`). Khớp 100% với mục *"Tổng thanh toán sau thuế"* trên trang chi tiết khoản thanh toán của Shopee.

### 3.2. Bảng quy chuẩn các khoản mục

| Khoản mục | Quy tắc tính trước 10/2026 | Quy tắc tính từ 10/2026 | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Doanh thu (HH gộp)** | Tổng `eligible_total_amount_dis` | Tổng `eligible_total_amount_dis` | Tiền sàn trả chưa trừ bất kỳ phí hay thuế nào. |
| **Phí MCN** | `mcn_management_fee_dis` | `mcn_management_fee_dis` | Phí quản lý mạng lưới nếu có tham gia MCN. |
| **Sau MCN** | `HH gộp` - `Phí MCN` | `HH gộp` - `Phí MCN` | Căn cứ tính thuế và thanh toán. |
| **Phí DV 0,98%** | `Sau MCN` × 0,98% | **0 đ** | Shopee không trừ phí DV 0,98% từ 10/2026. |
| **Thực nhận bill** | `Sau MCN` - `Phí DV 0,98%` | Bằng chính `Sau MCN` | Doanh thu trước khi trừ các khoản thuế. |
| **10% TNCN (vãng lai)** | `Sau MCN` × 10% | **0 đ** | Đã tách riêng thành VAT và PIT. |
| **5% GTGT** | 0 đ (hoặc 5% nếu HKD) | **5%** (hoặc theo bill VAT) | Thuế GTGT khấu trừ tại nguồn. |
| **5% TNCN (KD/PIT)** | 0 đ (hoặc 5% nếu HKD) | **5%** (hoặc theo bill PIT) | Thuế TNCN khấu trừ tại nguồn. |
| **Ước thực về TK** | `Thực nhận bill` - Thuế | `Sau MCN` × 90% | Khớp chính xác "Tổng thanh toán sau thuế". |

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
