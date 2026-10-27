# timboWebApi

API Express cho website PhanQuan Guitars. Custom build inquiry được lưu bằng Mongoose vào MongoDB.

## Chạy local

1. Cài MongoDB trên máy, hoặc dùng một connection string riêng cho môi trường local.
2. Tạo file môi trường từ mẫu. Không ghi secret thật vào git.

```bash
cp .env.example .env
```

3. Trong `.env`, đặt:

- `MONGO_URI`: local dùng `mongodb://127.0.0.1:27017`. Production đặt URI thật trong secret store của host.
- `DB_NAME`: `timbowebdata` cho dữ liệu hiện có.
- `JWT_SECRET` và `REFRESH_SECRET`: chuỗi ngẫu nhiên dài ít nhất 16 ký tự.
- `CORS_ORIGIN`: `http://localhost:5173` khi chạy frontend Vite.
- `PORT`: mặc định `5050`.
- `ADMIN_INITIAL_PASSWORD`: mật khẩu ban đầu cho tài khoản `phanquan`. Chỉ dùng khi seed.
- `ADMIN_INITIAL_EMAIL`: tùy chọn. Mặc định `phanquan@users.local`.
- `GOOGLE_CLIENT_ID`: để trống thì Google login bị tắt. Profile Google không tự thành admin.

4. Cài dependency, nạp danh mục custom build demo nếu collection còn trống, rồi chạy server:

```bash
npm install
npm run seed:custom-build
npm run seed:superadmin
npm run dev
```

`seed:superadmin` tạo một tài khoản `superadmin` với username `phanquan` nếu chưa có. Chạy lại không tạo thêm user và không đổi mật khẩu đã lưu.

Seed chỉ thêm category chưa có và không ghi đè category đã sửa. Server thoát nếu không kết nối được MongoDB. Request inquiry không ghi file JSON thay thế.

Ảnh upload nằm trong `UPLOADS_DIR` (mặc định `<api-root>/uploads`) và được phục vụ tại `/uploads`. Ảnh Page Content nằm cụ thể trong `UPLOADS_DIR/pages` và URL công khai là `/uploads/pages/<32-hex>.<ext>` — cùng chuỗi được lưu trong MongoDB.

Railway không có volume trong repo này. Để file sống sau redeploy:

1. Railway → service TimboWebApi → Volumes → New Volume.
2. Mount path: `/data/uploads`
3. Variable: `UPLOADS_DIR=/data/uploads`
4. Xác nhận trên dashboard (không thể xác nhận từ git): volume attached, mount path đúng, biến đã set, redeploy sau khi gắn volume.

Kiểm tra tay: upload một ảnh About, ghi path `/uploads/pages/...`, redeploy API, mở lại `{API origin}/uploads/pages/...`. Nếu 404 thì volume chưa gắn hoặc `UPLOADS_DIR` chưa trỏ vào mount.

API local: `http://127.0.0.1:5050`

- `GET /api/custom-build/options`
- `POST /api/custom-build/validate`
- `POST /api/custom-build/inquiries`
- `GET /api/admin/custom-build/inquiries`
- `GET /api/admin/custom-build/inquiries/:id`
- `PATCH /api/admin/custom-build/inquiries/:id`
- `DELETE /api/admin/custom-build/inquiries/:id`

Đăng nhập admin dùng `POST /api/auth/login` với `username` hoặc `email` và `password`. `superadmin` quản lý admin, role, permissions và khóa tài khoản. Admin có quyền đọc user và xử lý inquiry. Customer không gọi được API quản trị. Tài khoản `locked` không đăng nhập và không dùng token cũ.

## Email thông báo

Backend gửi email cho quản trị viên sau khi một contact message hoặc custom build inquiry đã được lưu vào MongoDB. Dự án không có API tạo đơn hàng, nên không gửi email đơn hàng. Giỏ hàng không được xem là đơn hàng.

Nhà cung cấp là Resend. Đặt các biến sau trong secret store, không ghi vào git:

- `RESEND_API_KEY`: API key của Resend.
- `NOTIFICATION_EMAIL`: hộp thư nhận thông báo.
- `EMAIL_FROM`: địa chỉ gửi đã được Resend chấp nhận, dạng `Name <mail@domain>`.
- `PUBLIC_BASE_URL`: tùy chọn. Origin của API, chỉ dùng cho link ảnh tham chiếu. Local: `http://127.0.0.1:5050`. Production: `https://timbowebapi.up.railway.app`.
- `FRONTEND_BASE_URL`: origin của website để mở trang admin. Local: `http://127.0.0.1:5173`. Production để trống thì dùng `https://phanquanguitars.com`.

Thiếu một trong ba biến bắt buộc thì server vẫn nhận form và không gửi email. Lỗi từ Resend cũng không đổi kết quả đã lưu. Gửi lại cùng một inquiry hoặc cùng nội dung contact không gửi thêm email sau lần gửi thành công.

Trong Resend, thêm và xác minh domain của `EMAIL_FROM` trước khi dùng production. Không dùng địa chỉ chưa xác minh. Email chứa đường dẫn admin yêu cầu đăng nhập; không có URL công khai để đọc nội dung inquiry.

## Kiểm thử

```bash
npm test
```

Test dùng MongoDB trong bộ nhớ và không kết nối tới `timbowebdata`.

## Sản phẩm guitar

`POST/PATCH /api/admin/catalog/products` và `GET /api/products` lưu và đọc từ MongoDB, không từ file JSON.

- `productType`: `custom-order` | `ready-stock`. Field riêng trên document Product, không dùng `qty` và không dùng `type` (loại nhạc cụ cũ).
- `GET /api/products?productType=custom-order` hoặc `ready-stock` lọc server-side.
- `specs`: object tối đa 30 cặp key/value chữ (mỗi value tối đa 1000 ký tự). Dùng cho thông số guitar. Pickup gộp vào `specs.pickupConfiguration`. Không dùng `specs.productType` làm nguồn chính; nếu client gửi key đó, API chuyển sang field `productType` rồi xóa khỏi `specs`.
- Ảnh: upload `POST /api/admin/uploads?scope=guitars`, MongoDB chỉ lưu path `/uploads/...`.
