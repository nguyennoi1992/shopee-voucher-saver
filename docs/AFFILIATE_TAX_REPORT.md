# Sổ tay thuế & Báo cáo doanh thu Shopee Affiliate (Excel & CSV)

Phân hệ **Sổ tay thuế & Doanh thu Shopee Affiliate** hỗ trợ các Publisher / KOC / Affiliate Marketer tự động tổng hợp hoa hồng, đối soát chi phí, ước tính nghĩa vụ thuế (Cá nhân hoặc Hộ kinh doanh), và xuất file Excel/CSV theo đúng mẫu kê khai doanh thu.

---

## 1. Tính năng chính

* **Tự động trích xuất dữ liệu từ Shopee Affiliate**:
  * Tích hợp trực tiếp trên trang thanh toán `https://affiliate.shopee.vn/payment/payout_record` và `/payment/billing`.
  * Hiển thị nút bấm tiện ích nổi (Floating Pill) ngay góc màn hình: *“📊 Sổ tay thuế & Xuất Excel Shopee”*.
  * Gọi **GraphQL `getPaymentPayoutBillingList`** (`/api/v3/gql?q=getPayoutList`) để lấy toàn bộ kỳ chi trả (Payout Record), **tự động lặp đủ trang** theo `pagination.totalCount` (portal chỉ trả ~10 kỳ/trang), cùng với `/api/v3/payment/billing_list` (theo ngày hoàn thành đơn) cho **cả hai nguồn trong một phiên** dùng phiên đăng nhập hiện tại (header `Affiliate-Program-Type`; chạy trong world `MAIN` của trang; yêu cầu đầu tiên bỏ qua header khi chưa có token, token nhận được từ response/config được dùng ngay cho yêu cầu đầu các trang kế tiếp, thử thách 403/401 kích hoạt quy trình dò tìm có giới hạn và thử lại — xem chuỗi dự phòng fix HTTP 403 ở mục 3.4).
* **Cơ chế Cache thông minh 24h (Tối ưu API)**:
  * Dữ liệu đã tải được lưu trong chrome.storage.local tối đa 24 giờ để mở báo cáo nhanh; người dùng có thể chủ động Làm mới để nhận điều chỉnh từ nguồn.
  * **Chỉ gọi API khi**:
    1. Lần đầu tiên truy cập (chưa có cache).
    2. Dữ liệu trong cache đã hết hạn (quá 24 giờ).
    3. Người dùng chủ động yêu cầu làm mới bằng cách bấm nút **“🔄 Làm mới từ Shopee”**.
  * Giúp mở trang báo cáo tức thì, không làm quá tải endpoint của Shopee và không lo bị rate limit.
  * Cung cấp nút **“🗑️ Xóa cache”** để dọn dẹp bộ nhớ đệm bất cứ lúc nào.
* **Lọc theo khoảng ngày tùy chọn (Từ ngày - Đến ngày) & Định dạng ngày DD/MM/YYYY chuẩn hóa**:
  * **Định dạng hiển thị DD/MM/YYYY đảm bảo**: Giao diện cung cấp ô nhập văn bản định dạng `dd/mm/yyyy` trực quan (bảo đảm định dạng ngày hiển thị bất biến ngay cả trên trình duyệt Chromium với locale mặc định `en-US`), đồng bộ hai chiều với các thẻ nhập chuẩn ISO ẩn (`input-from-date`, `input-to-date`, `popup-from-date`, `popup-to-date`).
  * **Nút mở lịch tự nhiên**: Nút biểu tượng lịch chuyên dụng kích hoạt API chọn ngày gốc của trình duyệt (`.showPicker()` với cơ chế fallback) kèm thông báo phản hồi trợ năng khi khoảng ngày không hợp lệ. Khi nhập sai định dạng hoặc ngày không hợp lệ, hệ thống báo lỗi rõ ràng và hủy ngay lập tức các nút xuất file để ngăn chặn xuất dữ liệu cũ.
  * **Định dạng nhãn tháng MM/YYYY**: Toàn bộ nhãn tháng hiển thị người dùng (tiêu đề bảng kê ngày, dòng tháng, huy hiệu trạng thái) đều dùng chuẩn `MM/YYYY` (ví dụ `Tháng 10/2026`).
  * **Thẩm quyền nguồn lịch Billing (Calendar Known Billing Month)**: Khi một tháng đã có dữ liệu Billing gốc trong cache nhưng không có dòng đơn hoàn thành nào rơi vào khoảng ngày lọc chi tiết, hệ thống ghi nhận các ngày được chọn có doanh thu 0 đ thay vì báo thiếu nguồn toàn bộ tháng. Nếu tháng hoàn toàn vắng bóng dữ liệu Billing trong cache, cảnh báo thiếu nguồn vẫn được duy trì nghiêm ngặt.
  * Tự động khởi tạo mặc định từ ngày đầu tiên đến ngày cuối cùng của tháng hiện tại theo GMT+7 (kể cả khi chưa có dữ liệu cache).
  * Lọc chặt chẽ: Doanh thu hoàn thành đơn (Billing) được lọc theo ngày hoàn thành; kỳ chi trả (Payout) được lọc theo ngày tạo/ngày tiền về TRƯỚC khi tổng hợp. Bảng kê theo ngày và file xuất CSV/Excel chỉ bao gồm các ngày trong khoảng đã chọn.
* **Bảng Sổ tay thuế tổng hợp theo tháng**:
  * **HH gộp**: Tiền sàn trả chưa trừ phí (`eligibleTotalAmount` / `eligible_total_amount_dis`).
  * **Phí MCN**: Phí quản lý mạng lưới nếu có tham gia MCN (`mcn_management_fee_dis`).
  * **Sau MCN**: `HH gộp` - `Phí MCN`.
  * **Phí DV (HĐ)**: Phí dịch vụ theo hóa đơn GTGT điện tử chính thức từ `service_fee_invoice`. Áp dụng đè lên cả các tháng có Payout. Khi chưa có HĐ (như tháng hiện tại), hiển thị rõ "Chưa có HĐ" thay vì tính ước lượng 0,98%. Khi chọn khoảng ngày một phần tháng, hiển thị "-" để tránh tính phí tháng dở dang.
  * **Sau phí HĐ**: `Sau MCN` - `Phí DV (HĐ)`. Khi chưa có hóa đơn hoặc khoảng lọc dở dang, hiển thị "-".
  * **10% TNCN (ước tính)**: Thuế TNCN vãng lai (áp dụng cho kỳ trước 10/2026 hoặc ước tính).
  * **5% GTGT & 5% TNCN (ước tính)**: Nghĩa vụ thuế theo mô hình Hộ kinh doanh (áp dụng từ 10/2026).
  * **Thực nhận (Payout)**: Số tiền thực nhận ghi nhận trên kỳ chi trả Payout của Shopee (không bị thay đổi bởi việc áp hóa đơn phí).
  * **Dòng Tổng cộng**: Hiển thị tổng lũy kế; nếu có tháng chưa đủ HĐ hoặc khoảng lọc dở dang, cột phí hiển thị "Chưa đủ HĐ" (không tự cộng tháng thiếu bằng 0).
* **Bảng kê chi tiết doanh thu theo ngày (Mẫu kê khai)**:
  * Trình bày dạng bảng với 3 cột chuẩn:
    * `Ngày tháng` (định dạng đầy đủ `dd/mm/yyyy`, múi giờ GMT+7, ví dụ `01/10/2026`)
    * `Diễn giải` (*"Doanh thu từ Shopee"*)
    * `Số tiền` (*Doanh thu tiền sàn trả chưa trừ phí theo ngày hoàn thành đơn trong khoảng lọc*)
  * Từng tháng có dòng tiêu đề `Tháng mm/yyyy` và dòng tổng kết `Tổng Doanh Thu` in đậm cộng dồn chính xác doanh thu billing thực tế của các ngày được chọn.
  * Hiển thị thông báo trực quan khi tháng chỉ có dữ liệu Payout mà thiếu dữ liệu billing theo ngày.
* **Xuất Sổ doanh thu bán hàng hóa, dịch vụ (Mẫu S1a-HKD - Thông tư 152/2025/TT-BTC)**:
  * Chuẩn hóa theo biểu mẫu chính thức ban hành tại Phụ lục Thông tư số **152/2025/TT-BTC** ngày 31/12/2025 của Bộ trưởng Bộ Tài chính (có hiệu lực từ ngày **01/01/2026**).
  * Bảng 3 cột chuẩn biểu mẫu: Cột A (*Ngày, tháng*), Cột B (*Diễn giải*), Cột 1 (*Số tiền*); dòng *Tổng cộng*.
  * Hỗ trợ xuất trực tiếp cả **3 định dạng cùng chung mô hình sổ sách đã kiểm chứng**:
    1. **Xuất Excel thật (.xlsx)**: File OOXML ZIP package chuẩn Microsoft Excel, định dạng số `#,##0`, căn chỉnh viền, tiêu đề in đậm.
    2. **Xuất Word thật (.docx)**: File OOXML ZIP package chuẩn Microsoft Word A4, phông chữ Times New Roman, lặp lại tiêu đề bảng ở mỗi trang (`<w:tblHeader/>`), chống cắt ngang dòng (`<w:cantSplit/>`), khối ký tên đại diện hộ kinh doanh.
    3. **In / Lưu PDF**: Sử dụng CSS in ấn `@media print` và hộp thoại `window.print()` chuẩn trình duyệt.
  * Sinh file thuần trình duyệt thông qua module `s1a_export.js` (tính toán mã kiểm tra CRC-32 và đóng gói ZIP Stored trực tiếp bằng chuẩn JavaScript/TextEncoder/Uint8Array, không tải thư viện ngoài, không gửi dữ liệu ra khỏi thiết bị).
  * Căn cứ số liệu chính thức:
    * **Kỳ chi trả Payout Record (Chính thức)**: Lấy hoa hồng gộp (`eligibleTotalAmount`) từ [Shopee Affiliate Payout Record](https://affiliate.shopee.vn/payment/payout_record) TRƯỚC mọi khoản giảm trừ: không trừ phí quản lý MCN, không trừ phí dịch vụ Shopee, không khấu trừ thuế GTGT hay TNCN. Số liệu hoàn toàn độc lập với chế độ tính thuế cá nhân hay hộ kinh doanh. Thời điểm ghi nhận: ngày tạo kỳ chi trả (`payoutCreatedTime`), fallback sang ngày tiền về (`payArrivalTime`) chỉ khi thiếu `payoutCreatedTime`.
  * Tùy chọn phương pháp ghi sổ: Ghi tổng định kỳ ngày cuối tháng (mặc định) hoặc ghi chi tiết theo từng kỳ chi trả phát sinh.
  * Cơ chế bảo vệ dữ liệu nghiêm ngặt: Liệt kê đầy đủ từng tháng theo lịch giữa các điểm mút chọn, phát hiện và chặn các khoảng trống lịch (calendar gaps); chống nhân đôi số tiền khi trùng lặp `payoutId` và phát hiện xung đột trùng ID khác số tiền; bảo lưu số 0 hợp lệ nếu có kỳ chi trả 0 đ; chặn xuất file và in nếu dữ liệu không hợp lệ.
  * Lưu trữ thông tin định danh cục bộ: Toàn bộ thông tin Họ tên, Địa chỉ, Mã số thuế, Địa điểm kinh doanh được lưu riêng trên trình duyệt qua `chrome.storage.local` (khóa `shopee_affiliate_s1a_profile`), không truyền qua mạng, an toàn tuyệt đối và tự động điền lại khi mở trang.
* **Xuất file Bảng kê doanh thu Excel (.xls) và CSV (.csv)**:
  * **File Excel (.xls)**: Định dạng chuẩn SpreadsheetML với đường viền (borders), tiêu đề in đậm, cột ngày dạng String `dd/mm/yyyy`, định dạng số có dấu phân cách hàng nghìn (`#,##0`).
  * **File CSV (.csv)**: Chuẩn UTF-8 có BOM (`\uFEFF`) với cột ngày `dd/mm/yyyy`, mở trực tiếp trên Microsoft Excel và Google Sheets không bị lỗi font tiếng Việt.
  * Tự động ngăn chặn xuất file nếu bất kỳ tháng nào trong khoảng được chọn thiếu dữ liệu billing theo ngày để tránh tạo ra file thiếu dữ liệu hoặc gây hiểu nhầm.
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

### 3.1. Phân định cơ chế thuế theo mốc thời gian & Nguồn dữ liệu chuẩn

* **Nguồn dữ liệu tổng hợp theo tháng (Payout Record là chuẩn khi có kỳ chi trả)**:
  * GraphQL `getPaymentPayoutBillingList` trả về `payoutList[].paymentPayout` gồm 2 số tiền chính: `eligibleTotalAmount` (Tiền sàn trả - Gross) và `totalPaymentAmount` (Thực nhận về TK), định dạng **micro-unit (x100.000)** (ví dụ `"7179000000"` = 71.790 đ) và được quy đổi về số nguyên VND khi hiển thị.
  * Tháng **có** kỳ chi trả Payout => tổng hợp theo từng bill (chuẩn đối soát dòng tiền thực nhận về tài khoản ngân hàng).
  * Tháng **không có** kỳ chi trả Payout => fallback tổng hợp theo `billing_list` (ngày hoàn thành đơn).
* **Phân rã từng kỳ chi trả (reconciliation)** — suy luận từ chênh lệch `diff = Gross - Thực nhận`:
  * `diff ≈ 10,98% × Gross` => kỳ khấu trừ thuế: `5% VAT = 5% PIT = round(5% × Gross)`, `Phí DV = phần còn lại` (xấp xỉ 0,98%).
  * `diff ≈ 0,98% × Gross` => kỳ dưới ngưỡng/chưa trừ thuế: `Phí DV = diff`, `VAT = PIT = 0`.
  * `Phí DV 0,98%` được ghi nhận theo dữ liệu fixture kiểm định tháng 10/2026 (2.032 đ trên 5 kỳ - mẫu đối soát ngày 22/10/2026).
* **Giai đoạn trước Tháng 10/2026** (đối soát và fallback):
  * Phí DV 0,98% theo `service_fee` hoặc chênh lệch `Sau MCN` - `billTotal`.
  * Thuế khấu trừ vãng lai 10% TNCN chỉ hiển thị khi API thực tế có trừ (`wht_amount` / kỳ chi trả có phần dư sau phí) - không tự ý fix cứng 10%.
* **Giai đoạn từ Tháng 10/2026 trở đi (Theo dữ liệu đối soát mẫu)**:
  * Khấu trừ tại nguồn được phân định thành 2 khoản:
    * **5% Thuế Giá trị gia tăng (VAT / GTGT)**
    * **5% Thuế Thu nhập cá nhân (PIT / TNCN)**
    * **10% TNCN (vãng lai) = 0 đ** (không gộp chung như trước).
  * **Thực nhận về TK = Doanh thu hợp lệ - 5% VAT - 5% PIT** (trong đó VAT và PIT đều được khấu trừ 5% Gross mỗi loại trên từng kỳ thanh toán đạt ngưỡng; khớp với số liệu fixture kiểm định 5 kỳ thanh toán tháng 10/2026 ở mục 3.4).

### 3.2. Bảng quy chuẩn các khoản mục & Tính bất biến theo nguồn dữ liệu (Per-Source Invariants)

Để đảm bảo tính nhất quán giữa **Popup Extension** và trang **Sổ tay thuế toàn màn hình**:

* **Chế độ xem tài chính tháng vs Sổ S1a-HKD (Quy tắc nguồn dữ liệu)**:
  * **Sổ S1a-HKD (Mẫu Thông tư 152/2025/TT-BTC)**: **TUYỆT ĐỐI KHÔNG FALLBACK VỀ BILLING**. Sổ S1a chỉ chấp nhận nguồn duy nhất là **Payout Record** (`eligibleTotalAmount`) cho toàn bộ các tháng được chọn. Nếu bất kỳ tháng nào trong khoảng chọn bị thiếu dữ liệu Payout, S1a sẽ lập tức chặn lập sổ, hiển thị cảnh báo nêu rõ các tháng thiếu và vô hiệu hóa nút in để tránh sai lệch chứng từ kế toán.
  * **Các chế độ xem tài chính tháng (Bảng 10 cột, Bảng đơn giản, Summary Cards)**: Ưu tiên tuyệt đối **Payout Record** cho **MỌI tháng có dữ liệu Payout** theo hoa hồng gộp `eligibleTotalAmount` (micro-unit ÷ 100.000) trước mọi khoản phí và thuế. Chỉ khi một tháng hoàn toàn vắng bóng dữ liệu Payout, hệ thống mới kích hoạt chế độ **Fallback theo Ngày hoàn thành đơn (Billing)** và gắn nhãn hiển thị trực quan `[Billing (Fallback)]`.
  Bảo toàn 2 đẳng thức kế toán cơ bản ở từng dòng tháng và dòng Tổng cộng:
  1. `Sau MCN` - `Phí DV 0,98%` = `Thực nhận theo bill`
  2. `Thực nhận theo bill` - `10% TNCN (vãng lai)` - `5% GTGT` - `5% TNCN (KD)` = `Ước thực về TK`

* **Mô hình Hai hệ lịch độc lập (Two Calendars Model)**:
  1. **Lịch hoàn thành đơn (Completion Calendar - Billing List)**: Ngày đơn hàng được khách nhận và hệ thống xác nhận giao dịch thành công (`billing_list.order_completed_period_start_time`). Dùng độc lập cho **Bảng kê chi tiết theo ngày** và xuất file Excel/CSV. Chân bảng ngày luôn tổng kết chính xác doanh thu billing thực tế của các ngày trong tháng.
  2. **Lịch chi trả tiền mặt (Cash Payment Calendar - Payout Record)**: Thời điểm Shopee tạo kỳ thanh toán và đối soát giải ngân hoa hồng (`paymentPayout.payoutCreatedTime` / `payArrivalTime`). Dùng cho **Sổ S1a-HKD**, **Bảng 10 cột**, **Bảng đơn giản** và các **Card tổng doanh thu**.
  Do độ lệch chu kỳ thanh toán tự nhiên giữa hai thời điểm (đơn giao cuối tháng được thanh toán vào các đợt của tháng tiếp theo), tổng doanh thu theo ngày hoàn thành đơn và tổng Payout Gross trong cùng một tháng có thể chênh lệch hợp lệ. Giao diện trang đầy đủ và popup cung cấp khối **Đối soát doanh thu gộp (Compact Reconciliation)** chỉ hiển thị chênh lệch có dấu `Chênh lệch (Kỳ chi trả - Hoàn thành đơn)` khi cả hai nguồn đều đầy đủ; nếu thiếu một trong hai nguồn, hệ thống gắn nhãn chưa đầy đủ thay vì tính chênh lệch sai lệch.

* **Minh họa kiểm định thực tế tháng 03/2026 (Minh họa từ ảnh chụp màn hình)**:
  * Doanh thu theo ngày hoàn thành đơn (Billing daily): **996.667 đ**
  * Doanh thu theo kỳ chi trả thực tế (Payout gross): **1.135.331 đ** (micro-unit: `113533100000`)
  * Chênh lệch đối soát thực tế: **+138.664 đ**
  * Khớp chuẩn: Cả Sổ S1a-HKD, Sổ tay thuế 10 cột, Chế độ đơn giản và Card Popup đều thống nhất ghi nhận Doanh thu gộp tháng 03/2026 là **1.135.331 đ**; trong khi bảng kê chi tiết theo ngày giữ nguyên **996.667 đ**.
  * *Lưu ý quan trọng*: Ảnh chụp màn hình của người dùng chỉ cung cấp và xác thực 3 số liệu: Billing hoàn thành (996.667 đ), Payout gộp (1.135.331 đ) và chênh lệch (+138.664 đ). Các con số Net 1.070.000 đ hay phí MCN 50.000 đ sử dụng trong bài kiểm thử mã nguồn (`test_18`) hoàn toàn là **dữ liệu giả lập nhân tạo (synthetic fixture)** phục vụ kiểm thử tính toán phân rã khấu trừ, không phải số liệu Net thực tế của người dùng. Ảnh chụp màn hình chỉ là minh họa đối soát quan sát được, không thay thế cho kiểm tra trực tiếp trên portal Shopee live.

| Khoản mục | Quy tắc tính trước 10/2026 | Quy tắc tính từ 10/2026 (theo Payout Record) | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Doanh thu (HH gộp)** | Tổng `eligibleTotalAmount` (Payout) hoặc fallback `eligible_total_amount_dis` (Billing) | Tổng `eligibleTotalAmount` (micro-unit ÷ 100.000) | Tiền sàn trả chưa trừ bất kỳ phí hay thuế nào. Đơn vị VND. Luôn ưu tiên Payout Record cho mọi tháng có dữ liệu Payout; fallback Billing chỉ kích hoạt khi không có Payout. |
| **Phí MCN** | `mcn_management_fee_dis` | `payoutValidationInfo.mcnManagementFee` (nếu có) | Phí quản lý mạng lưới nếu có tham gia MCN. |
| **Sau MCN** | `HH gộp` - `Phí MCN` | `HH gộp` - `Phí MCN` | Số tiền cơ sở sau khi trừ MCN. |
| **Phí DV 0,98%** | Lấy theo `service_fee_dis` hoặc chênh lệch giữa `Sau MCN` và `billTotal` | Suy luận từ chênh lệch: `diff` khi kỳ chưa trừ thuế, `diff - 2×VAT` khi kỳ đã trừ thuế | Ví dụ mẫu tháng 10/2026: Phí DV = 2.032 đ trên 5 kỳ. |
| **Thực nhận bill** | `Sau MCN` - `Phí DV 0,98%` | `Sau MCN` - `Phí DV 0,98%` | Doanh thu hợp lệ trước khi trừ thuế khấu trừ tại nguồn. |
| **10% TNCN (vãng lai)** | Theo phần dư sau phí của kỳ chi trả (**0 đ** nếu dưới ngưỡng) | **0 đ** | Từ 10/2026 đã tách riêng thành 5% VAT và 5% PIT. |
| **5% GTGT** | 0 đ (hoặc 5% nếu chọn chế độ HKD) | **round(5% × Gross)** theo từng kỳ | Thuế GTGT khấu trừ tại nguồn. |
| **5% TNCN (KD/PIT)** | 0 đ (hoặc 5% nếu chọn chế độ HKD) | **round(5% × Gross)** theo từng kỳ (kể cả quy tắc làm tròn half-up 3.589,5 → 3.590) | Thuế TNCN khấu trừ tại nguồn. |
| **Ước thực về TK** | `Thực nhận bill` - các loại thuế khấu trừ | Lấy trực tiếp `totalPaymentAmount` của từng kỳ | Khớp chính xác giữa Tab Đơn giản, Tab Chi tiết và Card Thống kê. |

### 3.3. Cơ chế Hóa đơn phí dịch vụ (service_fee_invoice) & Đối soát thanh toán

> [!NOTE]
> Để xem chi tiết các mẫu payload thực tế từ Shopee Affiliate API (GraphQL Payout, Billing List REST, Service Fee Invoice GraphQL/REST) cùng quy tắc thang tỷ lệ tiền tệ (`x100000` vs `_dis`), vui lòng tham khảo tài liệu [docs/SHOPEE_RESPONSE_CONTRACTS.md](SHOPEE_RESPONSE_CONTRACTS.md).
> Để xem so sánh kiến trúc đối soát thanh toán và tham chiếu sổ S1a ngoại tuyến, vui lòng xem tài liệu [docs/REA_PAYMENT_HISTORY_REFERENCE.md](REA_PAYMENT_HISTORY_REFERENCE.md).

Trang `https://affiliate.shopee.vn/payment/service_fee_invoice` là nơi Shopee lưu trữ các **Hóa đơn điện tử GTGT (e-Invoice)** phát hành cho Publisher.

1. **Nguồn API GraphQL chính thức của portal**:
   * **Endpoint**: `POST /api/v3/gql?q=getPaymentSummaryBillFeeInvoiceList`
   * **Operation**: `GetPaymentSummaryBillFeeInvoiceListQuery`
   * **Query**:
     ```graphql
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
     }
     ```
   * **Phân trang & Bền vững (Pagination & Resilience)**: Tự động lặp qua các trang (`pageNum = 1, 2, ...`) dựa trên `totalCount` và `pageSize` thực tế trả về (giới hạn tối đa 20 trang, pageSize 50). Khử trùng lặp theo `paymentCompletePeriodStartTime` và `invoiceNumber`. Áp dụng pacing ngẫu nhiên (0.4s - 1.2s) và circuit breaker dừng sau 2 lỗi 403.
   * **Bảo toàn dữ liệu khi đồng bộ dở dang (Incomplete Sync Fallback)**: Nếu quá trình gọi GraphQL bị lỗi xác thực (401/403) hoặc gián đoạn mạng, giao diện hiển thị cảnh báo đồng bộ chưa hoàn tất và tự động bảo lưu danh sách hóa đơn đã lưu trong cache trước đó, không coi lỗi là thành công và không xóa mất hóa đơn cũ.

2. **Bảng đối soát Hóa đơn điện tử (Fixture kiểm định 9 tháng đầu năm 2026)**:

| Tháng hoàn thành đơn | Số tiền Phí DV 0,98% | Số Hóa đơn GTGT | Trạng thái HĐ | Doanh thu hoàn thành đơn tương ứng |
| :---: | :---: | :---: | :---: | :---: |
| **01/2026** | **11.999 đ** | HĐ `741234` | Hợp lệ | 1.224.353 đ (Net: 1.212.354 đ) |
| **02/2026** | **6.838 đ** | HĐ `1600351` | Hợp lệ | 697.783 đ (Net: 690.945 đ) |
| **03/2026** | **9.767 đ** | HĐ `2790122` | Hợp lệ | 996.667 đ (Net: 986.900 đ) |
| **04/2026** | **5.709 đ** | HĐ `3320336` | Hợp lệ | 582.415 đ (Net: 576.706 đ) |
| **05/2026** | **6.349 đ** | HĐ `4085126` | Hợp lệ | 647.819 đ (Net: 641.470 đ) |
| **06/2026** | **3.371 đ** | HĐ `4606030` | Hợp lệ | 343.999 đ (Net: 340.628 đ) |
| **07/2026** | **4.437 đ** | HĐ `5867961` | Hợp lệ | 452.905 đ (Net: 448.468 đ) |
| **08/2026** | **6.517 đ** | HĐ `6702172` | Hợp lệ | 664.816 đ (Net: 658.299 đ) |
| **09/2026** | **4.499 đ** | HĐ `7581980` | Hợp lệ | 459.292 đ (Net: 454.793 đ) |
| **TỔNG CỘNG** | **59.486 đ** | **9 hóa đơn điện tử** | **Hợp lệ** | **6.070.049 đ (Net: 6.010.563 đ)** |

3. **Nguyên tắc phân định và hợp nhất Hóa đơn phí dịch vụ (service_fee_invoice)**:
   * **Xác định kỳ dịch vụ (Service Period Contract)**:
     * Kỳ dịch vụ của hóa đơn được xác định bởi mốc thời gian hoàn thành thanh toán kỳ đối soát (`paymentCompletePeriodStartTime` / `paymentCompletePeriodEndTime`) hoặc `monthKey` rõ ràng, **TUYỆT ĐỐI KHÔNG** căn cứ vào ngày phát hành hay ngày thanh toán và không trừ lùi 1 tháng mù quáng.
     * Ví dụ: Hóa đơn phát hành đầu tháng 11 nhưng có kỳ dịch vụ hoàn thành trong tháng 10 (`paymentCompletePeriodStartTime` thuộc tháng 10) sẽ được hạch toán chuẩn xác vào chi phí dịch vụ tháng 10.
   * **Hiệu lực pháp lý cao nhất (Authoritative Invoice Override)**:
     * Hóa đơn điện tử GTGT từ `service_fee_invoice` có giá trị pháp lý chính thức cao nhất cho toàn bộ tháng được chọn, áp dụng đè lên số phí dịch vụ ước lượng/suy luận cho **MỌI tháng có hóa đơn**, kể cả tháng đã có Payout Record (`hasPayout`).
     * Ví dụ: Tháng 03/2026 có hóa đơn điện tử 9.767 đ sẽ ghi nhận đúng 9.767 đ vào cột "Phí DV (HĐ)", thay vì giữ số suy luận 11.126 đ.
   * **Bảo toàn tính độc lập của Gross và Thực nhận Payout**:
     * Việc áp dụng hóa đơn phí dịch vụ **TUYỆT ĐỐI KHÔNG** tính toán lại số Thực nhận quan sát được (`netPaid` / `totalPaymentAmount`) từ Payout Record, và không tự tạo chênh lệch thuế giả định.
     * Cột "Sau phí HĐ" phản ánh `Sau MCN - Phí DV (HĐ)`; trong khi cột "Thực nhận (Payout)" phản ánh chính xác dòng tiền thực tế giải ngân về tài khoản.
   * **Hóa đơn 0 đ là hợp lệ**:
     * Hóa đơn phát hành có tổng phí dịch vụ bằng 0 đ (`totalServiceFee = 0`) là hợp lệ và được ghi nhận là 0 đ, không bị coi là thiếu dữ liệu.
   * **Xử lý tháng chưa có hóa đơn (Missing Invoices)**:
     * Tháng chưa có hóa đơn phát hành (ví dụ tháng 10 hiện tại) hiển thị rõ trạng thái `"Chưa có HĐ"` (`null`), không hiển thị 0 đ và không tự ý suy luận phí 0,98%.
   * **Xử lý khoảng ngày lọc một phần tháng (Partial Month Range)**:
     * Khi người dùng lọc khoảng ngày lẻ (không bao trọn vẹn từ ngày 01 đến ngày cuối cùng của tháng, ví dụ từ 10/09 đến 20/09), hệ thống **TUYỆT ĐỐI KHÔNG** chia tỷ lệ (prorate) hay khấu trừ phí của cả tháng vào doanh thu một phần ngày.
     * Cột "Phí DV (HĐ)" và "Sau phí HĐ" cho tháng bị lọc dở dang hiển thị `"-"` kèm ghi chú giải thích cần chọn đủ tháng để tính phí HĐ. Doanh thu Gross và Thực nhận Payout trong phạm vi ngày chọn vẫn hiển thị và sử dụng bình thường.
     * Chân bảng (Totals) khi có tháng thiếu hóa đơn hoặc lọc một phần tháng sẽ hiển thị `"Chưa đủ HĐ"`, tuyệt đối không cộng tháng chưa rõ bằng 0.
   * **Hành vi nạp / dán dữ liệu thủ công (Manual Import & Cache Preservation)**:
     * Khi dán bổ sung một tập con HĐ phí DV (ví dụ chỉ dán HĐ tháng 9), hệ thống chỉ cập nhật tháng 9 và **bảo toàn nguyên vẹn** các tháng HĐ đã lưu trước đó trong cache.
     * Khi dán danh sách hỗn hợp (vừa có HĐ phí vừa có Billing/Payout), phần doanh thu mới sẽ thay thế toàn bộ doanh thu cũ (tránh nhân đôi doanh thu khi dán lặp lại), trong khi các tháng HĐ chưa có trong lần dán này vẫn được giữ nguyên.
     * Khi dữ liệu dán vào rỗng (`[]`) hoặc cấu trúc không hợp lệ, hệ thống báo lỗi an toàn và **không xóa sạch** dữ liệu báo cáo hiện tại.
     * Khi dán thuần danh sách Payout hoặc Billing (không chứa HĐ phí), hệ thống thay thế toàn bộ theo đúng chủ đích cập nhật dữ liệu bảng kê.
   * **Cộng dồn và khử trùng lặp hóa đơn trong cùng một tháng (Unique Fee Accumulation & Deduplication)**:
     * Khi một tháng hoàn thành đơn có nhiều hóa đơn phí DV riêng biệt, hệ thống cộng dồn tổng phí của các hóa đơn này vào tháng tương ứng trên cả hai giao diện Popup và Tax Report.
     * Tự động khử trùng lặp theo định danh hóa đơn (`invoiceNumber + month`, fallback `periodStartTime + fee + month`) để đảm bảo không ghi đè mất phí khi có nhiều hóa đơn khác nhau đồng thời không cộng dồn trùng lặp nếu hóa đơn bị nạp lại.

4. **Bản chất của Hóa đơn phí dịch vụ**:
   * Khi bạn tham gia Shopee Affiliate, Shopee (Công ty TNHH Shopee) đóng vai trò là đơn vị cung cấp hạ tầng công nghệ và hệ thống tiếp thị. Đổi lại, Shopee thu một khoản phí dịch vụ nền tảng.
   * Theo quy định của Luật Quản lý Thuế và Nghị định 123/2020/NĐ-CP, khi Shopee thu khoản phí này, Shopee **bắt buộc phải xuất hóa đơn GTGT hợp pháp** cho Publisher.
   * **Phân định Gross và Net (Gross vs Net)**: Khoản phí dịch vụ này được trừ khỏi doanh thu Gross để xác định số tiền thanh toán Net. Trong dữ liệu đối soát và calculator, *"Tiền sàn trả"* (`eligible_total_amount_dis` / `eligibleTotalAmount`) phản ánh doanh thu Gross; còn `total_payment_amount` / `totalPaymentAmount` là doanh thu Net sau khi khấu trừ phí dịch vụ nền tảng. Phân định rõ hai giá trị này nhằm tránh việc khấu trừ trùng lặp phí dịch vụ (double fee deduction).
   * **Tách biệt dòng tiền và chứng từ thuế**:
     * `payout_record`: Là **sổ luân chuyển tiền mặt** (Cash Payout), ghi nhận số tiền chuyển khoản về tài khoản ngân hàng và nghĩa vụ thuế Shopee nộp thay (PIT/VAT).
     * `service_fee_invoice`: Là **kho chứng từ thuế** (Tax Accounting), phục vụ cho Publisher làm Hộ kinh doanh hoặc Doanh nghiệp lấy hóa đơn đầu vào để hạch toán chi phí hợp lý khi quyết toán thuế.

### 3.4. Phân biệt Dữ liệu Payout Record (Ngày thanh toán) và Billing List (Ngày hoàn thành đơn)

Extension phân định độc lập và chuẩn hóa hai nguồn dữ liệu chính từ Shopee Affiliate:

1. **Theo Lịch sử thanh toán (`payment/payout_record` - Khuyên dùng cho Sổ tay thuế & Đối soát dòng tiền về TK)**:
   * **Nguồn API**: GraphQL `getPaymentPayoutBillingList` (`POST /api/v3/gql?q=getPayoutList`, `operationName: "getPaymentPayoutBillingList"`, variables `{pageSize, pageNum}`, headers `Content-Type`, `CSRF-token`, `Affiliate-Program-Type`, `credentials: include`) hoặc chi tiết từng bill `getPayoutDetail`.
   * **Chạy trong ngữ cảnh trang (world: "MAIN")**: request được inject chạy trong world chính của trang affiliate — giống hệt cách portal tự gọi, nhờ vậy fetch nội bộ của portal tự bổ sung header cần thiết. Mặc định không gửi header CSRF khi chưa có token; ghi nhận tham chiếu lịch sử (historical fixture/reference, không phải kiểm định trực tiếp ở tác vụ hiện tại) từng quan sát POST thành công với `{__typename}` và query đầy đủ 98 kỳ. Khi đã có token hợp lệ được cấp từ server/config hoặc response header, token này được tái sử dụng ngay cho các trang Payout và Invoice tiếp theo (bao gồm cơ chế tự động xoay vòng token qua response header), đồng thời duy trì anti-bot pacing và circuit breaker dừng sau 2 lỗi 403 thực tế. Khi server trả thử thách 403/401, hệ thống kích hoạt quy trình dò tìm có giới hạn và thử lại.
   * **Chuỗi dự phòng CSRF (fix HTTP 403)**: nếu gặp 403/401, extension tìm token chuẩn theo đúng cơ chế portal (module config client): (1) rà localStorage của ConfigClient, (2) `GET /api/v3/config/website`, (3) **response header `csrf-token`** từ bất kỳ response `/api/v3` nào (portal tự rotate token qua header này), và phương án cuối là cookie `csrftoken`. Sau đó retry POST với header `CSRF-token`.
   * **Lưu ý**: token CSRF của `/api/v3` **do server cấp qua config/website và response header**, không phải giá trị cookie `csrftoken` — gửi sai giá trị này gây **HTTP 403**, tốt hơn là không gửi header nào.
   * **Phân trang**: portal mặc định trả ~10 kỳ/trang (hỗ trợ tối đa 50); extension lặp `pageNum` (pageSize 50, tối đa 20 trang) cho tới khi đủ `pagination.totalCount`, khử trùng lặp bằng `payoutId`. Tuân thủ anti-bot pacing (nghỉ ngẫu nhiên 0.4s - 1.2s giữa các trang và circuit breaker dừng sau 2 lỗi 403).
   * **Schema thật của portal (payout_record)**:
     * `paymentPayout`: `accountType`, `eligibleTotalAmount`, `payoutCreatedTime`, `payoutId`, `totalPaymentAmount`, `payoutPaymentStatus`, `paidFailedReasonType`, `payArrivalTime`, `transferredToOffline`, `cancelReason`, `cancelType`, `closeReason`. **KHÔNG có** `totalServiceFee`, `taxTotalAmount`, `vatTotalAmount`, `whtTotalAmount`, `vatRate`, `whtRate`.
     * `payoutInvoice`: bắt buộc khai báo subfield selection `{ invoiceType invoiceStatus dismissReason }` để thỏa mãn cú pháp GraphQL, tránh lỗi `Field must have a selection of subfields`.
     * `payoutExternalInfo`: `{ mergeInvoiceStatus serviceFeeInvoiceStatus }`.
   * **Hỗ trợ dán thủ công (Paste Modal)**: cho phép dán trực tiếp bảng sao kê text/tab hoặc JSON từ Shopee. Parser tự bóc tách `dateStr` trước để tránh năm 4 chữ số (vd: 2026) bị khớp nhầm vào ID thanh toán hoặc cột tiền. Tự động nhận diện cột Phí dịch vụ hoặc Doanh thu hợp lệ theo tỷ lệ so với Gross.
   * **Bản chất**: Phản ánh dòng tiền thực nhận về tài khoản ngân hàng theo thời điểm chi trả (`payoutCreatedTime` / `payArrivalTime`).
   * **Số liệu fixture đối soát mẫu tháng 10/2026 (5 kỳ thanh toán)**:
     > [!NOTE]
     > Bảng dưới đây là fixture đối soát mẫu dùng để kiểm thử tự động thuật toán phân rã thuế/phí và kiểm định hồi quy trong môi trường phát triển cục bộ.
     * **Kỳ 01-10-2026** (Mã `...1001`): Thực nhận **23.331 đ** (Doanh thu các ngày cuối tháng 9 dưới ngưỡng khấu trừ, **chưa trừ thuế PIT và VAT -> Thuế = 0 đ**).
     * **Kỳ 05-10-2026** (Mã `...1005`): Doanh thu hợp lệ 37.854 đ, **5% VAT: -1.912 đ, 5% PIT: -1.912 đ**, Thực nhận: **34.030 đ**.
     * **Kỳ 08-10-2026** (Mã `...1008`): Doanh thu hợp lệ 49.496 đ, **5% VAT: -2.499 đ, 5% PIT: -2.499 đ**, Thực nhận: **44.498 đ**.
     * **Kỳ 12-10-2026** (Mã `...1012`): Doanh thu hợp lệ 23.489 đ, **5% VAT: -1.186 đ, 5% PIT: -1.186 đ**, Thực nhận: **21.117 đ**.
     * **Kỳ 19-10-2026** (Mã `...1019`): Doanh thu hợp lệ 71.086 đ, **5% VAT: -3.590 đ, 5% PIT: -3.590 đ**, Thực nhận: **63.906 đ**.
     * **Tổng Sau thuế (Thực nhận về TK)** = `23.331 + 34.030 + 44.498 + 21.117 + 63.906` = **186.882 đ**.
     * **Tổng Thuế PIT (TNCN)** = `0 + 1.912 + 2.499 + 1.186 + 3.590` = **9.187 đ**.
     * **Tổng Thuế VAT (GTGT)** = `0 + 1.912 + 2.499 + 1.186 + 3.590` = **9.187 đ**.
     * **Tổng 2 khoản thuế** = `9.187 + 9.187` = **18.374 đ**.
     * **Tổng doanh thu hợp lệ trước thuế** = `186.882 + 18.374` = **205.256 đ**.
     * **Tổng tiền sàn trả cơ sở (Gross)** = **207.288 đ** *(trước phí dịch vụ sàn 0.98% là 2.032 đ)*.

   * **Bảng fixture đối soát mẫu công thức (Tháng 10/2026)**:

| Ngày tạo bill | Mã thanh toán | Tiền sàn trả (Gross) | Phí DV 0,98% | Doanh thu hợp lệ | 5% VAT | 5% PIT (TNCN) | Thực nhận sau thuế |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **01-10-2026** | `...1001` | 23.562 đ | 231 đ | 23.331 đ | 0 đ | 0 đ | **23.331 đ** |
| **05-10-2026** | `...1005` | 38.230 đ | 376 đ | 37.854 đ | 1.912 đ | 1.912 đ | **34.030 đ** |
| **08-10-2026** | `...1008` | 49.985 đ | 489 đ | 49.496 đ | 2.499 đ | 2.499 đ | **44.498 đ** |
| **12-10-2026** | `...1012` | 23.721 đ | 232 đ | 23.489 đ | 1.186 đ | 1.186 đ | **21.117 đ** |
| **19-10-2026** | `...1019` | 71.790 đ | 704 đ | 71.086 đ | 3.590 đ | 3.590 đ | **63.906 đ** |
| **TỔNG CỘNG** | **5 kỳ** | **207.288 đ** | **2.032 đ** | **205.256 đ** | **9.187 đ** | **9.187 đ** | **186.882 đ** |

   * **Các hệ thức kiểm định bất biến (Invariants)**:
     1. `Doanh thu hợp lệ` = `Tiền sàn trả (Gross)` - `Phí DV 0,98%`: `207.288 đ - 2.032 đ = 205.256 đ`
     2. `Thực nhận sau thuế` = `Doanh thu hợp lệ` - `5% VAT` - `5% PIT`: `205.256 đ - 9.187 đ - 9.187 đ = 186.882 đ`
     3. `Doanh thu trước thuế (Hợp lệ)` = `Thực nhận sau thuế` + `5% VAT` + `5% PIT`: `186.882 đ + 9.187 đ + 9.187 đ = 205.256 đ`
     4. Riêng kỳ **01-10-2026** chưa trừ thuế PIT và VAT (thuộc doanh thu cuối tháng 9 dưới ngưỡng khấu trừ): VAT = 0 đ, PIT = 0 đ, Thực nhận = 23.331 đ.

2. **Theo Ngày hoàn thành đơn hàng (`payment/billing` - Chuẩn Kê khai doanh thu theo ngày)**:
   * **Nguồn API**: `/api/v3/payment/billing_list` lọc theo `order_completed_period_start_time`.
   * **Bản chất**: Phản ánh hoa hồng từ đơn hàng thực tế của người mua đã hoàn thành theo từng ngày phát sinh (định dạng `dd/mm/yyyy` theo giờ GMT+7).
   * **Cơ sở ngày kết xuất**: Bảng kê chi tiết theo ngày trên giao diện web (Popup, Tax Report) và trong file xuất tải về (.xls/.csv) **luôn luôn sử dụng dữ liệu từ `billing_list`**, bất kể tháng đó có hay không có Payout Record.
   * **Bất biến tách biệt số liệu (Separation Invariant)**:
     * Tuyệt đối không bao giờ đưa số tiền thanh toán Payout hay ngày chi trả tiền mặt (`payoutCreatedTime`) vào các dòng doanh thu ngày hoàn thành đơn.
     * Nếu trong một ngày có nhiều dòng billing hoàn thành đơn khác nhau, hệ thống tự động cộng dồn doanh thu hợp lệ của ngày đó một cách nhất quán trên cả Popup và Tax Report.
     * Các dòng billing có doanh thu bằng 0 thực tế vẫn được bảo toàn nguyên vẹn.
   * **Chênh lệch hợp lệ giữa Doanh thu theo ngày và Doanh thu tháng**:
     * Do Shopee áp dụng chu kỳ đối soát và gom thanh toán (các đơn hoàn thành ở tuần hoặc tháng trước thường được thanh toán vào kỳ chi trả của tuần hoặc tháng kế tiếp), **tổng doanh thu các ngày hoàn thành đơn trong tháng (Billing) và tổng doanh thu tiền sàn trả (Payout Gross) của tháng đó có thể chênh lệch hợp lệ** và không bắt buộc phải bằng nhau.
     * Dòng tổng kết ở chân bảng kê chi tiết theo ngày (Daily Footer) luôn hiển thị tổng cộng số tiền từ các dòng billing theo ngày phát sinh hoàn thành đơn, chứ không lấy số tổng Gross của bảng Payout tháng.
   * **Xử lý khi thiếu dữ liệu ngày hoàn thành đơn (Payout-Only Month)**:
     * Nếu một tháng chỉ có dữ liệu thanh toán Payout mà chưa tải được dữ liệu `billing_list`, hệ thống hiển thị thông báo rõ ràng: *"Chưa có dữ liệu chi tiết theo ngày hoàn thành đơn cho tháng này (chỉ có dữ liệu thanh toán Payout)"*.
     * Hệ thống tuyệt đối không tự ý phân bổ doanh thu hay tạo ra lịch 31 ngày số 0 giả định để tránh kê khai sai lệch thông tin.
     * Khi người dùng xuất CSV hoặc Excel, nếu bất kỳ tháng nào trong khoảng được chọn thiếu dữ liệu billing, hệ thống sẽ ngăn chặn xuất file kèm thông báo liệt kê các tháng thiếu để tránh tạo file không trọn vẹn.
   * **Cơ chế lưu đệm Cache và bảo toàn dữ liệu khi đồng bộ thất bại (Data Loss Prevention & Cache Resilience)**:
     * **Bảo vệ toàn diện trên cả 3 điểm kích hoạt** (`tax_report.js`, `popup.js`, và `affiliate_content.js`):
       * **Khi API Payout thất bại (HTTP 403, 504, lỗi kết nối) trong khi Billing thành công**: Hệ thống **bảo lưu toàn bộ danh sách Payout lịch sử** đã lưu trong cache thay vì gán mảng rỗng `payouts = []`. Các kỳ thanh toán chuẩn (ví dụ kỳ tháng 03/2026 hoa hồng gộp 1.135.331 đ) vẫn tiếp tục khớp chính xác với Sổ S1a và Sổ tay thuế sau khi làm mới thất bại.
       * **Khi phân trang Payout dở dang (Partial Paging)**: Nếu tải được một số trang đầu nhưng các trang sau bị lỗi mạng hoặc circuit breaker, hệ thống cập nhật các kỳ mới tải và tự động gộp (merge) với các kỳ Payout cũ chưa có trong lần tải này, khử trùng lặp theo `payoutId`, không làm mất các kỳ thanh toán cũ ở các trang sau.
       * **Phân định rõ kết quả rỗng có thẩm quyền (Authoritative Empty) vs Lỗi đồng bộ**: Hệ thống chỉ xóa dữ liệu Payout cũ khi API Shopee phản hồi thành công và khẳng định chắc chắn không có bản ghi nào (`payoutSuccess: true`, `totalCount === 0`, `pList: []`). Mọi phản hồi lỗi kết nối, HTTP lỗi hoặc dữ liệu không rõ ràng/sai cấu trúc đều áp dụng cơ chế fail-closed: bảo toàn nguyên vẹn cache cũ để chống mất mát dữ liệu lịch sử.
       * **Bảo toàn Billing khi Payout thành công nhưng Billing lỗi**: Giữ nguyên danh sách billing ngày cũ và gắn cảnh báo tương ứng.
       * **0-Guard chống xóa trắng toàn diện**: Khi cả Billing và Payout đều không tải được dữ liệu, hệ thống tuyệt đối không ghi đè cache bằng danh sách rỗng nếu trước đó đã có dữ liệu hợp lệ.
     * **Lưu và phục hồi cảnh báo trực quan**: Ghi nhận cảnh báo (`cache.warnings`) vào metadata của cache. Khi người dùng mở lại báo cáo từ cache, giao diện tự động khôi phục và hiển thị cảnh báo để người dùng biết dữ liệu nào là mới, dữ liệu nào đang được bảo lưu từ phiên trước.
     * **Đếm rõ ràng bản ghi mới vs bản ghi giữ lại**: Trạng thái cập nhật hiển thị chi tiết số kỳ mới nạp và số kỳ cũ được giữ lại (ví dụ: `Giữ lại 1 kỳ thanh toán cũ`), không báo thành công giả mạo khi có nguồn bị lỗi.
     * **Quy chuẩn mốc thời gian bằng Giây (Seconds-Only Timestamp Contract)**: Toàn bộ API của cổng Shopee Affiliate (Payout `payoutCreatedTime`/`payArrivalTime`, Billing `order_completed_period_start_time`, Hóa đơn phí `paymentCompletePeriodStartTime`) đều sử dụng Unix epoch timestamp tính bằng **Giây** (10 chữ số, giai đoạn 2000–2100). Tất cả parser và hàm xử lý đều tuân thủ nghiêm ngặt chuẩn này và từ chối dứt khoát các timestamp tính bằng mili-giây (`>= 1e11`), số âm, số thập phân hoặc chuỗi không hợp lệ để ngăn ngừa sai lệch múi giờ hay hiển thị sai năm.
     * **Bảo toàn hiển thị khi in ấn (Print Tab Isolation)**: In bằng lệnh gốc trình duyệt (Ctrl+P) tự động bảo toàn nội dung tab đang mở (`.tab-content.active`), không tự ý ép nhảy sang Sổ S1a khi đang xem các tab khác. Nút bấm *“In / Lưu PDF”* chuyên dụng trên tab S1a tự động kích hoạt tab S1a trước khi mở hộp thoại in. Trạng thái lỗi (`body.s1a-has-error`) chặn in để tránh xuất sổ thiếu hợp lệ, và độ rộng bảng `calc(100% - 2px)` ngăn ngừa hiện tượng cắt xén viền phải trên giấy A4.

### 3.5. Quy chuẩn lập Sổ doanh thu bán hàng hóa, dịch vụ (Mẫu S1a-HKD theo Thông tư 152/2025/TT-BTC)

Căn cứ Thông tư số **152/2025/TT-BTC** ngày 31/12/2025 của Bộ trưởng Bộ Tài chính (có hiệu lực thi hành từ ngày **01/01/2026**; văn bản chính thức tại [Cổng TTĐT Chính phủ](https://vanban.chinhphu.vn/?pageid=27160&docid=216533)), Mẫu **S1a-HKD** (Trang 3 Phụ lục) là biểu mẫu chính thức ghi chép doanh thu bán hàng hóa, dịch vụ:

1. **Mục đích & Phạm vi áp dụng theo Thông tư**:
   * Sổ S1a-HKD được mở để ghi doanh thu bán hàng hóa, dịch vụ làm căn cứ kê khai, xác định hộ kinh doanh, cá nhân kinh doanh có thuộc đối tượng chịu thuế GTGT, nộp thuế TNCN theo quy định của pháp luật về thuế hay không.
   * Trường hợp hộ kinh doanh, cá nhân kinh doanh thực hiện kê khai doanh thu theo quy định của pháp luật về thuế thì có thể dùng sổ này để theo dõi, đối chiếu số liệu với cơ quan thuế.
   * Hệ thống tuân thủ nguyên văn văn bản quy phạm pháp luật, **không tự ý đặt ra ngưỡng 1 tỷ đồng** hay tự động phán đoán tư cách đủ điều kiện của người dùng.

2. **Công thức tính doanh thu & Tính độc lập số liệu**:
   * **Số tiền (Cột 1)** phản ánh số tiền bán hàng hóa, dịch vụ thực tế từ hoạt động Shopee Affiliate.
   * **Tính độc lập tuyệt đối**: Các chế độ tính thuế cố định trên giao diện (ví dụ 10% TNCN vãng lai hoặc 5% GTGT + 5% TNCN) **tuyệt đối không làm thay đổi số tiền doanh thu trên sổ S1a**.

3. **Nguồn dữ liệu & Căn cứ doanh thu Payout Gross (Source & Amount Basis)**:
   * **Nguồn duy nhất**: Báo cáo kỳ thanh toán Shopee Affiliate ([Payout Record](https://affiliate.shopee.vn/payment/payout_record)).
   * **Công thức**: `Số tiền` = Hoa hồng gộp (`eligibleTotalAmount`) TRƯỚC mọi khoản giảm trừ: không trừ phí quản lý MCN, không trừ phí dịch vụ Shopee (0.98%), không khấu trừ thuế GTGT hay TNCN (don't subtract anything). Số liệu hoàn toàn độc lập với chế độ tính thuế cá nhân hay hộ kinh doanh.
   * **Ngữ nghĩa ngày ghi sổ (Cột A)**: Lấy theo ngày tạo kỳ chi trả (`payoutCreatedTime`), quy đổi sang múi giờ Việt Nam (GMT+7, định dạng đầy đủ `dd/mm/yyyy`). Trường hợp không có `payoutCreatedTime` mới fallback sang ngày tiền về (`payArrivalTime`) và được ghi chú rõ ràng trên dòng diễn giải.
   * **Quy đổi đơn vị vi mô (Micro-Unit Contract)**: Trường `eligibleTotalAmount` trong API Shopee luôn ở dạng vi mô nhân 100.000 (ví dụ `1000000000` = 10.000 đ). Hệ thống chuyển đổi trực tiếp `Math.round(num / 100000)`, không áp dụng heuristic gây thổi phồng các khoản hoa hồng lẻ.
   * **Liệt kê đầy đủ tháng & Chặn khoảng trống (Calendar Gap Validation)**: Khoảng tháng được chọn luôn liệt kê tuần tự từng tháng theo lịch giữa hai điểm mút (ví dụ chọn từ 09/2026 đến 11/2026 thì tháng 10/2026 bắt buộc phải được kiểm tra). Nếu tháng trung gian không có dữ liệu, hệ thống lập tức cảnh báo và chặn lập sổ S1a cũng như chặn xuất file CSV/Excel, không bỏ qua ngầm.
   * **Chống trùng lặp & Chặn xung đột (Deduplication & Conflict Detection)**: Các bản ghi Payout có cùng `payoutId` và số liệu nhất quán sẽ được tự động khử trùng lặp (không làm tăng gấp đôi tổng doanh thu). Nếu phát hiện cùng `payoutId` nhưng khác số tiền hoặc ngày, hệ thống sẽ báo lỗi xung đột dữ liệu rõ ràng.
   * **Bảo toàn số 0 hợp lệ (Preserve Legitimate Zero)**: Kỳ chi trả có doanh thu 0 đ được ghi nhận hợp lệ; các trường hợp thiếu số tiền hoặc thời gian sẽ bị chặn lỗi chứ không tự gán số 0 giả tạo.

4. **Phương pháp ghi sổ (Grouping Methods)**:
   * **Ghi tổng theo tháng (Mặc định)**: Cột A ghi ngày cuối cùng của tháng (`dd/mm/yyyy`), Cột B ghi `Tổng doanh thu tháng mm/yyyy (gộp N dòng sổ)`, Cột 1 ghi tổng số tiền trong tháng. Dòng *Tổng cộng* bằng tổng lũy kế các tháng.
   * **Ghi chi tiết theo từng kỳ chi trả**: Liệt kê từng kỳ thanh toán theo thứ tự thời gian (`dd/mm/yyyy`), ghi rõ `Doanh thu Shopee Affiliate (Kỳ {payoutId} - ngày tạo kỳ chi trả)`. Tổng cộng của cách ghi chi tiết luôn khớp chính xác 100% với tổng cộng của cách ghi theo tháng.

5. **Hộp thoại Đối chiếu kỳ Payout (Read-only) & Minh chứng trường hợp 38.230 đ (`DEMO_PAYOUT_0005`)**:
   * **Đối chiếu trực tiếp từ S1a**: Tích hợp nút bấm **"🔍 Đối chiếu"** trên từng dòng kỳ Payout và bộ chọn nhanh trên thanh công cụ S1a, mở hộp thoại `<dialog>` gốc độc lập hoàn toàn ở chế độ chỉ đọc.
   * **Đối soát qua toàn bộ Cache (Whole Cache Join)**: Tự động liên kết các bản ghi Billing hoàn thành đơn thỏa mãn `String(Billing.payout_id).trim() === String(Payout.payoutId).trim()` từ **toàn bộ bộ nhớ đệm cache**, không bị cắt xén hay giới hạn bởi bộ lọc ngày của bảng Billing.
   * **Minh chứng trường hợp Payout 38.230 đ**:
     * Kỳ Payout `DEMO_PAYOUT_0005`: Ngày tạo `05/10/2026 02:00:07`, Ngày tiền về `08/10/2026 14:50:33`, HH gộp Payout (API): **38.230 đ**, Thực nhận Payout (API): **34.030 đ**.
     * Liên kết đầy đủ 4 bản ghi Billing hoàn thành đơn vắt ngang qua ranh giới tháng:
       - `30/09/2026` (`DEMO_VAL_0006`): Gross 7.002 đ, Giảm trừ 69 đ, Thực nhận Billing 6.933 đ.
       - `01/10/2026` (`DEMO_VAL_0007`): Gross 9.557 đ, Giảm trừ 94 đ, Thực nhận Billing 9.463 đ.
       - `02/10/2026` (`DEMO_VAL_0008`): Gross 19.671 đ, Giảm trừ 193 đ, Thực nhận Billing 19.478 đ.
       - `03/10/2026` (`DEMO_VAL_0004`): Gross 2.000 đ, Giảm trừ 20 đ, Thực nhận Billing 1.980 đ.
     * **Tổng hợp đối soát tài chính**:
       - Tổng HH gộp Billing: $7.002 + 9.557 + 19.671 + 2.000 = \mathbf{38.230 \text{ đ}}$ (khớp chính xác 100% với Payout Gross).
       - Tổng thực nhận Billing: $6.933 + 9.463 + 19.478 + 1.980 = \mathbf{37.854 \text{ đ}}$.
       - Giảm trừ tại Billing: $38.230 - 37.854 = \mathbf{376 \text{ đ}}$ (tổng làm tròn từng ngày $69 + 94 + 193 + 20$, khác 1 đ so với làm tròn 1 lần $38.230 \times 0.98\% = 375 \text{ đ}$).
       - Chênh lệch lúc chi trả: $37.854 - 34.030 = \mathbf{3.824 \text{ đ}}$ (khớp chính xác ảnh chụp đối soát thuế: $2 \times \text{round}(5\% \times 38.230) = 1.912 + 1.912 = 3.824 \text{ đ}$, trong khi $10\%$ của $38.230$ là $3.823 \text{ đ}$; API không trả trường thuế chi tiết, hệ thống chỉ hiển thị số chênh lệch quan sát được, không bịa đặt cấu trúc thuế giả mạo).
     * **Bảo vệ số liệu S1a**: Nếu thiếu dữ liệu Billing hoặc tổng Gross không khớp, hộp thoại hiển thị cảnh báo độ bao phủ rõ ràng nhưng **tuyệt đối không ghi đè số Gross 38.230 đ** của S1a. Nút đối chiếu và hộp thoại mang class `.no-print`, không tạo thêm cột thứ 4 vào biểu mẫu in ấn S1a và không làm thay đổi các file xuất OOXML (.xlsx, .docx) hay PDF.

6. **Hướng dẫn Xuất file Excel (.xlsx), Word (.docx) và In/Lưu PDF**:
   * Bước 1: Mở trang Sổ tay thuế `tax_report.html`, chọn khoảng ngày cần lập sổ (Từ ngày - Đến ngày).
   * Bước 2: Chuyển sang tab **“📑 Sổ S1a-HKD (TT 152/2025/TT-BTC)”**.
   * Bước 3: Điền các thông tin: Họ tên, Địa chỉ, Mã số thuế (để trống nếu tự điền khi ký tay); Địa điểm kinh doanh (mặc định: `Kinh doanh trên nền tảng số (Shopee Affiliate)`). Bấm **“💾 Lưu thông tin”** để lưu vào `chrome.storage.local` (chỉ lưu trên máy cá nhân, không gửi qua Internet).
   * Bước 4: Chọn Phương pháp ghi sổ (Tổng theo tháng hoặc Chi tiết theo kỳ chi trả).
   * Bước 5: Bấm nút xuất tương ứng:
     * **📊 Xuất Excel (.xlsx)**: Tải file `.xlsx` thật theo định dạng OOXML ZIP package, mở ngay trên Microsoft Excel / LibreOffice Calc với công thức số nguyên, viền kẻ và tiêu đề căn chỉnh hoàn chỉnh.
     * **📄 Xuất Word (.docx)**: Tải file `.docx` thật theo định dạng OOXML ZIP package, mở trên Microsoft Word / LibreOffice Writer chuẩn khổ giấy A4 dọc, phông chữ Times New Roman, lặp lại dòng tiêu đề bảng ở mỗi trang (`<w:tblHeader/>`), chống cắt xén dòng (`<w:cantSplit/>`), dòng chữ ký kế toán chuẩn xác.
     * **🖨️ In / Lưu PDF**: Trình duyệt sẽ mở hộp thoại In:
       * Mục *Máy in đích (Destination)*: Chọn **Lưu dưới dạng PDF (Save as PDF)**.
       * Khổ giấy: **A4**, hướng **Dọc (Portrait)**.
       * Bỏ chọn **"Tiêu đề đầu trang và chân trang"**.
       * Bấm **Lưu (Save)** để có bản in PDF sạch đẹp.

7. **Ghi chú khảo sát tham chiếu công khai (addlivetag static REA)**:
   * Dựa trên khảo sát tham chiếu công khai (addlivetag static REA evidence `ev_5bc1ce1e` `/tmp/shopee-s1a-reference`):
   * Trang tham chiếu công khai hoàn toàn tĩnh và không phơi bày cấu trúc nội bộ của tài khoản Shopee Affiliate; không can thiệp vào tài khoản Shopee nội bộ; không sao chép mã nguồn bên thứ ba; tuyệt đối không gửi cookie, token hay dữ liệu tài chính ra ngoài thiết bị.
   * Tùy chọn 'sau MCN' ở trang tham chiếu không được đè lên nguyên tắc cơ sở: Sổ S1a-HKD căn cứ trên Hoa hồng gộp (Gross `eligibleTotalAmount`) trước mọi khoản phí và thuế, theo đúng xác nhận chính thức của người dùng.
   * Không tự ý áp đặt các ngưỡng hay quy định pháp lý chưa được kiểm chứng; tuân thủ trung thực biểu mẫu chính thức TT 152/2025/TT-BTC.

8. **Giới hạn trách nhiệm & Pháp lý**:
   * Nguồn số liệu chỉ tổng hợp và đối soát từ hệ thống Shopee Affiliate Việt Nam.
   * Extension không có chức năng tự động nộp hồ sơ thuế điện tử tới Tổng cục Thuế. Người nộp thuế chịu trách nhiệm tự kiểm tra, đối chiếu số liệu và nộp hồ sơ kê khai theo đúng quy định hiện hành.

---

## 4. Cấu trúc file xuất (Excel & CSV)

Các file xuất CSV (`.csv`) và Excel SpreadsheetML (`.xls`) xuất bảng kê chi tiết theo ngày theo đúng định dạng ngày tháng `dd/mm/yyyy` (GMT+7) và dòng tiêu đề tháng có đầy đủ năm `Tháng mm/yyyy`:

```csv
Ngày tháng,Diễn giải,Số tiền
Tháng 01/2026,,
01/01/2026,Doanh thu từ Shopee,63384
02/01/2026,Doanh thu từ Shopee,16656
...
31/01/2026,Doanh thu từ Shopee,236105
,Tổng Doanh Thu,1224353

Tháng 10/2026,,
01/10/2026,Doanh thu từ Shopee,150000
...
26/10/2026,Doanh thu từ Shopee,250000
,Tổng Doanh Thu,400000
```

* **Ghi chú về định dạng file**:
  * Cột `Ngày tháng`: Luôn được đệm đủ 2 chữ số ngày và tháng (`dd/mm/yyyy`). Trong file Excel SpreadsheetML, ô ngày được đặt kiểu `String` để giữ nguyên định dạng hiển thị, không bị phần mềm tự động đảo sang `m/d/yyyy`.
  * Tiêu đề từng tháng: `Tháng mm/yyyy` (ví dụ `Tháng 10/2026`).
  * Dòng `Tổng Doanh Thu`: Luôn là tổng cộng số học của các dòng billing ngày trong tháng tương ứng.
  * Khi tháng không có dữ liệu billing: Tháng đó sẽ không xuất các dòng ngày giả lập (không gán doanh thu 0 hay tổng 0 giả tạo). Nếu khoảng thời gian được chọn có bất kỳ tháng nào thiếu billing, extension sẽ hiển thị cảnh báo liệt kê rõ các tháng thiếu và hủy thao tác tải xuống để bảo đảm tính toàn vẹn dữ liệu.

---

## 5. Hướng dẫn nạp lại dữ liệu & Cơ chế xử lý sự cố (Reload & Recovery)

1. **Làm mới dữ liệu từ Shopee**:
   * Mở tab [https://affiliate.shopee.vn/payment/payout_record](https://affiliate.shopee.vn/payment/payout_record) hoặc `/payment/billing`.
   * Bấm nút **“🔄 Làm mới từ Shopee”** trên giao diện Sổ tay thuế (hoặc **“Đồng bộ dữ liệu từ Shopee Affiliate”** trên Popup).
   * Extension sẽ thực hiện đồng bộ lại cả Payout Record, Billing List và Hóa đơn phí điện tử.
2. **Khi gặp sự cố kết nối hoặc API Billing bị lỗi**:
   * Nếu API Payout thành công nhưng API Billing gặp lỗi (mạng gián đoạn hoặc Shopee chặn tải trang), hệ thống sẽ **giữ nguyên toàn bộ dữ liệu billing cũ đã có trong cache** và gắn cảnh báo nguồn `⚠️ Dữ liệu doanh thu theo ngày chưa được làm mới do lỗi kết nối tới API Shopee Billing (đang hiển thị dữ liệu lưu đệm trước đó).`
   * Người dùng chỉ cần kiểm tra lại phiên đăng nhập Shopee Affiliate trên trình duyệt và bấm **“Làm mới từ Shopee”** một lần nữa khi mạng ổn định.
3. **Xóa toàn bộ Cache để đồng bộ từ đầu**:
   * Bấm **“🗑️ Xóa cache”** trên giao diện Sổ tay thuế. Toàn bộ dữ liệu lưu đệm sẽ được dọn sạch và trang sẽ tự động tải mới toàn bộ từ Shopee.

---

## 6. Lệnh kiểm thử & Giới hạn kiểm định (Verification & Testing Limits)

### 5.1. Lệnh kiểm tra cú pháp & Bộ kiểm thử tự động
1. **Kiểm tra cú pháp JavaScript**:
   ```bash
   for f in popup.js tax_report.js affiliate_content.js; do node --check "$f" || exit 1; done
   ```
2. **Chạy toàn bộ kiểm thử tự động (Unit Tests)**:
   ```bash
   python3 -m unittest discover -s tests -v
   ```
   *Yêu cầu tiên quyết*: Node.js >= 18 và Postman CLI >= 1.70 (đối với kiểm thử local simulation).
   Bộ kiểm thử gồm:
   * `tests/test_tax_calculator.py`: Kiểm thử phân rã số tiền, bất đẳng thức kế toán, hợp nhất tab/card và schema GraphQL.
   * `tests/test_affiliate_report.py`: Thực thi mã JavaScript thật qua Node.js để kiểm định khởi tạo Popup, bộ lọc tháng (billing, payout, daily, card), bất biến Hóa đơn vs Payout, phân tích cú pháp dán dữ liệu, bảo toàn cache từng phần, phân trang GraphQL và local Postman simulation.

### 5.2. Giới hạn kiểm định cục bộ vs Thực tế cổng Shopee
* **Giới hạn kiểm định cục bộ (Fixture-Only & Local Simulation)**: Toàn bộ kiểm thử tự động được thực hiện trong môi trường kiểm thử cục bộ độc lập dựa trên fixture đối soát mẫu (dữ liệu tháng 10/2026 và hóa đơn 9 tháng đầu năm 2026 đã ghi nhận) và local simulation server. Bộ test là fixture-only, không thực hiện request live đến Shopee nhằm bảo vệ tính an toàn và quyền riêng tư của tài khoản người dùng.
* **Không chứng nhận pháp lý thuế**: Báo cáo tổng hợp và công thức tính thuế là công cụ hỗ trợ đối soát kỹ thuật nội bộ, không cấu thành ý kiến tư vấn thuế hoặc chứng từ quyết toán pháp lý chính thức. Người dùng cần đối chiếu với chứng từ chính thức do cơ quan thuế hoặc Shopee phát hành trước khi thực hiện nghĩa vụ thuế.
