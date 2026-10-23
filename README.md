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

Ảnh upload nằm trong `uploads/`. Gallery media nằm trong `uploads/gallery/images` và `uploads/gallery/videos` (hoặc `GALLERY_UPLOAD_DIR`). Khi deploy, gắn persistent volume cho `UPLOADS_DIR` hoặc `GALLERY_UPLOAD_DIR`, vì file không nằm trong MongoDB. Không có cấu hình Railway volume trong repo này.

API local: `http://127.0.0.1:5050`

- `GET /api/custom-build/options`
- `POST /api/custom-build/validate`
- `POST /api/custom-build/inquiries`
- `GET /api/admin/custom-build/inquiries`
- `GET /api/admin/custom-build/inquiries/:id`
- `PATCH /api/admin/custom-build/inquiries/:id`
- `DELETE /api/admin/custom-build/inquiries/:id`

Đăng nhập admin dùng `POST /api/auth/login` với `username` hoặc `email` và `password`. `superadmin` quản lý admin, role, permissions và khóa tài khoản. Admin có quyền đọc user và xử lý inquiry. Customer không gọi được API quản trị. Tài khoản `locked` không đăng nhập và không dùng token cũ.

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
