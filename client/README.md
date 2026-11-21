# Chitchat

React + Vite + Tailwind CSS + Supabase Auth, PostgreSQL và Realtime. Không cần server Node.js/Express.

## Chạy local

1. Trong `client`, chạy `npm install`.
2. Copy `.env.example` thành `.env.local`, điền Project URL và publishable key.
3. Chạy `npm run dev`.

Không dùng secret key hoặc service_role trong client.

## Thiết lập Supabase

- Project mới: chạy `supabase/rooms.sql`, sau đó `supabase/chat-hardening.sql` trong SQL Editor.
- Project đang dùng đã có tên phòng: chỉ chạy `supabase/chat-hardening.sql`.
- Nếu chỉ có bản schema cũ, chạy `supabase/room-names.sql` trước bản hardening.
- Nếu chạy lại `rooms.sql`, cần chạy lại hardening sau cùng vì schema gốc cấp quyền insert cho client cũ.
- Auth: bật Email provider. Cấu hình mật khẩu tối thiểu 8 ký tự trong Dashboard để áp dụng cả ngoài giao diện.
- Đặt Site URL thành URL ứng dụng đã deploy. Trong Redirect URLs thêm URL local/production và URL đặt lại mật khẩu tương ứng, ví dụ `http://localhost:5173/?recovery=1` và `https://YOUR_APP.vercel.app/?recovery=1`.
- Khi dùng thực tế, cấu hình SMTP và giới hạn gửi email của Supabase Auth theo nhu cầu. Các email test trong bộ kiểm thử đều được giả lập.

## Chức năng

Đăng ký, đăng nhập, khôi phục mật khẩu, tạo/phòng có tên, tham gia bằng ID, danh sách phòng, rời phòng và chủ phòng xóa phòng. ID đầy đủ là mã mời: người đăng nhập có ID có thể tham gia và đọc lịch sử. Chủ phòng phải xóa thay vì rời phòng.

Tin nhắn lưu qua RPC: server lấy ID/tên người gửi, kiểm tra thành viên và giới hạn 20 tin/10 giây/tài khoản. Retry cùng UUID trả lại tin đã lưu, không tạo bản sao. Tạo phòng giới hạn 5/phút, tham gia giới hạn 20/phút. Đây là giới hạn theo tài khoản, chưa phải hệ thống chống bot/DDoS hoặc kiểm duyệt nội dung.

Lịch sử tải 50 tin/lần; có nút tải tin cũ. Khi reconnect/focus, tự đồng bộ các tin còn thiếu, khử trùng bằng UUID. Tin gửi lỗi được giữ ở trạng thái chờ để gửi lại; chưa lưu bản nháp qua tải lại trang. Mỗi 5 giây khi tab hiển thị kiểm tra lại phòng, bù tin và phát hiện mất quyền/phòng bị xóa. Khi mất mạng phải chờ nối lại mới xác nhận được phòng còn tồn tại.

## Kiểm thử

Trong `client`:

- `npm run lint`
- `npm run build` (tạo `dist`)

Kiểm tra môi trường thật sau khi chạy SQL: hai tài khoản ở hai trình duyệt, tạo/tham gia phòng, gửi tin hai chiều, tắt mạng rồi nối lại, tải lịch sử, rời phòng và chủ phòng xóa. Kiểm tra email recovery bằng hộp thư thật. Bộ test local không xác minh dịch vụ email hoặc WebSocket của Supabase project đang deploy.
