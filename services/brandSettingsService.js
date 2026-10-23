const BrandSettings = require('../models/BrandSettings');
const { SETTINGS_KEY } = BrandSettings;
const { ApiError } = require('../utils/errors');
const { cleanString } = require('../utils/text');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9()\s.-]{6,40}$/;
const BODY_KEYS = new Set(['contact', 'workshops', 'display', 'hours']);
const CONTACT_KEYS = ['email', 'phone', 'whatsapp', 'facebook', 'instagram', 'youtube', 'other'];
const DISPLAY_KEYS = [...CONTACT_KEYS, 'hours'];
const WORKSHOP_SLOTS = ['workshop1', 'workshop2'];
const WORKSHOP_KEYS = new Set(['name', 'address', 'mapsUrl', 'note', 'enabled']);
const HOURS_KEYS = new Set(['en', 'vi']);
const URL_FIELDS = new Set(['facebook', 'instagram', 'youtube', 'other']);
const LIMITS = {
    email: 254,
    phone: 40,
    whatsapp: 80,
    facebook: 500,
    instagram: 500,
    youtube: 500,
    other: 500,
    name: 80,
    address: 300,
    mapsUrl: 500,
    note: 400,
    hours: 400,
};

function emptyWorkshop() {
    return {
        name: '',
        address: '',
        mapsUrl: '',
        note: '',
        enabled: true,
    };
}

function emptyContact() {
    return {
        email: '',
        phone: '',
        whatsapp: '',
        facebook: '',
        instagram: '',
        youtube: '',
        other: '',
    };
}

function emptyDisplay() {
    return {
        email: true,
        phone: true,
        whatsapp: true,
        facebook: true,
        instagram: true,
        youtube: true,
        other: true,
        hours: false,
    };
}

function emptyHours() {
    return { en: '', vi: '' };
}

function emptyAdmin() {
    return {
        contact: emptyContact(),
        workshops: {
            workshop1: emptyWorkshop(),
            workshop2: emptyWorkshop(),
        },
        display: emptyDisplay(),
        hours: emptyHours(),
        updatedAt: null,
        updatedBy: null,
    };
}

function emptyPublic() {
    return {
        email: null,
        phone: null,
        whatsapp: null,
        facebook: null,
        instagram: null,
        youtube: null,
        other: null,
        hours: null,
        workshops: [],
    };
}

function rejectUnknownKeys(value, allowed, prefix, errors) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    Object.keys(value).forEach((key) => {
        if (!allowed.has(key)) {
            errors.push({
                field: prefix ? `${prefix}.${key}` : key,
                code: 'UNKNOWN_FIELD',
                message: 'This field is not allowed.',
            });
        }
    });
}

function isHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function optionalText(value, max, field, errors) {
    const cleaned = cleanString(value);
    if (!cleaned) return '';
    if (cleaned.length > max) {
        errors.push({ field, code: 'TOO_LONG', message: `${field} is too long.` });
        return cleaned.slice(0, max);
    }
    return cleaned;
}

function optionalUrl(value, max, field, errors) {
    const cleaned = optionalText(value, max, field, errors);
    if (!cleaned) return '';
    if (!isHttpUrl(cleaned)) {
        errors.push({ field, code: 'INVALID', message: 'Enter a valid http(s) URL.' });
    }
    return cleaned;
}

function optionalEmail(value, field, errors) {
    const cleaned = optionalText(value, LIMITS.email, field, errors).toLowerCase();
    if (!cleaned) return '';
    if (!EMAIL_PATTERN.test(cleaned)) {
        errors.push({ field, code: 'INVALID', message: 'Enter a valid email address.' });
    }
    return cleaned;
}

function optionalPhone(value, field, errors) {
    const cleaned = optionalText(value, LIMITS.phone, field, errors);
    if (!cleaned) return '';
    if (!PHONE_PATTERN.test(cleaned)) {
        errors.push({ field, code: 'INVALID', message: 'Enter a valid phone number.' });
    }
    return cleaned;
}

function optionalWhatsapp(value, field, errors) {
    const cleaned = optionalText(value, LIMITS.whatsapp, field, errors);
    if (!cleaned) return '';
    if (isHttpUrl(cleaned) || PHONE_PATTERN.test(cleaned)) return cleaned;
    errors.push({ field, code: 'INVALID', message: 'Enter a WhatsApp number or http(s) URL.' });
    return cleaned;
}

function readBoolean(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
}

function normalizeWorkshop(input, slot, errors) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    rejectUnknownKeys(source, WORKSHOP_KEYS, `workshops.${slot}`, errors);
    return {
        name: optionalText(source.name, LIMITS.name, `workshops.${slot}.name`, errors),
        address: optionalText(source.address, LIMITS.address, `workshops.${slot}.address`, errors),
        mapsUrl: optionalUrl(source.mapsUrl, LIMITS.mapsUrl, `workshops.${slot}.mapsUrl`, errors),
        note: optionalText(source.note, LIMITS.note, `workshops.${slot}.note`, errors),
        enabled: readBoolean(source.enabled, true),
    };
}

function validateUpdate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const errors = [];
    rejectUnknownKeys(body, BODY_KEYS, '', errors);

    const contactSource = body.contact && typeof body.contact === 'object' && !Array.isArray(body.contact)
        ? body.contact
        : {};
    rejectUnknownKeys(contactSource, new Set(CONTACT_KEYS), 'contact', errors);
    const contact = {
        email: optionalEmail(contactSource.email, 'contact.email', errors),
        phone: optionalPhone(contactSource.phone, 'contact.phone', errors),
        whatsapp: optionalWhatsapp(contactSource.whatsapp, 'contact.whatsapp', errors),
        facebook: optionalUrl(contactSource.facebook, LIMITS.facebook, 'contact.facebook', errors),
        instagram: optionalUrl(contactSource.instagram, LIMITS.instagram, 'contact.instagram', errors),
        youtube: optionalUrl(contactSource.youtube, LIMITS.youtube, 'contact.youtube', errors),
        other: optionalUrl(contactSource.other, LIMITS.other, 'contact.other', errors),
    };

    const workshopsSource = body.workshops && typeof body.workshops === 'object' && !Array.isArray(body.workshops)
        ? body.workshops
        : {};
    rejectUnknownKeys(workshopsSource, new Set(WORKSHOP_SLOTS), 'workshops', errors);
    const workshops = {
        workshop1: normalizeWorkshop(workshopsSource.workshop1, 'workshop1', errors),
        workshop2: normalizeWorkshop(workshopsSource.workshop2, 'workshop2', errors),
    };

    const displaySource = body.display && typeof body.display === 'object' && !Array.isArray(body.display)
        ? body.display
        : {};
    rejectUnknownKeys(displaySource, new Set(DISPLAY_KEYS), 'display', errors);
    const defaults = emptyDisplay();
    const display = {};
    DISPLAY_KEYS.forEach((key) => {
        display[key] = readBoolean(displaySource[key], defaults[key]);
    });

    const hoursSource = body.hours && typeof body.hours === 'object' && !Array.isArray(body.hours)
        ? body.hours
        : {};
    rejectUnknownKeys(hoursSource, HOURS_KEYS, 'hours', errors);
    const hours = {
        en: optionalText(hoursSource.en, LIMITS.hours, 'hours.en', errors),
        vi: optionalText(hoursSource.vi, LIMITS.hours, 'hours.vi', errors),
    };

    if (errors.length) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Brand settings are invalid.', errors);
    }
    return { contact, workshops, display, hours };
}

function presentWorkshop(workshop) {
    const source = workshop || emptyWorkshop();
    return {
        name: source.name || '',
        address: source.address || '',
        mapsUrl: source.mapsUrl || '',
        note: source.note || '',
        enabled: source.enabled !== false,
    };
}

function presentAdmin(doc) {
    if (!doc) return emptyAdmin();
    const contact = { ...emptyContact(), ...(doc.contact ? doc.contact.toObject?.() || doc.contact : {}) };
    const workshops = doc.workshops ? doc.workshops.toObject?.() || doc.workshops : {};
    const display = { ...emptyDisplay(), ...(doc.display ? doc.display.toObject?.() || doc.display : {}) };
    const hours = { ...emptyHours(), ...(doc.hours ? doc.hours.toObject?.() || doc.hours : {}) };
    return {
        contact: {
            email: contact.email || '',
            phone: contact.phone || '',
            whatsapp: contact.whatsapp || '',
            facebook: contact.facebook || '',
            instagram: contact.instagram || '',
            youtube: contact.youtube || '',
            other: contact.other || '',
        },
        workshops: {
            workshop1: presentWorkshop(workshops.workshop1),
            workshop2: presentWorkshop(workshops.workshop2),
        },
        display: {
            email: display.email !== false,
            phone: display.phone !== false,
            whatsapp: display.whatsapp !== false,
            facebook: display.facebook !== false,
            instagram: display.instagram !== false,
            youtube: display.youtube !== false,
            other: display.other !== false,
            hours: display.hours === true,
        },
        hours: {
            en: hours.en || '',
            vi: hours.vi || '',
        },
        updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
        updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
    };
}

function presentPublic(doc) {
    const publicData = emptyPublic();
    if (!doc) return publicData;
    const admin = presentAdmin(doc);
    CONTACT_KEYS.forEach((key) => {
        if (admin.display[key] && admin.contact[key]) {
            publicData[key] = admin.contact[key];
        }
    });
    if (admin.display.hours && (admin.hours.en || admin.hours.vi)) {
        publicData.hours = {
            en: admin.hours.en || null,
            vi: admin.hours.vi || null,
        };
    }
    publicData.workshops = WORKSHOP_SLOTS
        .map((slot) => admin.workshops[slot])
        .filter((workshop) => workshop.enabled && (workshop.name || workshop.address))
        .map((workshop) => ({
            name: workshop.name || null,
            address: workshop.address || null,
            mapsUrl: workshop.mapsUrl || null,
            note: workshop.note || null,
        }));
    return publicData;
}

async function loadDocument() {
    return BrandSettings.findOne({ key: SETTINGS_KEY });
}

function createBrandSettingsService() {
    return {
        async getPublic() {
            return presentPublic(await loadDocument());
        },
        async getAdmin() {
            return presentAdmin(await loadDocument());
        },
        async update(body, user) {
            const input = validateUpdate(body);
            const doc = await BrandSettings.findOneAndUpdate(
                { key: SETTINGS_KEY },
                {
                    $set: {
                        contact: input.contact,
                        workshops: input.workshops,
                        display: input.display,
                        hours: input.hours,
                        updatedAt: new Date(),
                        updatedBy: user && user._id ? user._id : null,
                    },
                    $setOnInsert: { key: SETTINGS_KEY },
                },
                { upsert: true, new: true, runValidators: true },
            );
            return presentAdmin(doc);
        },
    };
}

module.exports = {
    createBrandSettingsService,
    emptyAdmin,
    emptyPublic,
    SETTINGS_KEY,
};
