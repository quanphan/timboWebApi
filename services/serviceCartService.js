const crypto = require('node:crypto');
const mongoose = require('mongoose');
const CustomBuildInquiry = require('../models/CustomBuildInquiry');
const ServiceCart = require('../models/ServiceCart');
const ServiceCategory = require('../models/ServiceCategory');
const ServiceItem = require('../models/ServiceItem');
const { ApiError } = require('../utils/errors');
const { comboKey, resolveServiceItemPrice } = require('../utils/serviceOptions');
const { cleanString } = require('../utils/text');
const {
    SESSION_TTL_MS,
    hashToken,
    issueSession,
    readSessionHeaders,
    tokensEqual,
} = require('./serviceCartSession');
const { createNotificationService } = require('./email/notificationService');

const ALLOWED_SLUGS = new Set(['guitar-repair', 'tools-equipment']);
const MESSAGE_MAX = 2000;
const COUNTRY_MAX = 80;
const NAME_MAX = 100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+().\-\s]+$/;
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’-]*$/u;

function issue(field, code, message) {
    return { field, code, message };
}

function lineMatchKey(item) {
    return `${String(item.serviceItemId)}|${comboKey(item.optionValueIds)}`;
}

function requireQuantity(value, field = 'quantity') {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
            issue(field, 'INVALID', 'Quantity must be an integer from 1 to 99.'),
        ]);
    }
    return quantity;
}

function touchGuestExpiry(cart) {
    if (cart.ownerType !== 'guest') return;
    cart.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
}

function guestIsExpired(cart) {
    return Boolean(cart.expiresAt && cart.expiresAt.getTime() <= Date.now());
}

function readGuestHeaders(req) {
    return readSessionHeaders(req);
}

async function loadOpenGuestCart(sessionId, token) {
    if (!sessionId || !token) return null;
    const cart = await ServiceCart.findOne({ sessionId, ownerType: { $ne: 'user' } });
    if (!cart) return null;
    if (!tokensEqual(cart.tokenHash || '', hashToken(token))) {
        throw new ApiError(401, 'GUEST_INVALID', 'A valid cart session is required.');
    }
    if (guestIsExpired(cart)) {
        throw new ApiError(401, 'GUEST_EXPIRED', 'The cart session has expired.');
    }
    return cart;
}

async function requireGuestCart(req) {
    const { sessionId, token } = readGuestHeaders(req);
    if (!sessionId || !token) {
        throw new ApiError(401, 'GUEST_INVALID', 'A valid cart session is required.');
    }
    const cart = await loadOpenGuestCart(sessionId, token);
    if (!cart) {
        throw new ApiError(401, 'GUEST_INVALID', 'A valid cart session is required.');
    }
    if (cart.status === 'submitted') {
        throw new ApiError(409, 'CONFLICT', 'This cart has already been submitted.');
    }
    if (cart.status === 'merged') {
        throw new ApiError(401, 'GUEST_INVALID', 'A valid cart session is required.');
    }
    return cart;
}

async function findOpenUserCart(userId) {
    return ServiceCart.findOne({ userId, ownerType: 'user', status: 'open' });
}

async function createUserCart(userId) {
    try {
        return await ServiceCart.create({
            ownerType: 'user',
            userId,
            status: 'open',
            items: [],
            mergedSessionIds: [],
        });
    } catch (error) {
        if (error && (error.code === 11000 || error.code === 11001)) {
            const existing = await findOpenUserCart(userId);
            if (existing) return existing;
        }
        throw error;
    }
}

function copyLineSnapshot(line) {
    return {
        lineId: line.lineId || crypto.randomUUID(),
        serviceItemId: line.serviceItemId,
        optionValueIds: Array.isArray(line.optionValueIds) ? line.optionValueIds.map(String) : [],
        quantity: line.quantity,
        unitPriceSnapshot: line.unitPriceSnapshot ?? null,
        currencySnapshot: line.currencySnapshot || null,
        priceOnRequestSnapshot: Boolean(line.priceOnRequestSnapshot),
        titleEn: line.titleEn || '',
        titleVi: line.titleVi || '',
        imagePath: line.imagePath || null,
        categorySlug: line.categorySlug || null,
        categoryNameEn: line.categoryNameEn || '',
        categoryNameVi: line.categoryNameVi || '',
        optionsSnapshot: Array.isArray(line.optionsSnapshot) ? line.optionsSnapshot : [],
    };
}

function mergeSourceLines(targetItems, sourceItems) {
    const items = (targetItems || []).map(copyLineSnapshot);
    for (const line of sourceItems || []) {
        const existing = items.find((item) => lineMatchKey(item) === lineMatchKey(line));
        if (existing) {
            const nextQuantity = existing.quantity + line.quantity;
            if (nextQuantity > 99) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                    issue('quantity', 'INVALID', 'Quantity cannot exceed 99.'),
                ]);
            }
            existing.quantity = nextQuantity;
        } else {
            items.push(copyLineSnapshot({ ...line, lineId: crypto.randomUUID() }));
        }
    }
    return items;
}

async function markGuestMerged(guest) {
    guest.status = 'merged';
    guest.expiresAt = new Date();
    await guest.save();
}

async function convertGuestToUserCart(guest, userId, sessionId) {
    await ServiceCart.updateOne({ _id: guest._id }, {
        $set: {
            ownerType: 'user',
            userId,
            status: 'open',
            mergedSessionIds: [...new Set([...(guest.mergedSessionIds || []), sessionId])],
        },
        $unset: { sessionId: 1, tokenHash: 1, expiresAt: 1 },
    });
    return findOpenUserCart(userId);
}

async function mergeGuestIntoUser(user, req) {
    const { sessionId, token } = readGuestHeaders(req);
    if (!sessionId || !token) {
        return (await findOpenUserCart(user._id)) || (await createUserCart(user._id));
    }

    let guest;
    try {
        guest = await loadOpenGuestCart(sessionId, token);
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            const userCart = await findOpenUserCart(user._id);
            return userCart || (await createUserCart(user._id));
        }
        throw error;
    }
    if (!guest || guest.status !== 'open') {
        const userCart = await findOpenUserCart(user._id);
        return userCart || (await createUserCart(user._id));
    }

    let userCart = await findOpenUserCart(user._id);
    if (!userCart) {
        try {
            const converted = await convertGuestToUserCart(guest, user._id, sessionId);
            if (converted) return converted;
        } catch (error) {
            if (!error || (error.code !== 11000 && error.code !== 11001)) throw error;
            userCart = await findOpenUserCart(user._id);
        }
    }

    if (!userCart) userCart = await createUserCart(user._id);

    if ((userCart.mergedSessionIds || []).includes(sessionId)) {
        if (guest.status === 'open') await markGuestMerged(guest);
        return userCart;
    }

    const nextItems = mergeSourceLines(userCart.items, guest.items);
    const claimed = await ServiceCart.findOneAndUpdate(
        { _id: userCart._id, ownerType: 'user', status: 'open', mergedSessionIds: { $ne: sessionId } },
        { $addToSet: { mergedSessionIds: sessionId }, $set: { items: nextItems } },
        { new: true },
    );
    if (!claimed) {
        if (guest.status === 'open') await markGuestMerged(guest);
        return await findOpenUserCart(user._id);
    }
    await markGuestMerged(guest);
    return claimed;
}

async function requireOpenCart(req) {
    if (req.user) {
        const cart = await mergeGuestIntoUser(req.user, req);
        if (!cart) {
            throw new ApiError(401, 'UNAUTHORIZED', 'A valid cart session is required.');
        }
        return cart;
    }
    return requireGuestCart(req);
}

function localeText(record, key, fallback) {
    const en = record?.translations?.en?.[key];
    const vi = record?.translations?.vi?.[key];
    return {
        en: en || fallback || '',
        vi: vi || en || fallback || '',
    };
}

function snapshotOptions(item, optionValueIds) {
    const selected = Array.isArray(optionValueIds) ? optionValueIds.map(String) : [];
    const options = [];
    for (const group of item.optionGroups || []) {
        const value = (group.values || []).find((entry) => selected.includes(String(entry.id)));
        if (!value) continue;
        const groupName = localeText(group, 'name', group.name);
        const valueLabel = localeText(value, 'label', value.label);
        options.push({
            groupId: String(group.id),
            groupNameEn: groupName.en,
            groupNameVi: groupName.vi,
            valueId: String(value.id),
            labelEn: valueLabel.en,
            labelVi: valueLabel.vi,
        });
    }
    return options;
}

function readOptionValueIds(body, item) {
    const groups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    const incoming = Array.isArray(body?.optionValueIds) ? body.optionValueIds.map(String) : [];
    if (!groups.length) {
        if (incoming.length) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                issue('optionValueIds', 'INVALID', 'This item has no options.'),
            ]);
        }
        return [];
    }
    const selected = [];
    for (const group of groups) {
        const values = group.values || [];
        const match = values.find((value) => incoming.includes(String(value.id)));
        if (!match) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                issue('optionValueIds', 'REQUIRED', 'Select an option for each group.'),
            ]);
        }
        selected.push(String(match.id));
    }
    return selected;
}

async function loadEligibleItem(serviceItemId) {
    if (!mongoose.isValidObjectId(serviceItemId)) {
        throw new ApiError(404, 'NOT_FOUND', 'Service item was not found.');
    }
    const item = await ServiceItem.findById(serviceItemId);
    if (!item || item.isActive === false) {
        throw new ApiError(404, 'NOT_FOUND', 'Service item was not found.');
    }
    const category = await ServiceCategory.findById(item.categoryId);
    if (!category || category.isActive === false || !ALLOWED_SLUGS.has(category.slug)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'This service cannot be added to the cart.', [
            issue('serviceItemId', 'INVALID', 'Only Guitar Repair and Tools & Equipment can be added.'),
        ]);
    }
    return { item, category };
}

function presentOptionGroups(item) {
    return (item.optionGroups || []).map((group) => {
        const name = localeText(group, 'name', group.name);
        return {
            id: String(group.id),
            nameEn: name.en,
            nameVi: name.vi,
            values: (group.values || []).map((value) => {
                const label = localeText(value, 'label', value.label);
                return {
                    id: String(value.id),
                    labelEn: label.en,
                    labelVi: label.vi,
                };
            }),
        };
    });
}

function catalogPrice(item, optionValueIds) {
    const unitPrice = resolveServiceItemPrice(item, optionValueIds);
    return {
        unitPrice,
        priceOnRequest: unitPrice == null,
        currency: item?.currency || null,
    };
}

function writeCatalogSnapshot(line, item, category, optionValueIds) {
    const title = localeText(item, 'title', item.title);
    const categoryName = localeText(category, 'name', category.name);
    const price = catalogPrice(item, optionValueIds);
    line.titleEn = title.en;
    line.titleVi = title.vi;
    line.imagePath = item.imagePath || null;
    line.categorySlug = category.slug;
    line.categoryNameEn = categoryName.en;
    line.categoryNameVi = categoryName.vi;
    line.optionsSnapshot = snapshotOptions(item, optionValueIds);
    line.unitPriceSnapshot = price.unitPrice;
    line.currencySnapshot = price.currency;
    line.priceOnRequestSnapshot = price.priceOnRequest;
}

function hasPriceSnapshot(line) {
    return line.unitPriceSnapshot != null || line.priceOnRequestSnapshot === true;
}

function pricesDiffer(snapshotPrice, snapshotOnRequest, currentPrice, currentOnRequest) {
    if (Boolean(snapshotOnRequest) !== Boolean(currentOnRequest)) return true;
    if (snapshotOnRequest && currentOnRequest) return false;
    return Number(snapshotPrice) !== Number(currentPrice);
}

function presentLine(line, item, category, extra = {}) {
    const current = item ? catalogPrice(item, line.optionValueIds) : { unitPrice: null, priceOnRequest: true, currency: null };
    const snapped = hasPriceSnapshot(line);
    const unitPrice = snapped
        ? (line.priceOnRequestSnapshot ? null : line.unitPriceSnapshot)
        : current.unitPrice;
    const priceOnRequest = snapped ? Boolean(line.priceOnRequestSnapshot) : current.priceOnRequest;
    const currency = snapped ? (line.currencySnapshot || current.currency) : current.currency;
    const title = item ? localeText(item, 'title', item.title) : { en: line.titleEn, vi: line.titleVi };
    const categoryName = category
        ? localeText(category, 'name', category.name)
        : { en: line.categoryNameEn, vi: line.categoryNameVi };
    const quantity = line.quantity;
    const unavailable = Boolean(extra.unavailable);
    const priceChanged = !unavailable && item && snapped && pricesDiffer(
        line.unitPriceSnapshot,
        line.priceOnRequestSnapshot,
        current.unitPrice,
        current.priceOnRequest,
    );
    const categorySlug = category?.slug || line.categorySlug || null;
    return {
        lineId: line.lineId,
        serviceItemId: item ? String(item._id) : (line.serviceItemId ? String(line.serviceItemId) : null),
        categorySlug,
        categoryNameEn: categoryName.en || line.categoryNameEn || '',
        categoryNameVi: categoryName.vi || line.categoryNameVi || '',
        titleEn: title.en || line.titleEn || '',
        titleVi: title.vi || line.titleVi || '',
        imagePath: (item?.imagePath || line.imagePath) || null,
        quantity,
        options: item ? snapshotOptions(item, line.optionValueIds) : (line.optionsSnapshot || []),
        optionValueIds: (line.optionValueIds || []).map(String),
        optionGroups: item ? presentOptionGroups(item) : [],
        unitPrice,
        currentUnitPrice: unavailable ? null : current.unitPrice,
        currency,
        priceOnRequest,
        lineTotal: priceOnRequest || unitPrice == null ? null : unitPrice * quantity,
        indicative: categorySlug === 'guitar-repair',
        priceChanged,
        unavailable: false,
        ...extra,
    };
}

function unavailableLine(line, item, category, code) {
    return presentLine(line, item, category, {
        unavailable: true,
        unavailableCode: code,
        currentUnitPrice: null,
        priceChanged: false,
        optionGroups: [],
    });
}

async function inspectLine(line) {
    if (!mongoose.isValidObjectId(line.serviceItemId)) {
        return { ok: false, code: 'NOT_FOUND' };
    }
    const item = await ServiceItem.findById(line.serviceItemId);
    if (!item) return { ok: false, code: 'NOT_FOUND' };
    const category = await ServiceCategory.findById(item.categoryId);
    if (item.isActive === false) return { ok: false, code: 'INACTIVE', item, category };
    if (!category || category.isActive === false || !ALLOWED_SLUGS.has(category.slug)) {
        return { ok: false, code: 'INACTIVE', item, category };
    }
    const groups = Array.isArray(item.optionGroups) ? item.optionGroups : [];
    if (groups.length) {
        const selected = (line.optionValueIds || []).map(String);
        for (const group of groups) {
            const match = (group.values || []).find((value) => selected.includes(String(value.id)));
            if (!match) return { ok: false, code: 'OPTIONS', item, category };
        }
    }
    return { ok: true, item, category };
}

async function presentCart(cart, { forSubmit = false, acceptPriceChanges = false } = {}) {
    const presented = [];
    const unavailable = [];
    const priceChanges = [];
    let quotationRequired = false;
    let subtotal = 0;
    for (const line of cart.items) {
        const inspected = await inspectLine(line);
        if (!inspected.ok) {
            const row = unavailableLine(line, inspected.item, inspected.category, inspected.code);
            presented.push(row);
            unavailable.push(row);
            continue;
        }
        const row = presentLine(line, inspected.item, inspected.category);
        if (row.priceChanged) {
            priceChanges.push({
                field: 'items',
                lineId: row.lineId,
                code: 'PRICE_CHANGED',
                message: row.titleEn || 'The price for this item has changed.',
                previous: row.unitPrice,
                current: row.currentUnitPrice,
                currency: row.currency,
            });
            if (acceptPriceChanges) {
                row.unitPrice = row.currentUnitPrice;
                row.priceOnRequest = row.currentUnitPrice == null;
                row.lineTotal = row.priceOnRequest || row.unitPrice == null ? null : row.unitPrice * row.quantity;
                row.priceChanged = false;
            }
        }
        if (row.priceOnRequest) quotationRequired = true;
        else subtotal += row.lineTotal;
        presented.push(row);
    }
    if (forSubmit && unavailable.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Some cart items are no longer available.', unavailable.map((row) => ({
            field: 'items',
            lineId: row.lineId,
            code: row.unavailableCode || 'UNAVAILABLE',
            message: row.titleEn || 'This item is no longer available.',
        })));
    }
    if (forSubmit && !acceptPriceChanges && priceChanges.length) {
        throw new ApiError(409, 'PRICE_CHANGED', 'Some cart prices have changed.', priceChanges);
    }
    return {
        ownerType: cart.ownerType,
        sessionId: cart.ownerType === 'guest' ? cart.sessionId : null,
        expiresAt: cart.ownerType === 'guest' && cart.expiresAt ? cart.expiresAt.toISOString() : null,
        status: cart.status,
        itemCount: presented.reduce((sum, row) => sum + row.quantity, 0),
        quotationRequired: quotationRequired || presented.some((row) => row.priceOnRequest || row.unavailable),
        subtotal: quotationRequired || unavailable.length ? null : subtotal,
        items: presented,
    };
}

function validateCustomer(body) {
    const errors = [];
    const name = cleanString(body?.name);
    const email = cleanString(body?.email).toLowerCase();
    const phone = cleanString(body?.phone);
    if (!name || name.length < 2 || name.length > NAME_MAX || !NAME_PATTERN.test(name)) {
        errors.push(issue('customer.name', name ? 'INVALID' : 'REQUIRED', 'Enter a valid full name.'));
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        errors.push(issue('customer.email', 'INVALID', 'Enter a valid email address.'));
    }
    if (!phone || phone.length < 7 || phone.length > 30 || !PHONE_PATTERN.test(phone)) {
        errors.push(issue('customer.phone', phone ? 'INVALID' : 'REQUIRED', 'Enter a valid phone number.'));
    }
    const country = cleanString(body?.country);
    if (country.length > COUNTRY_MAX) {
        errors.push(issue('customer.country', 'TOO_LONG', 'Country is too long.'));
    }
    const notes = cleanString(body?.notes ?? body?.message);
    if (notes.length > MESSAGE_MAX) {
        errors.push(issue('notes', 'TOO_LONG', 'Notes must be 2000 characters or fewer.'));
    }
    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Quotation request is invalid.', errors);
    }
    return {
        name,
        email,
        phone,
        country: country || '',
        notes,
    };
}

function submissionKeyFor(cart) {
    if (cart.ownerType === 'user' && cart.userId) {
        return `service-cart:user:${cart.userId}:${cart._id}`;
    }
    return `service-cart:${cart.sessionId}`;
}

async function notifyCartInquiry(notify, record) {
    if (!record || typeof notify?.notifyServiceCart !== 'function') return;
    try {
        await notify.notifyServiceCart(record);
    } catch {
        // Email failures must not undo a saved inquiry.
    }
}

function createServiceCartService(config, dependencies = {}) {
    const notify = dependencies.notifications || createNotificationService(config);
    return {
        async createSession() {
            const issued = issueSession(config);
            await ServiceCart.create({
                ownerType: 'guest',
                sessionId: issued.sessionId,
                tokenHash: issued.tokenHash,
                expiresAt: issued.expiresAt,
                status: 'open',
                items: [],
            });
            return {
                sessionId: issued.sessionId,
                token: issued.token,
                expiresAt: issued.expiresAt.toISOString(),
            };
        },

        async getCart(req) {
            const cart = await requireOpenCart(req);
            let dirty = false;
            for (const line of cart.items) {
                if (hasPriceSnapshot(line)) continue;
                const inspected = await inspectLine(line);
                if (!inspected.ok || !inspected.item || !inspected.category) continue;
                writeCatalogSnapshot(line, inspected.item, inspected.category, line.optionValueIds);
                dirty = true;
            }
            if (cart.ownerType === 'guest') {
                touchGuestExpiry(cart);
                dirty = true;
            }
            if (dirty) await cart.save();
            return presentCart(cart);
        },

        async addItem(req, body) {
            const cart = await requireOpenCart(req);
            if (!body || !body.serviceItemId) {
                throw new ApiError(400, 'BAD_REQUEST', 'Service item id is required.');
            }
            const { item, category } = await loadEligibleItem(body.serviceItemId);
            const optionValueIds = readOptionValueIds(body, item);
            const quantity = requireQuantity(body.quantity || 1);
            const incoming = { serviceItemId: item._id, optionValueIds };
            const existing = cart.items.find((line) => lineMatchKey(line) === lineMatchKey(incoming));
            if (existing) {
                const nextQuantity = existing.quantity + quantity;
                if (nextQuantity > 99) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                        issue('quantity', 'INVALID', 'Quantity cannot exceed 99.'),
                    ]);
                }
                existing.quantity = nextQuantity;
            } else {
                const line = {
                    lineId: crypto.randomUUID(),
                    serviceItemId: item._id,
                    optionValueIds,
                    quantity,
                };
                writeCatalogSnapshot(line, item, category, optionValueIds);
                cart.items.push(line);
            }
            touchGuestExpiry(cart);
            await cart.save();
            return presentCart(cart);
        },

        async updateItem(req, lineId, body) {
            const cart = await requireOpenCart(req);
            const existing = cart.items.find((line) => line.lineId === String(lineId));
            if (!existing) {
                throw new ApiError(404, 'NOT_FOUND', 'Cart item was not found.');
            }
            const { item, category } = await loadEligibleItem(existing.serviceItemId);
            if (body && body.optionValueIds !== undefined) {
                existing.optionValueIds = readOptionValueIds(body, item);
                writeCatalogSnapshot(existing, item, category, existing.optionValueIds);
            }
            if (body && body.quantity !== undefined) {
                existing.quantity = requireQuantity(body.quantity);
            }
            const duplicate = cart.items.find(
                (line) => line.lineId !== existing.lineId && lineMatchKey(line) === lineMatchKey(existing),
            );
            if (duplicate) {
                const nextQuantity = duplicate.quantity + existing.quantity;
                if (nextQuantity > 99) {
                    throw new ApiError(422, 'VALIDATION_ERROR', 'Cart item is invalid.', [
                        issue('quantity', 'INVALID', 'Quantity cannot exceed 99.'),
                    ]);
                }
                duplicate.quantity = nextQuantity;
                cart.items = cart.items.filter((line) => line.lineId !== existing.lineId);
            }
            touchGuestExpiry(cart);
            await cart.save();
            return presentCart(cart);
        },

        async removeItem(req, lineId) {
            const cart = await requireOpenCart(req);
            cart.items = cart.items.filter((line) => line.lineId !== String(lineId));
            touchGuestExpiry(cart);
            await cart.save();
            return presentCart(cart);
        },

        async submit(req, body) {
            const cart = await requireOpenCart(req);
            if (!cart.items.length) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'The cart is empty.', [
                    issue('items', 'REQUIRED', 'Add at least one item before submitting.'),
                ]);
            }
            const customer = validateCustomer(body?.customer || body || {});
            const acceptPriceChanges = body?.acceptPriceChanges === true;
            const presented = await presentCart(cart, { forSubmit: true, acceptPriceChanges });
            if (!presented.items.length) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'The cart is empty.', [
                    issue('items', 'REQUIRED', 'Add at least one item before submitting.'),
                ]);
            }
            const sources = [...new Set(presented.items.map((row) => row.categorySlug).filter(Boolean))];
            const snapshots = presented.items.map((row) => ({
                serviceItemId: row.serviceItemId,
                categorySlug: row.categorySlug,
                categoryNameEn: row.categoryNameEn,
                categoryNameVi: row.categoryNameVi,
                titleEn: row.titleEn,
                titleVi: row.titleVi,
                imagePath: row.imagePath,
                quantity: row.quantity,
                options: row.options,
                unitPrice: row.unitPrice,
                currency: row.currency,
                priceOnRequest: row.priceOnRequest,
                lineTotal: row.lineTotal,
                indicative: row.indicative === true,
            }));
            const submissionKey = submissionKeyFor(cart);
            const existing = await CustomBuildInquiry.findOne({ submissionKey });
            if (existing) {
                cart.status = 'submitted';
                cart.submittedInquiryId = existing.id;
                await cart.save();
                await notifyCartInquiry(notify, existing);
                return presentInquiry(existing, snapshots, customer, presented, cart);
            }

            const confirmationToken = crypto.randomBytes(32).toString('base64url');
            try {
                const record = await CustomBuildInquiry.create({
                    id: `inq_${crypto.randomUUID()}`,
                    status: 'received',
                    customer: {
                        name: customer.name,
                        email: customer.email,
                        phone: customer.phone,
                    },
                    configuration: {
                        selections: {
                            inquiryKind: 'service-cart',
                            sessionId: cart.ownerType === 'guest' ? cart.sessionId : null,
                            userId: cart.ownerType === 'user' && cart.userId ? String(cart.userId) : null,
                            sources,
                            country: customer.country,
                            quotationRequired: presented.quotationRequired,
                            subtotal: presented.subtotal,
                            items: snapshots,
                        },
                        notes: customer.notes || null,
                    },
                    message: customer.notes || null,
                    submissionKey,
                    confirmationTokenHash: hashToken(confirmationToken),
                });
                cart.status = 'submitted';
                cart.submittedInquiryId = record.id;
                await cart.save();
                await notifyCartInquiry(notify, record);
                return presentInquiry(record, snapshots, customer, presented, cart, confirmationToken);
            } catch (error) {
                if (error && (error.code === 11000 || error.code === 11001)) {
                    const raced = await CustomBuildInquiry.findOne({ submissionKey });
                    if (raced) {
                        cart.status = 'submitted';
                        cart.submittedInquiryId = raced.id;
                        await cart.save();
                        await notifyCartInquiry(notify, raced);
                        return presentInquiry(raced, snapshots, customer, presented, cart);
                    }
                }
                throw error;
            }
        },

        async getConfirmation(req) {
            const id = String(req.params.id || '').trim();
            const receipt = String(req.get('x-inquiry-receipt') || req.query?.receipt || '').trim();
            if (!id || !receipt) {
                throw new ApiError(401, 'UNAUTHORIZED', 'A confirmation receipt is required.');
            }
            const record = await CustomBuildInquiry.findOne({ id });
            if (!record || record.configuration?.selections?.inquiryKind !== 'service-cart') {
                throw new ApiError(404, 'NOT_FOUND', 'Inquiry was not found.');
            }
            if (!record.confirmationTokenHash || !tokensEqual(record.confirmationTokenHash, hashToken(receipt))) {
                throw new ApiError(401, 'UNAUTHORIZED', 'A confirmation receipt is required.');
            }
            return presentInquiry(record, record.configuration.selections.items || [], {
                country: record.configuration.selections.country || '',
            }, {
                quotationRequired: record.configuration.selections.quotationRequired,
                subtotal: record.configuration.selections.subtotal,
            }, null);
        },
    };
}

function presentInquiry(record, snapshots, customer, presented, cart, confirmationToken) {
    const selections = record.configuration?.selections || {};
    return {
        id: record.id,
        createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
        status: record.status === 'received' ? 'new' : record.status,
        customer: {
            name: record.customer.name,
            email: record.customer.email,
            phone: record.customer.phone,
        },
        country: selections.country || customer.country || '',
        notes: record.configuration?.notes || '',
        sessionId: selections.sessionId || null,
        userId: selections.userId || (cart?.ownerType === 'user' && cart.userId ? String(cart.userId) : null),
        sources: selections.sources || [],
        quotationRequired: Boolean(selections.quotationRequired ?? presented.quotationRequired),
        subtotal: selections.quotationRequired ? null : (selections.subtotal ?? presented.subtotal),
        items: Array.isArray(selections.items) && selections.items.length ? selections.items : snapshots,
        confirmationToken: confirmationToken || null,
    };
}

module.exports = { ALLOWED_SLUGS, createServiceCartService };
