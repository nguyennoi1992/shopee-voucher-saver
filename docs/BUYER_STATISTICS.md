# Thống kê chi tiêu mua sắm Shopee (Buyer Account Statistics)

Module **Thống kê tài khoản Shopee** hỗ trợ người mua hàng Shopee thống kê toàn bộ lịch sử chi tiêu, đơn hàng đã giao thành công và phân tích thói quen mua sắm.

---

## 1. Tính năng nổi bật

* **Tổng hợp chi tiêu tài khoản**:
  * Tổng số tiền đã chi trả (sau khuyến mãi & voucher).
  * Tổng tiền gốc trước giảm giá.
  * Ước tính tổng tiền đã tiết kiệm được nhờ áp dụng mã giảm giá.
* **Số lượng và tần suất**:
  * Tổng số đơn hàng đã hoàn thành.
  * Tổng số lượng sản phẩm đã mua.
  * Số lượng shop đã từng mua sắm.
  * Giá trị trung bình trên mỗi đơn hàng.
  * Tần suất mua sắm trung bình theo tháng.
* **Thói quen mua sắm**:
  * Ngày trong tuần hay mua sắm nhất (Chủ nhật, Thứ 2, ...).
  * Khung giờ hay đặt hàng nhất trong ngày (0h, 12h, 20h...).
  * Chuỗi tháng mua sắm liên tục.
* **Bảng xếp hạng & Thống kê chi tiết**:
  * Biểu đồ chi tiêu theo từng tháng.
  * Top 10 shop mua nhiều tiền nhất.
  * Top 10 sản phẩm mua lặp lại nhiều nhất.
  * Top 10 món hàng đắt nhất từng mua.
* **Cơ chế quét nền (Background Scanner)**:
  * Quét tự động nhiều trang qua API nội bộ Shopee mà không cần giữ cửa sổ popup.
  * Tự động lưu bộ nhớ đệm (Cache) để xem lại tức thì bất kỳ lúc nào.

---

## 2. Hướng dẫn sử dụng

1. Đăng nhập tài khoản Shopee cá nhân trên trình duyệt (`https://shopee.vn/`).
2. Mở popup extension, chọn tab **“Mua sắm”**.
3. Bấm **“Bắt đầu phân tích”**.
4. Tiến trình quét sẽ tự động chạy ngầm, bạn có thể đóng popup và mở lại bất cứ lúc nào để theo dõi.
5. Sau khi quét xong, báo cáo chi tiết sẽ hiển thị đầy đủ trên giao diện.
