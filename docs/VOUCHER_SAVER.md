# Tự động lưu voucher Shopee (Shopee Voucher Saver)

Tính năng cốt lõi giúp người dùng tự động tìm kiếm và nhấn nút **“Lưu”** toàn bộ mã giảm giá trên các trang voucher của Shopee mà không cần thao tác thủ công.

---

## 1. Tính năng nổi bật

* **Tự động quét trang**: Tự động cuộn xuống cuối trang để nạp toàn bộ danh sách voucher đang hiển thị.
* **Tự động click**: Tìm tất cả các thẻ `<span>` và `<button>` có nội dung "Lưu".
* **Độ trễ ngẫu nhiên (Human-like delay)**: Tự động điều chỉnh khoảng nghỉ giữa các lần click từ 1.5 - 2.5 giây nhằm tránh bị giới hạn tần suất (rate-limit) từ hệ thống Shopee.
* **Thông báo tiến độ**: Hiển thị số lượng voucher đã lưu và thời gian ước tính còn lại trên console / giao diện.

---

## 2. Hướng dẫn sử dụng

1. Truy cập vào bất kỳ trang voucher nào trên Shopee (ví dụ: Trang Mã Giảm Giá, Flash Sale, Siêu Sale Ngày Đôi, v.v.).
2. Nhấn vào icon extension trên thanh công cụ trình duyệt.
3. Trong tab **“Voucher”**, nhấn nút **“Lưu tất cả voucher”**.
4. Tiện ích sẽ tự động cuộn trang và thu thập tất cả mã giảm giá có sẵn.
