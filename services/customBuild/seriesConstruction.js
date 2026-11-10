const BODY_KEY = 'bodyConstruction';
const NECK_KEY = 'neckConstruction';
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_MAX = 40;
const NAME_MAX = 80;

function trimText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function slugify(name) {
    const slug = String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, ID_MAX);
    return slug;
}

const ONE_PIECE_IDS = new Set(['single-piece', 'one-piece', '1-piece']);

function parsePieceCount(option) {
    const raw = option?.pieceCount ?? option?.pieces;
    const numbered = Number(raw);
    if (Number.isInteger(numbered) && numbered >= 1) return numbered;
    const id = String(option?.id || '').trim().toLowerCase();
    if (!id) return null;
    if (ONE_PIECE_IDS.has(id)) return 1;
    const match = id.match(/^(\d+)-pieces?$/);
    if (match) return Number(match[1]);
    if (id === 'multi-piece') return 2;
    return null;
}

function allocateId(name, used) {
    const base = slugify(name) || 'option';
    let next = ID_PATTERN.test(base) ? base : 'option';
    let suffix = 2;
    while (used.has(next)) {
        const candidate = `${base.slice(0, Math.max(1, ID_MAX - `-${suffix}`.length))}-${suffix}`;
        next = ID_PATTERN.test(candidate) ? candidate : `option-${suffix}`;
        suffix += 1;
    }
    used.add(next);
    return next;
}

function sanitizeConstructionList(list) {
    const used = new Set();
    const next = [];
    if (!Array.isArray(list)) return next;
    for (const item of list) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const enName = trimText(item.translations?.en?.name || item.enName || item.name).slice(0, NAME_MAX);
        const viName = trimText(item.translations?.vi?.name || item.viName).slice(0, NAME_MAX);
        if (!enName && !viName) continue;
        const lockedId = trimText(item.id);
        let id = lockedId;
        if (id && ID_PATTERN.test(id) && id.length <= ID_MAX && !used.has(id)) {
            used.add(id);
        } else {
            id = allocateId(enName || viName, used);
        }
        const pieceCount = parsePieceCount({ ...item, id });
        next.push({
            id,
            sortOrder: next.length,
            active: item.active !== false,
            name: enName || viName,
            translations: {
                en: { name: enName || viName },
                vi: { name: viName || enName },
            },
            ...(pieceCount != null ? { pieceCount } : {}),
        });
    }
    return next;
}

function constructionIds(attributes, key) {
    const list = Array.isArray(attributes?.[key]) ? attributes[key] : [];
    return new Set(list.map((item) => trimText(item?.id)).filter(Boolean));
}

function applySeriesConstructionAttributes(categoryId, merged, incoming) {
    if (categoryId !== 'series') {
        delete merged[BODY_KEY];
        delete merged[NECK_KEY];
        return merged;
    }
    const source = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : null;
    for (const key of [BODY_KEY, NECK_KEY]) {
        if (!source || !Object.prototype.hasOwnProperty.call(source, key)) continue;
        merged[key] = sanitizeConstructionList(source[key]);
    }
    return merged;
}

function removedConstructionIds(currentAttributes, nextAttributes, key) {
    const kept = constructionIds(nextAttributes, key);
    return [...constructionIds(currentAttributes, key)].filter((id) => !kept.has(id));
}

function notesUseConstruction(notes, field, constructionId) {
    const text = String(notes || '');
    if (!text || !constructionId) return false;
    for (const line of text.split(/\n/)) {
        const separator = line.indexOf('=');
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key === field && value === constructionId) return true;
    }
    return false;
}

function inquiryUsesSeriesConstruction(inquiry, constructionId, field) {
    if (!constructionId) return false;
    const selections = inquiry?.configuration?.selections;
    if (selections && typeof selections === 'object' && !Array.isArray(selections)) {
        if (String(selections[field] || '') === constructionId) return true;
    }
    return notesUseConstruction(inquiry?.configuration?.notes, field, constructionId);
}

module.exports = {
    BODY_KEY,
    NECK_KEY,
    applySeriesConstructionAttributes,
    removedConstructionIds,
    inquiryUsesSeriesConstruction,
    sanitizeConstructionList,
};
