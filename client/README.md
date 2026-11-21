# Chitchat

React + Vite + Tailwind CSS + Supabase Authentication.

## Chạy client

1. Trong `client`, chạy `npm install`.
2. Copy `.env.example` thành `.env.local`, điền Project URL và publishable key.
3. Chạy `npm run dev`.

Trong Supabase, bật Email provider; đặt Site URL và Redirect URLs phù hợp với địa chỉ Vite (mặc định http://localhost:5173). Nếu bật Confirm email, xác nhận email trước khi đăng nhập.

## Kiểm tra

- `npm run lint`
- `npm run build` (tạo thư mục dist, có thể xóa sau khi kiểm tra)

Hiện có đăng ký, đăng nhập, duy trì phiên và đăng xuất. Chưa triển khai bảng tin nhắn hoặc Supabase Realtime. Không cần chạy server Node.js hay Socket.IO.

Chỉ dùng publishable key trong client, không dùng secret key hoặc service_role.
