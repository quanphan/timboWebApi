# PhanQuan Guitars API

Base URL: `http://localhost:5050/api`

Successful responses:

```json
{ "success": true, "data": {} }
```

Lists also include pagination:

```json
{ "success": true, "data": [], "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 } }
```

Errors:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [{ "field": "email", "code": "INVALID", "message": "..." }] } }
```

Status codes: 200, 201, 400, 401, 403, 404, 409, 413, 415, 422, 429, 500, 503.

Send `Authorization: Bearer <accessToken>` and `Content-Type: application/json` for JSON bodies. Keep the access token in memory. Send the refresh token only to `/api/auth/refresh` and `/api/auth/logout`. Do not store it in localStorage if you can avoid it.

## Authentication

- `POST /api/auth/register` `{ name, email, password, phone? }` → user and tokens
- `POST /api/auth/login` `{ email, password }` → user and tokens
- `POST /api/auth/refresh` `{ refreshToken }` → rotated tokens
- `POST /api/auth/logout` `{ refreshToken }` → `{ revoked: true }`
- `POST /api/auth/google` `{ credential }`
- `GET /api/account/me`
- `PUT /api/account/me` `{ name?, phone? }`
- `PUT /api/account/password` `{ currentPassword, newPassword }`

## Admin users

Permissions are enforced on the server. `superadmin` has every permission. An admin receives `users.read` and the inquiry permissions unless a superadmin sets a narrower list. Customer accounts have none. A locked account cannot log in, refresh a session, or call an authenticated route.

- `GET /api/admin/users` query: `page`, `limit`, `q`, `role`, `status`
- `GET /api/admin/users/:id`
- `POST /api/admin/users/admins` `{ name, email, password, username?, phone?, permissions? }`
- `PATCH /api/admin/users/:id/role` `{ role?, permissions? }`
- `PATCH /api/admin/users/:id/status` `{ status: "active" | "locked" }`
- `PUT /api/admin/users/:id`
- `DELETE /api/admin/users/:id`

Only a superadmin can create an admin, change roles or permissions, lock an account, or delete a user. The API rejects `superadmin` as an assigned role and will not lock or delete the last superadmin. Registration ignores `role`, `permissions`, and `status`.

## Finished instruments

Products are finished instruments. `inventory.status` is `in_stock` when `quantity > 0`, otherwise `out_of_stock`. Custom builds are not products.

- `GET /api/products?page&limit&type&brand&search&inStock&sort` returns published products. Missing `status` on older records is treated as published. `sort=manual` orders by `sortOrder`.
- `GET /api/catalog/categories`
- `GET /api/catalog/instrument-types`
- `GET /api/catalog/body-shapes`
- `GET /api/catalog/series`
- `GET /api/products/types`
- `GET /api/products/brands`
- `GET /api/products/:id`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`

Sort values: `latest` (default), `price-asc`, `price-desc`, `name`.

## Cart

Requires authentication. Item price is copied from the product.

- `GET /api/cart`
- `POST /api/cart/items` `{ productId, quantity }`
- `PATCH /api/cart/items/:productId` `{ quantity }`
- `DELETE /api/cart/items/:productId`
- `POST /api/cart/merge` `{ items: [{ productId, quantity }] }`

## Reviews

- `GET /api/products/:productId/reviews`
- `POST /api/products/:productId/reviews` `{ rating, content, quality?, shipping?, service?, recommend? }`

## Contact and posts

- `POST /api/contact` `{ name, email, message, inquiryType?, subject?, productId?, productRef?, draftId? }` returns `{ id, received }`
- `inquiryType`, when sent, is one of `custom-guitar`, `ready-stock`, `technical`, `collaboration`. Existing messages without this field remain readable.
- `GET /api/admin/messages`
- `DELETE /api/admin/messages/:id`
- `GET /api/posts`
- `GET /api/posts/:id`
- `POST /api/admin/posts` `{ title, content, published? }`
- `PUT /api/admin/posts/:id`
- `DELETE /api/admin/posts/:id`

## Uploads

- `GET /api/admin/catalog/products` includes drafts. `POST` and `PATCH /api/admin/catalog/products/:id` accept `slug`, `status` (`draft` or `published`), `sortOrder`, `specs`, `categoryId`, `instrumentTypeId`, `bodyShapeId`, and `seriesId`.
- `PATCH /api/admin/catalog/products/reorder` `{ ids }`
- `GET|POST /api/admin/catalog/:kind`, `PATCH /api/admin/catalog/:kind/reorder`, `GET|PATCH|DELETE /api/admin/catalog/:kind/:id`
- `:kind` is `categories`, `instrument-types`, `body-shapes`, or `series`.
- Catalog body: `{ name, slug, description?, imagePath?, isActive?, sortOrder?, parentId?, translations?: { vi?: { name, description }, en?: { name, description } } }`
- A catalog item linked to a product or child item returns `409` instead of deleting.
- `POST /api/admin/uploads?scope=guitars|categories` multipart field `file`, JPEG/PNG/WebP/GIF, 5 MB maximum. The stored value is a relative path such as `/uploads/guitars/<random>.png`.
- Files are served from `/uploads/...`. The API does not delete an image file when a product or catalog item changes. On deploy, mount a persistent volume at `UPLOADS_DIR` (default `uploads/`).

## Custom build

- `GET /api/custom-build/options` public wizard catalog. Options include `code`, translations, `compatibility`, `attributes`, `isDefault`, `defaultForInstrumentTypeIds`, `imagePath`, and `icon`. Inactive options are included so clients can hide them.
- `GET /api/custom-build/options/:categoryId`
- `GET /api/admin/custom-build/setup` admin list of wizard categories and options (`catalog.read`)
- `POST /api/admin/custom-build/setup/:categoryId/options` `{ name, code, translations?, description?, active?, isDefault?, defaultForInstrumentTypeIds?, imagePath?, icon?, sortOrder?, compatibility?, attributes? }` (`catalog.write`). `defaultForInstrumentTypeIds` is unique per instrument type within the category. Compatibility values must match stored option codes or wizard ids.
- `PATCH /api/admin/custom-build/setup/:categoryId/options/:optionId`
- `POST /api/admin/custom-build/setup/:categoryId/options/:optionId/duplicate`
- `PATCH /api/admin/custom-build/setup/:categoryId/reorder` `{ ids }`
- `DELETE /api/admin/custom-build/setup/:categoryId/options/:optionId` (`catalog.delete`). Returns `409` when the option is the last in its category or is referenced by an inquiry; deactivate it instead.
- `POST /api/custom-build/validate` `{ selections, notes? }`
- `POST /api/custom-build/inquiries` `{ customer: { name, email, phone? }, configuration, message? }` returns `201` `{ id, createdAt, status }`
- `configuration.notes` keeps the draft id (`draftId=`), language, country, and wizard details. Prices are not stored.
- An identical retry, including a double-click with the same draft id and payload, returns the original `201` body. A changed payload is stored as a separate inquiry.
- `GET /api/admin/custom-build/inquiries` query: `page`, `limit`, `status`, `startDate`, `endDate`, `q`
- `GET /api/admin/custom-build/inquiries/:id`
- `PATCH /api/admin/custom-build/inquiries/:id` `{ status }`
- `DELETE /api/admin/custom-build/inquiries/:id`

Admin status values are `new`, `ready_to_build`, `building`, `completed`, and `cancelled`. A public submission is stored as `received` and shown to admins as `new`. These routes require an admin or superadmin access token. Deletion writes an audit record with the actor and inquiry id.

There is no public inquiry list or detail route. Client prices and totals are rejected.

## Brand settings

Public contact details, workshop addresses, and display flags are stored as a single MongoDB `brandsettings` document with `key: "brand"`. Empty fields are omitted from the public response. No contact details are invented when the document does not exist yet.

- `GET /api/brand-settings/public` returns only enabled, non-empty public fields: `email`, `phone`, `whatsapp`, `facebook`, `instagram`, `youtube`, `other`, `hours`, `workshops`. It never returns `updatedBy`, `key`, or display flags.
- `GET /api/brand-settings/admin` requires an admin or superadmin access token and returns the full form payload, including empty values and display flags.
- `PUT /api/brand-settings/admin` `{ contact, workshops, display, hours }` validates and atomically upserts the singleton document. URLs must be `http` or `https`. There is no public write route.

## Gallery

Posts are stored in MongoDB (`galleryposts`). Media files are stored on disk under `GALLERY_UPLOAD_DIR` (default `UPLOADS_DIR/gallery`, which is `uploads/gallery/` locally) as `images/` and `videos/`. MongoDB stores only public paths such as `/uploads/gallery/images/<random>.png`. Files are not stored in Cloudinary or in MongoDB binary fields.

Public list and detail return published posts only. Drafts are admin-only. There is no public write route.

- `GET /api/gallery` query: `page`, `limit`, `category` (`process`, `materials`, `finish`, `instruments`, `video`)
- `GET /api/gallery/:id` published posts only
- `GET /api/admin/gallery` and `GET /api/admin/gallery/:id` require an admin or superadmin token and include drafts
- `POST /api/admin/gallery/uploads` multipart field `file`. Images: JPEG/PNG/WebP/GIF, default 8 MB (`GALLERY_IMAGE_MAX_BYTES`). Videos: MP4/WebM, default 50 MB (`GALLERY_VIDEO_MAX_BYTES`). Magic bytes are checked. The response is `{ id, kind, path, url, mime, size, originalName }`.
- `POST /api/admin/gallery` `{ title, excerpt?, content?, category, status, publishedAt?, order?, media?, coverMediaId? }`. A post may include up to 5 images **or** 1 video, not both. `coverMediaId` selects the main image; it defaults to the first image.
- `PATCH /api/admin/gallery/:id` partial update. Removed media files are deleted from disk if no other gallery post still uses them.
- `DELETE /api/admin/gallery/:id` deletes the post and unused gallery files.

On deploy, mount a persistent volume at `UPLOADS_DIR` (or `GALLERY_UPLOAD_DIR`) or gallery files can be lost on redeploy.

## Health

- `GET /api/health` returns database readiness and no connection details.
