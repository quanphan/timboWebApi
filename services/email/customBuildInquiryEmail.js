const { WIZARD_GROUPS } = require('../customBuild/wizardGroups');
const { toPublicCategory } = require('../customBuild/presenters');

const GOLD = '#c6a35a';
const INK = '#111111';
const IVORY = '#f4efe4';
const MUTED = '#b8b0a4';
const PANEL = '#1a1a1a';
const LINE = '#2a2a2a';

const HIDDEN_KEYS = new Set([
    'draftId',
    'inquiryKind',
    'inquiryType',
    'productId',
    'productRef',
    'subject',
    'language',
    'country',
]);

const FIELD_ALIASES = {
    'instrument-type': 'instrumentTypeId',
    series: 'seriesId',
    'body-shape': 'shapeId',
    scale: 'scaleId',
    'string-count': 'stringCount',
    radius: 'radiusId',
    'body-wood': 'bodyWoodId',
    'top-wood': 'topWoodId',
    'neck-wood': 'neckWoodId',
    'neck-construction': 'neckConstructionId',
    fingerboard: 'fingerboardWoodId',
    'neck-profile': 'neckProfileId',
    'fret-spec': 'fretSpecId',
    'pickup-config': 'pickupConfigId',
    pickups: 'pickupTypeId',
    bridge: 'bridgeId',
    tuners: 'tunerId',
    hardware: 'hardwareFinishId',
    electronics: 'controlLayoutId',
    'finish-type': 'finishTypeId',
    'finish-color': 'finishColorId',
    inlay: 'inlayId',
    engraving: 'engravingId',
};

const CATEGORY_BY_FIELD = {
    instrumentTypeId: 'instrument-type',
    seriesId: 'series',
    shapeId: 'body-shape',
    scaleId: 'scale',
    stringCount: 'string-count',
    radiusId: 'radius',
    bodyWoodId: 'body-wood',
    secondaryBodyWoodId: 'body-wood',
    topWoodId: 'top-wood',
    neckWoodId: 'neck-wood',
    secondaryNeckWoodId: 'neck-wood',
    neckConstructionId: 'neck-construction',
    fingerboardWoodId: 'fingerboard',
    neckProfileId: 'neck-profile',
    fretSpecId: 'fret-spec',
    pickupConfigId: 'pickup-config',
    pickupTypeId: 'pickups',
    bridgeId: 'bridge',
    tunerId: 'tuners',
    hardwareFinishId: 'hardware',
    controlLayoutId: 'electronics',
    finishTypeId: 'finish-type',
    finishColorId: 'finish-color',
    inlayId: 'inlay',
    engravingId: 'engraving',
};

const STEP_FIELDS = [
    { key: 'instrumentTypeId', step: 1 },
    { key: 'seriesId', step: 1 },
    { key: 'shapeId', step: 1 },
    { key: 'scaleId', step: 1 },
    { key: 'customScaleValue', step: 1, freeText: true },
    { key: 'stringCount', step: 1 },
    { key: 'radiusId', step: 1 },
    { key: 'bodyConstructionId', step: 2, construction: 'body' },
    { key: 'bodyWoodId', step: 2 },
    { key: 'secondaryBodyWoodId', step: 2, secondary: 'body' },
    { key: 'topWoodId', step: 2 },
    { key: 'neckPiecesId', step: 3, construction: 'neck' },
    { key: 'neckWoodId', step: 3 },
    { key: 'secondaryNeckWoodId', step: 3, secondary: 'neck' },
    { key: 'neckConstructionId', step: 3 },
    { key: 'fingerboardWoodId', step: 3 },
    { key: 'neckProfileId', step: 3 },
    { key: 'fretSpecId', step: 3 },
    { key: 'fretCount', step: 3, freeText: true },
    { key: 'pickupConfigId', step: 4, skipIfCustomerParts: true },
    { key: 'pickupTypeId', step: 4, skipIfCustomerParts: true },
    { key: 'bridgeId', step: 4, skipIfCustomerParts: true },
    { key: 'tunerId', step: 4, skipIfCustomerParts: true },
    { key: 'hardwareFinishId', step: 4, skipIfCustomerParts: true },
    { key: 'controlLayoutId', step: 4, skipIfCustomerParts: true },
    { key: 'customerSuppliedParts', step: 4, boolean: true },
    { key: 'finishTypeId', step: 5 },
    { key: 'finishColorId', step: 5 },
    { key: 'customColorNote', step: 5, freeText: true },
    { key: 'inlayId', step: 5 },
    { key: 'engravingId', step: 5 },
    { key: 'specialRequests', step: 5, freeText: true },
];

const COPY = {
    en: {
        brand: 'PHANQUAN GUITARS',
        kicker: 'CUSTOM BUILD INQUIRY',
        workshopTitle: 'New Custom Guitar Inquiry',
        workshopIntro: 'A customer submitted a new custom guitar build request through the PhanQuan Guitars website.',
        customerTitle: 'We received your custom guitar inquiry',
        customerHello: 'Hello {name},',
        customerIntro:
            'Thank you for your custom guitar inquiry. PhanQuan Guitars has received your request. We will contact you shortly via email or phone to discuss the design, specifications, and quotation.',
        disclaimer: 'This is a build inquiry, not a confirmed order or a final quotation.',
        inquiryInfo: 'Inquiry information',
        guitarConfig: 'Guitar configuration',
        inquiryId: 'Inquiry ID',
        submitted: 'Submitted',
        name: 'Customer name',
        email: 'Email',
        phone: 'Phone',
        country: 'Country',
        message: 'Message',
        images: 'Reference images',
        other: 'Other selections',
        yes: 'Yes',
        notProvided: 'Not provided',
        admin: 'Open in admin',
        adminNote: 'This admin path requires an authenticated workshop session.',
        footer: 'PhanQuan Guitars · Handmade in Vietnam',
        workshopSubject: 'New Custom Guitar Inquiry — {id}',
        customerSubject: 'PhanQuan Guitars — custom guitar inquiry {id}',
        steps: {
            1: '01. Instrument & Shape',
            2: '02. Body & Top',
            3: '03. Neck & Fingerboard',
            4: '04. Electronics & Hardware',
            5: '05. Finish & Details',
        },
        fields: {
            instrumentTypeId: 'Instrument type',
            seriesId: 'Series',
            shapeId: 'Body shape',
            scaleId: 'Scale length',
            customScaleValue: 'Custom scale',
            stringCount: 'Number of strings',
            radiusId: 'Fretboard radius',
            bodyConstructionId: 'Body pieces',
            bodyWoodId: 'Main body wood',
            secondaryBodyWoodId: 'Secondary body wood',
            topWoodId: 'Top wood',
            neckPiecesId: 'Neck pieces',
            neckWoodId: 'Main neck wood',
            secondaryNeckWoodId: 'Secondary neck wood',
            neckConstructionId: 'Neck construction',
            fingerboardWoodId: 'Fingerboard wood',
            neckProfileId: 'Neck profile',
            fretSpecId: 'Fret specification',
            fretCount: 'Number of frets',
            pickupConfigId: 'Pickup configuration',
            pickupTypeId: 'Pickup type',
            bridgeId: 'Bridge',
            tunerId: 'Tuners',
            hardwareFinishId: 'Hardware finish',
            controlLayoutId: 'Controls and electronics',
            customerSuppliedParts: 'Customer-supplied parts',
            finishTypeId: 'Finish type',
            finishColorId: 'Finish color',
            customColorNote: 'Custom colour notes',
            inlayId: 'Fingerboard inlay',
            engravingId: 'Logo / engraving',
            specialRequests: 'Special requests',
        },
    },
    vi: {
        brand: 'PHANQUAN GUITARS',
        kicker: 'YÊU CẦU CUSTOM BUILD',
        workshopTitle: 'Yêu cầu custom guitar mới',
        workshopIntro: 'Khách hàng vừa gửi yêu cầu custom guitar mới trên website PhanQuan Guitars.',
        customerTitle: 'Chúng tôi đã nhận yêu cầu custom guitar của bạn',
        customerHello: 'Xin chào {name},',
        customerIntro:
            'Cảm ơn bạn đã gửi yêu cầu custom guitar đến PhanQuan Guitars. Chúng tôi đã nhận được thông tin và sẽ sớm liên hệ qua email hoặc điện thoại để trao đổi chi tiết về thiết kế, cấu hình và báo giá.',
        disclaimer: 'Đây là yêu cầu custom, chưa phải xác nhận đơn hàng hoặc báo giá cuối cùng.',
        inquiryInfo: 'Thông tin enquiry',
        guitarConfig: 'Cấu hình guitar',
        inquiryId: 'Mã enquiry',
        submitted: 'Thời gian gửi',
        name: 'Tên khách hàng',
        email: 'Email',
        phone: 'Điện thoại',
        country: 'Quốc gia',
        message: 'Lời nhắn',
        images: 'Hình tham khảo',
        other: 'Lựa chọn khác',
        yes: 'Có',
        notProvided: 'Không có',
        admin: 'Mở trong admin',
        adminNote: 'Đường dẫn admin cần phiên đăng nhập của xưởng.',
        footer: 'PhanQuan Guitars · Thủ công tại Việt Nam',
        workshopSubject: 'Yêu cầu custom guitar mới — {id}',
        customerSubject: 'PhanQuan Guitars — yêu cầu custom guitar {id}',
        steps: {
            1: '01. Nhạc cụ & dáng đàn',
            2: '02. Thân đàn & mặt đàn',
            3: '03. Cần đàn & fingerboard',
            4: '04. Electronics & hardware',
            5: '05. Finish & chi tiết',
        },
        fields: {
            instrumentTypeId: 'Loại nhạc cụ',
            seriesId: 'Series',
            shapeId: 'Dáng thân',
            scaleId: 'Chiều dài scale',
            customScaleValue: 'Scale tuỳ chỉnh',
            stringCount: 'Số dây',
            radiusId: 'Radius fretboard',
            bodyConstructionId: 'Body pieces',
            bodyWoodId: 'Gỗ thân chính',
            secondaryBodyWoodId: 'Gỗ thân phụ',
            topWoodId: 'Gỗ mặt',
            neckPiecesId: 'Neck pieces',
            neckWoodId: 'Gỗ cần chính',
            secondaryNeckWoodId: 'Gỗ cần phụ',
            neckConstructionId: 'Cách dựng cần',
            fingerboardWoodId: 'Gỗ fingerboard',
            neckProfileId: 'Profile cần',
            fretSpecId: 'Thông số fret',
            fretCount: 'Số fret',
            pickupConfigId: 'Cấu hình pickup',
            pickupTypeId: 'Loại pickup',
            bridgeId: 'Bridge',
            tunerId: 'Khóa',
            hardwareFinishId: 'Finish hardware',
            controlLayoutId: 'Controls và electronics',
            customerSuppliedParts: 'Khách tự cung cấp linh kiện',
            finishTypeId: 'Loại finish',
            finishColorId: 'Màu finish',
            customColorNote: 'Ghi chú màu',
            inlayId: 'Inlay fingerboard',
            engravingId: 'Logo / khắc',
            specialRequests: 'Yêu cầu thêm',
        },
    },
};

function trimText(value) {
    return String(value ?? '').trim();
}

function oneLine(value) {
    return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function copyFor(language) {
    return language === 'vi' ? COPY.vi : COPY.en;
}

function canonicalKey(key) {
    return FIELD_ALIASES[key] || key;
}

function isEmptyValue(value) {
    if (value == null) return true;
    if (Array.isArray(value)) return value.every((item) => isEmptyValue(item));
    if (typeof value === 'boolean') return value === false;
    const text = String(value).trim();
    return text === '' || text === 'null' || text === 'undefined';
}

function parseInquiryNotes(notes) {
    const parsed = { language: 'en', country: '', wizard: {}, extra: [] };
    if (typeof notes !== 'string' || !notes.trim()) return parsed;
    let inWizard = false;
    for (const rawLine of notes.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line) continue;
        if (/^wizard:?$/i.test(line)) {
            inWizard = true;
            continue;
        }
        const separator = line.indexOf('=');
        if (separator <= 0) {
            parsed.extra.push(line);
            continue;
        }
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (!inWizard && key === 'language' && (value === 'vi' || value === 'en')) {
            parsed.language = value;
            continue;
        }
        if (!inWizard && key === 'country') {
            parsed.country = value;
            continue;
        }
        if (!inWizard && HIDDEN_KEYS.has(key)) continue;
        if (
            inWizard
            || key.endsWith('Id')
            || key === 'stringCount'
            || key === 'customColorNote'
            || key === 'specialRequests'
            || key === 'customerSuppliedParts'
            || key === 'customScaleValue'
            || key === 'fretCount'
        ) {
            parsed.wizard[canonicalKey(key)] = key === 'customerSuppliedParts'
                ? value === 'true' || value === '1'
                : value;
            continue;
        }
        parsed.extra.push(line);
    }
    return parsed;
}

function inquiryLanguage(record) {
    return parseInquiryNotes(record?.configuration?.notes).language === 'vi' ? 'vi' : 'en';
}

function optionName(option, language) {
    if (!option) return '';
    const current = language === 'vi' ? option.translations?.vi?.name : option.translations?.en?.name;
    const other = language === 'vi' ? option.translations?.en?.name : option.translations?.vi?.name;
    return trimText(current)
        || trimText(option.name)
        || trimText(option.attributes?.display)
        || trimText(other);
}

function optionAliases(option, categoryId) {
    const aliases = new Set();
    if (!option) return aliases;
    for (const value of [
        option.id,
        option.code,
        option.attributes?.wizardId,
        option.attributes?.value,
        option.attributes?.display,
    ]) {
        if (value != null && String(value).trim() !== '') aliases.add(String(value).trim());
    }
    const prefix = `${categoryId}.`;
    if (typeof option.id === 'string' && option.id.startsWith(prefix)) {
        aliases.add(option.id.slice(prefix.length));
    }
    return aliases;
}

function findOptionInCategory(category, value) {
    if (!category || value == null || value === '') return null;
    const needle = String(value).trim();
    return (category.options || []).find((option) => optionAliases(option, category.id).has(needle)) || null;
}

function findCategory(catalog, categoryId) {
    return (catalog?.categories || []).find((item) => item.id === categoryId) || null;
}

function findOption(catalog, categoryId, value) {
    if (value == null || value === '') return null;
    if (categoryId) {
        return findOptionInCategory(findCategory(catalog, categoryId), value);
    }
    const matches = [];
    for (const category of catalog?.categories || []) {
        const option = findOptionInCategory(category, value);
        if (option) matches.push(option);
    }
    return matches.length === 1 ? matches[0] : null;
}

function constructionList(series, key) {
    const attributes = series?.attributes && typeof series.attributes === 'object' ? series.attributes : {};
    return Array.isArray(attributes[key]) ? attributes[key] : [];
}

function findConstruction(series, key, id) {
    if (!id) return null;
    const needle = String(id);
    return constructionList(series, key).find((item) => String(item?.id) === needle) || null;
}

function usesSecondaryWood(option) {
    const raw = option?.pieceCount ?? option?.pieces;
    const numbered = Number(raw);
    if (Number.isInteger(numbered) && numbered >= 1) return numbered > 1;
    const id = String(option?.id || '').trim().toLowerCase();
    if (!id) return false;
    if (id === 'single-piece' || id === 'one-piece' || id === '1-piece') return false;
    const match = id.match(/^(\d+)-pieces?$/);
    if (match) return Number(match[1]) > 1;
    return id === 'multi-piece';
}

function logUnresolved(inquiryId, field, value) {
    console.error(JSON.stringify({
        level: 'warn',
        message: 'Custom build email could not resolve option name',
        inquiryId: inquiryId || null,
        field,
        value: String(value ?? '').slice(0, 120),
    }));
}

function resolveDisplayName(catalog, field, value, language, inquiryId) {
    if (isEmptyValue(value)) return '';
    if (Array.isArray(value)) {
        return value.map((item) => resolveDisplayName(catalog, field, item, language, inquiryId)).filter(Boolean).join(', ');
    }
    const spec = STEP_FIELDS.find((item) => item.key === field);
    if (spec?.freeText) return String(value);
    if (spec?.boolean || value === true || value === 'true' || value === '1') {
        return copyFor(language).yes;
    }
    const categoryId = CATEGORY_BY_FIELD[field];
    const option = findOption(catalog, categoryId, value);
    const name = optionName(option, language);
    if (name) return name;
    logUnresolved(inquiryId, field, value);
    return String(value);
}

function collectValues(record) {
    const notes = parseInquiryNotes(record?.configuration?.notes);
    const selections = record?.configuration?.selections && typeof record.configuration.selections === 'object'
        && !Array.isArray(record.configuration.selections)
        ? record.configuration.selections
        : {};
    const values = {};
    for (const [key, value] of Object.entries(selections)) {
        if (HIDDEN_KEYS.has(key) || key === 'inquiryKind') continue;
        values[canonicalKey(key)] = value;
    }
    Object.assign(values, notes.wizard);
    return { values, notes };
}

function knownFieldKeys() {
    return new Set(STEP_FIELDS.map((item) => item.key));
}

function shouldIncludeSecondary(values, catalog, kind) {
    const secondaryKey = kind === 'body' ? 'secondaryBodyWoodId' : 'secondaryNeckWoodId';
    if (isEmptyValue(values[secondaryKey])) return false;
    const constructionKey = kind === 'body' ? 'bodyConstructionId' : 'neckPiecesId';
    const constructionId = values[constructionKey];
    if (!constructionId) return true;
    const series = findOption(catalog, 'series', values.seriesId);
    const construction = findConstruction(series, kind === 'body' ? 'bodyConstruction' : 'neckConstruction', constructionId)
        || { id: constructionId };
    return usesSecondaryWood(construction);
}

function resolveConstructionName(catalog, values, kind, language, inquiryId) {
    const field = kind === 'body' ? 'bodyConstructionId' : 'neckPiecesId';
    const id = values[field];
    if (isEmptyValue(id)) return '';
    const series = findOption(catalog, 'series', values.seriesId);
    const construction = findConstruction(series, kind === 'body' ? 'bodyConstruction' : 'neckConstruction', id);
    const name = optionName(construction, language);
    if (name) return name;
    return resolveDisplayName(catalog, field, id, language, inquiryId);
}

function groupLabel(step, language) {
    const copy = copyFor(language);
    if (copy.steps[step]) return copy.steps[step];
    const known = WIZARD_GROUPS.find((item) => item.step === Number(step));
    return known ? `${String(step).padStart(2, '0')}. ${known.name}` : `${copy.other}`;
}

function fieldLabel(copy, key) {
    return copy.fields[key] || key;
}

function buildConfigGroups(record, catalog, language) {
    const { values } = collectValues(record);
    const inquiryId = record?.id;
    const copy = copyFor(language);
    const customerParts = Boolean(values.customerSuppliedParts);
    const groups = new Map();

    function addRow(step, key, value) {
        if (isEmptyValue(value)) return;
        if (!groups.has(step)) groups.set(step, { step, title: groupLabel(step, language), rows: [] });
        groups.get(step).rows.push({ key, label: fieldLabel(copy, key), value: String(value) });
    }

    for (const spec of STEP_FIELDS) {
        if (spec.skipIfCustomerParts && customerParts) continue;
        if (spec.boolean && spec.key === 'customerSuppliedParts' && !customerParts) continue;
        if (spec.secondary && !shouldIncludeSecondary(values, catalog, spec.secondary)) continue;
        let display = '';
        if (spec.construction) {
            display = resolveConstructionName(catalog, values, spec.construction, language, inquiryId);
        } else if (spec.boolean) {
            display = customerParts ? copy.yes : '';
        } else {
            display = resolveDisplayName(catalog, spec.key, values[spec.key], language, inquiryId);
        }
        addRow(spec.step, spec.key, display);
    }

    const known = knownFieldKeys();
    for (const [key, raw] of Object.entries(values)) {
        if (known.has(key) || HIDDEN_KEYS.has(key)) continue;
        const display = resolveDisplayName(catalog, key, raw, language, inquiryId);
        addRow(6, key, display);
    }

    return [...groups.values()]
        .filter((group) => group.rows.length)
        .sort((a, b) => Number(a.step) - Number(b.step));
}

function formatSubmittedAt(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

function displayContact(value, emptyLabel) {
    const text = oneLine(value);
    return text || emptyLabel;
}

function imageLink(publicBaseUrl, imagePath) {
    if (!imagePath) return '';
    if (!publicBaseUrl) return imagePath;
    return `${publicBaseUrl}${imagePath}`;
}

function infoRows(record, bases, language) {
    const copy = copyFor(language);
    const customer = record.customer || {};
    const notes = parseInquiryNotes(record.configuration?.notes);
    const submitted = formatSubmittedAt(record.createdAt);
    const rows = [
        { label: copy.inquiryId, value: displayContact(record.id, copy.notProvided) },
    ];
    if (submitted) rows.push({ label: copy.submitted, value: submitted });
    rows.push(
        { label: copy.name, value: displayContact(customer.name, copy.notProvided) },
        { label: copy.email, value: displayContact(customer.email, copy.notProvided) },
        { label: copy.phone, value: displayContact(customer.phone, copy.notProvided) },
    );
    if (notes.country) rows.push({ label: copy.country, value: notes.country });
    const message = trimText(record.message);
    if (message) rows.push({ label: copy.message, value: message, multiline: true });
    const images = Array.isArray(record.referenceImages) ? record.referenceImages : [];
    if (images.length) {
        rows.push({
            label: copy.images,
            value: images.map((path) => imageLink(bases.publicBaseUrl, path)).join('\n'),
            multiline: true,
        });
    }
    return rows;
}

function nlHtml(value) {
    return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function sectionHeadingHtml(title) {
    return `<tr><td style="padding:28px 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${GOLD};border-top:1px solid ${LINE};">${escapeHtml(title)}</td></tr>`;
}

function rowHtml(label, value, multiline) {
    const rendered = multiline ? nlHtml(value) : escapeHtml(value);
    return `<tr><td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="38%" valign="top" style="padding:0 16px 0 0;font-size:12px;color:${MUTED};">${escapeHtml(label)}</td>
          <td valign="top" style="font-size:14px;line-height:1.5;color:${IVORY};">${rendered}</td>
        </tr>
      </table>
    </td></tr>`;
}

function buildHtml({ copy, title, intro, extraLines, info, groups, adminPath, link, includeAdmin }) {
    const groupBlocks = groups.map((group) => (
        `${sectionHeadingHtml(group.title)}${group.rows.map((row) => rowHtml(row.label, row.value, Boolean(row.multiline))).join('')}`
    )).join('');
    const extraHtml = extraLines.map((line) => (
        `<tr><td style="padding:8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${IVORY};">${escapeHtml(line)}</td></tr>`
    )).join('');
    const adminHtml = includeAdmin && adminPath
        ? `${sectionHeadingHtml('Admin')}${rowHtml('Path', adminPath)}${link ? `<tr><td style="padding:16px 0 0 0;"><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 18px;background:${GOLD};color:${INK};text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(copy.admin)}</a></td></tr>` : ''}<tr><td style="padding:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">${escapeHtml(copy.adminNote)}</td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="${copy === COPY.vi ? 'vi' : 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${PANEL};">
          <tr>
            <td style="padding:28px 28px 18px 28px;border-bottom:3px solid ${GOLD};">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;color:${GOLD};">${escapeHtml(copy.brand)}</div>
              <div style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.18em;color:${MUTED};">${escapeHtml(copy.kicker)}</div>
              <h1 style="margin:14px 0 0 0;font-family:Georgia,Times,serif;font-size:26px;line-height:1.25;font-weight:normal;color:${IVORY};">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${extraHtml}
                ${intro ? `<tr><td style="padding:18px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${IVORY};">${escapeHtml(intro)}</td></tr>` : ''}
                ${sectionHeadingHtml(copy.inquiryInfo)}
                ${info.map((row) => rowHtml(row.label, row.value, row.multiline)).join('')}
                ${groups.length ? sectionHeadingHtml(copy.guitarConfig) : ''}
                ${groupBlocks}
                ${adminHtml}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px;border-top:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;color:${MUTED};">${escapeHtml(copy.footer)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText({ copy, title, intro, extraLines, info, groups, adminPath, link, includeAdmin }) {
    const lines = [
        copy.brand,
        copy.kicker,
        title,
        '',
        ...extraLines,
    ];
    if (intro) lines.push(intro, '');
    lines.push(copy.inquiryInfo.toUpperCase());
    for (const row of info) {
        lines.push(`${row.label}: ${row.value}`);
    }
    if (groups.length) {
        lines.push('', copy.guitarConfig.toUpperCase());
        for (const group of groups) {
            lines.push('', group.title);
            for (const row of group.rows) {
                lines.push(`${row.label}: ${row.value}`);
            }
        }
    }
    if (includeAdmin && adminPath) {
        lines.push('', `Admin path: ${adminPath}`, copy.adminNote);
        if (link) lines.push(`Admin link: ${link}`);
    }
    lines.push('', copy.footer);
    return lines.filter((line, index, list) => !(line === '' && list[index - 1] === '')).join('\n');
}

function inquiryEmailModel(record, bases = {}, catalog, { audience } = {}) {
    const language = inquiryLanguage(record);
    const copy = copyFor(language);
    const customer = record.customer || {};
    const name = displayContact(customer.name, copy.notProvided);
    const groups = buildConfigGroups(record, catalog, language);
    const info = infoRows(record, bases, language);
    const workshop = audience === 'workshop';
    const title = workshop ? copy.workshopTitle : copy.customerTitle;
    const extraLines = workshop
        ? []
        : [copy.customerHello.replace('{name}', name), copy.customerIntro, copy.disclaimer];
    const intro = workshop ? copy.workshopIntro : '';
    const adminPath = `/admin/inquiries/${encodeURIComponent(String(record.id))}`;
    const link = bases.frontendBaseUrl ? `${bases.frontendBaseUrl}${adminPath}` : '';
    const payload = {
        copy,
        title,
        intro,
        extraLines,
        info,
        groups,
        adminPath,
        link,
        includeAdmin: workshop,
    };
    return {
        language,
        subject: (workshop ? copy.workshopSubject : copy.customerSubject).replace('{id}', displayContact(record.id, '')),
        text: buildText(payload),
        html: buildHtml(payload),
        groups,
    };
}

function customBuildWorkshopEmail(record, bases, catalog) {
    const model = inquiryEmailModel(record, bases, catalog, { audience: 'workshop' });
    return { subject: model.subject, text: model.text, html: model.html };
}

function customBuildCustomerEmail(record, bases, catalog) {
    const model = inquiryEmailModel(record, bases, catalog, { audience: 'customer' });
    return { subject: model.subject, text: model.text, html: model.html };
}

async function loadWizardCatalog(CustomBuildOption) {
    if (!CustomBuildOption || typeof CustomBuildOption.find !== 'function') return null;
    try {
        const docs = await CustomBuildOption.find().sort({ sortOrder: 1, id: 1 }).lean();
        return {
            categories: (docs || []).map((doc) => toPublicCategory(doc, { includeInactive: true })),
        };
    } catch (error) {
        console.error(JSON.stringify({
            level: 'error',
            message: 'Custom build email catalog load failed',
            name: error && error.name ? error.name : 'Error',
        }));
        return null;
    }
}

module.exports = {
    COPY,
    parseInquiryNotes,
    inquiryLanguage,
    findOption,
    resolveDisplayName,
    buildConfigGroups,
    customBuildWorkshopEmail,
    customBuildCustomerEmail,
    loadWizardCatalog,
    optionName,
};
