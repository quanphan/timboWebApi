const mongoose = require('mongoose');
const CustomBuildOption = require('../../models/CustomBuildOption');
const CustomBuildInquiry = require('../../models/CustomBuildInquiry');
const { ApiError } = require('../../utils/errors');
const { cleanString } = require('../../utils/text');
const { isCategoryId, isOptionId } = require('./ids');
const { COMPATIBILITY_KEYS } = require('./wizardGroups');
const { toAdminCategory, toAdminOption, optionCode } = require('./presenters');
const { ensureWizardCatalog } = require('./ensureWizardCatalog');
const { validateCompatibilityValues, validateDefaultScopes, optionAliases } = require('./compatibility');
const {
    BODY_KEY,
    NECK_KEY,
    applySeriesConstructionAttributes,
    inquiryUsesSeriesConstruction,
    removedConstructionIds,
} = require('./seriesConstruction');

const NAME_MAX = 120;
const TEXT_MAX = 800;
const CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(details) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Custom build setup is invalid.', details);
}

function readCode(value) {
    return cleanString(value).toLowerCase();
}

function readCompatibility(value) {
    if (value == null || value === '') return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        return { error: { field: 'compatibility', code: 'INVALID', message: 'Compatibility must be an object.' } };
    }
    const next = {};
    for (const key of COMPATIBILITY_KEYS) {
        if (value[key] === undefined) continue;
        if (!Array.isArray(value[key])) {
            return { error: { field: `compatibility.${key}`, code: 'INVALID', message: `${key} must be an array.` } };
        }
        const unique = [];
        const seen = new Set();
        for (const item of value[key]) {
            const normalized = key === 'stringCounts' && Number.isFinite(Number(item)) && String(item).trim() !== '' && !String(item).includes('-')
                ? Number(item)
                : String(item).trim();
            if (normalized === '' || seen.has(String(normalized))) continue;
            seen.add(String(normalized));
            unique.push(normalized);
        }
        next[key] = unique;
    }
    return { value: next };
}

function hasOwn(object, key) {
    return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function mergeCompatibility(current, incoming) {
    if (incoming === undefined) {
        return {
            value: current && typeof current === 'object' && !Array.isArray(current) ? current : {},
        };
    }
    const parsed = readCompatibility(incoming);
    if (parsed.error) return parsed;
    const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    return { value: { ...base, ...parsed.value } };
}

function mergeAttributes(current, incoming) {
    const base = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
    if (incoming === undefined) return base;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return base;
    const next = { ...base, ...incoming };
    if (base.wizardId != null && String(base.wizardId) !== '') {
        next.wizardId = base.wizardId;
    }
    return next;
}

function assertImmutableIdentifiers(current, body, categoryId) {
    const currentCode = optionCode(current, categoryId);
    if (hasOwn(body, 'code') && body.code != null && String(body.code).trim() !== '') {
        const requested = readCode(body.code);
        if (requested !== currentCode) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Custom build setup is invalid.', [
                { field: 'code', code: 'IMMUTABLE', message: 'Option code cannot be changed after create.' },
            ]);
        }
    }
    if (hasOwn(body, 'id') && body.id != null && String(body.id).trim() !== '' && String(body.id) !== String(current.id)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Custom build setup is invalid.', [
            { field: 'id', code: 'IMMUTABLE', message: 'Option id cannot be changed after create.' },
        ]);
    }
}

function readDefaultForInstrumentTypeIds(value) {
    if (value === undefined) return { omitted: true };
    if (value == null || value === '') return { value: [] };
    if (!Array.isArray(value)) {
        return { error: { field: 'defaultForInstrumentTypeIds', code: 'INVALID', message: 'defaultForInstrumentTypeIds must be an array.' } };
    }
    return {
        value: [...new Set(value.map((item) => String(item).trim()).filter(Boolean))],
    };
}

function readImagePath(value) {
    if (value === undefined) return { omitted: true };
    const path = cleanString(value);
    if (!path) return '';
    if (!path.startsWith('/uploads/') || path.includes('..') || path.includes('\\')) {
        return { error: { field: 'imagePath', code: 'INVALID', message: 'imagePath must be an uploaded file path.' } };
    }
    return path.slice(0, 240);
}

function descriptionFromRoot(value, locale) {
    if (typeof value === 'string') return locale === 'en' ? value : '';
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return typeof value[locale] === 'string' ? value[locale] : '';
    }
    return '';
}

function translationsFrom(body, fallbackName, existing) {
    const viSource = body.translations?.vi
        ? { ...(existing?.vi || {}), ...body.translations.vi }
        : (existing?.vi || {});
    const enSource = body.translations?.en
        ? { ...(existing?.en || {}), ...body.translations.en }
        : (existing?.en || {});
    const viSent = body.translations?.vi && Object.prototype.hasOwnProperty.call(body.translations.vi, 'description');
    const enSent = body.translations?.en && Object.prototype.hasOwnProperty.call(body.translations.en, 'description');
    if (!viSent && body.description !== undefined && !cleanString(viSource.description)) {
        viSource.description = descriptionFromRoot(body.description, 'vi') || viSource.description;
    }
    if (!enSent && body.description !== undefined && !cleanString(enSource.description)) {
        enSource.description = descriptionFromRoot(body.description, 'en') || enSource.description;
    }
    return {
        vi: {
            name: cleanString(viSource.name).slice(0, NAME_MAX),
            description: cleanString(viSource.description).slice(0, TEXT_MAX),
        },
        en: {
            name: cleanString(enSource.name || fallbackName).slice(0, NAME_MAX),
            description: cleanString(enSource.description).slice(0, TEXT_MAX),
        },
    };
}

function topLevelDescription(body, existing) {
    if (body.description === undefined) return existing.description ?? null;
    if (body.description && typeof body.description === 'object' && !Array.isArray(body.description)) {
        return cleanString(body.description.en).slice(0, TEXT_MAX) || null;
    }
    return cleanString(body.description).slice(0, TEXT_MAX) || null;
}

function optionFromBody(category, body, existing = {}) {
    const errors = [];
    const name = cleanString(body.name).slice(0, NAME_MAX) || cleanString(existing.name).slice(0, NAME_MAX);
    if (!name) errors.push({ field: 'name', code: 'REQUIRED', message: 'Name is required.' });
    const existingCode = existing.code || (existing.id ? optionCode(existing, category.id) : '');
    const code = existingCode || readCode(body.code);
    if (!existingCode && (!code || !CODE_PATTERN.test(code) || code.length > 40)) {
        errors.push({ field: 'code', code: 'INVALID', message: 'Use a lowercase slug such as electric-guitar.' });
    }
    const id = existing.id || `${category.id}.${code}`;
    if (!isOptionId(id)) {
        errors.push({ field: 'code', code: 'INVALID', message: 'Option id is invalid for this category.' });
    }
    const compatibility = mergeCompatibility(existing.compatibility, body.compatibility);
    if (compatibility.error) errors.push(compatibility.error);
    const imagePath = readImagePath(body.imagePath);
    if (imagePath && imagePath.error) errors.push(imagePath.error);
    if (errors.length) invalid(errors);

    const scopes = readDefaultForInstrumentTypeIds(body.defaultForInstrumentTypeIds);
    if (scopes.error) errors.push(scopes.error);
    if (errors.length) invalid(errors);

    const active = body.active === undefined ? existing.active !== false : body.active !== false;
    const isDefault = !active
        ? false
        : (body.isDefault === undefined ? Boolean(existing.isDefault) : Boolean(body.isDefault));
    const defaultForInstrumentTypeIds = !active
        ? []
        : (scopes.omitted ? (existing.defaultForInstrumentTypeIds || []) : (scopes.value || []));
    if ((isDefault || defaultForInstrumentTypeIds.length) && !active) {
        invalid([{ field: 'isDefault', code: 'INVALID', message: 'A default option must be active.' }]);
    }

    const resolvedImagePath = imagePath?.omitted ? (existing.imagePath || '') : (imagePath || '');
    const resolvedAttributes = applySeriesConstructionAttributes(
        category.id,
        mergeAttributes(existing.attributes, body.attributes),
        body.attributes,
    );
    const sortOrder = Number.isFinite(Number(body.sortOrder))
        ? Number(body.sortOrder)
        : (Number.isFinite(Number(existing.sortOrder)) ? Number(existing.sortOrder) : (category.options || []).length);

    return {
        id,
        name,
        description: topLevelDescription(body, existing),
        active,
        code,
        imagePath: resolvedImagePath,
        icon: body.icon !== undefined ? cleanString(body.icon).slice(0, 40) : (existing.icon || ''),
        isDefault,
        defaultForInstrumentTypeIds,
        sortOrder,
        translations: translationsFrom(body, name, existing.translations),
        compatibility: compatibility.value || {},
        attributes: resolvedAttributes,
    };
}

function optionsShareIdentity(left, right, categoryId) {
    return String(left?.id) === String(right?.id)
        && optionCode(left, categoryId) === optionCode(right, categoryId);
}

function applyDefaultUniqueness(options, nextOption, categoryId) {
    const claimed = new Set(nextOption.defaultForInstrumentTypeIds || []);
    return options.map((raw) => {
        const item = raw.toObject?.() || raw;
        if (optionsShareIdentity(item, nextOption, categoryId)) return nextOption;
        const next = { ...item };
        if (nextOption.isDefault) next.isDefault = false;
        if (claimed.size) {
            next.defaultForInstrumentTypeIds = (item.defaultForInstrumentTypeIds || []).filter((typeId) => !claimed.has(typeId));
        }
        return next;
    });
}

async function catalogById() {
    const docs = await CustomBuildOption.find().lean();
    return new Map(docs.map((item) => [item.id, item]));
}

function assertOptionRelations(next, catalog, categoryId, existing) {
    const errors = [
        ...validateCompatibilityValues(next.compatibility, catalog, categoryId, existing?.compatibility),
        ...validateDefaultScopes({
            defaultForInstrumentTypeIds: next.defaultForInstrumentTypeIds,
            compatibility: next.compatibility,
            active: next.active,
            catalogById: catalog,
            existingTypeIds: existing?.defaultForInstrumentTypeIds,
        }),
    ];
    if (errors.length) invalid(errors);
}

const NOTE_FIELDS_BY_CATEGORY = {
    'instrument-type': ['instrumentTypeId', 'instrument-type'],
    series: ['seriesId', 'series'],
    'body-shape': ['shapeId', 'body-shape'],
    scale: ['scaleId', 'scale'],
    'string-count': ['stringCount', 'string-count'],
    radius: ['radiusId', 'radius'],
    'body-wood': ['bodyWoodId', 'body-wood'],
    'top-wood': ['topWoodId', 'top-wood'],
    'neck-wood': ['neckWoodId', 'neck-wood'],
    'neck-construction': ['neckConstructionId', 'neck-construction'],
    fingerboard: ['fingerboardWoodId', 'fingerboard'],
    'neck-profile': ['neckProfileId', 'neck-profile'],
    'fret-spec': ['fretSpecId', 'fret-spec'],
    'pickup-config': ['pickupConfigId', 'pickup-config'],
    pickups: ['pickupTypeId', 'pickups'],
    bridge: ['bridgeId', 'bridge'],
    tuners: ['tunerId', 'tuners'],
    hardware: ['hardwareFinishId', 'hardware'],
    electronics: ['controlLayoutId', 'electronics'],
    'finish-type': ['finishTypeId', 'finish-type'],
    'finish-color': ['finishColorId', 'finish-color'],
    inlay: ['inlayId', 'inlay'],
    engraving: ['engravingId', 'engraving'],
};

function valuesContain(value, needles) {
    if (value == null) return false;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return needles.has(String(value));
    }
    if (Array.isArray(value)) return value.some((item) => valuesContain(item, needles));
    if (typeof value === 'object') return Object.values(value).some((item) => valuesContain(item, needles));
    return false;
}

function notesUseOption(notes, option, categoryId) {
    const text = String(notes || '');
    if (!text) return false;
    const optionId = String(option.id || '');
    if (optionId && text.includes(optionId)) return true;
    const aliases = optionAliases(option, categoryId);
    const fields = NOTE_FIELDS_BY_CATEGORY[categoryId] || [];
    if (!fields.length) return false;
    for (const line of text.split(/\n/)) {
        const separator = line.indexOf('=');
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (!fields.includes(key) || !value) continue;
        if (aliases.has(value)) return true;
    }
    return false;
}

function inquiryUsesOption(inquiry, option, categoryId) {
    const aliases = optionAliases(option, categoryId);
    if (valuesContain(inquiry.configuration?.selections, aliases)) return true;
    return notesUseOption(inquiry.configuration?.notes, option, categoryId);
}

function isTransactionUnsupported(error) {
    const message = String(error?.message || '');
    return error?.code === 20
        || error?.codeName === 'IllegalOperation'
        || /Transaction numbers are only allowed/i.test(message)
        || /replica set member or mongos/i.test(message);
}

function optionPlain(option) {
    if (!option) return option;
    if (typeof option.toObject === 'function') return option.toObject();
    return { ...option };
}

function stripAliasesFromOption(option, aliases) {
    const next = optionPlain(option);
    let changed = false;
    const compatibility = next.compatibility && typeof next.compatibility === 'object' && !Array.isArray(next.compatibility)
        ? { ...next.compatibility }
        : {};
    for (const key of COMPATIBILITY_KEYS) {
        if (!Array.isArray(compatibility[key])) continue;
        const filtered = compatibility[key].filter((value) => !aliases.has(String(value)));
        if (filtered.length !== compatibility[key].length) {
            compatibility[key] = filtered;
            changed = true;
        }
    }
    next.compatibility = compatibility;
    if (Array.isArray(next.defaultForInstrumentTypeIds)) {
        const filtered = next.defaultForInstrumentTypeIds.filter((value) => !aliases.has(String(value)));
        if (filtered.length !== next.defaultForInstrumentTypeIds.length) {
            next.defaultForInstrumentTypeIds = filtered;
            changed = true;
        }
    }
    return { option: next, changed };
}

function buildDeletePlan(docs, categoryId, option, optionIndex) {
    const aliases = optionAliases(option, categoryId);
    const updates = [];
    for (const doc of docs) {
        const currentOptions = (doc.options || []).map(optionPlain);
        let changed = false;
        let nextOptions = currentOptions;
        if (doc.id === categoryId) {
            nextOptions = currentOptions.filter((item, itemIndex) => (
                Number.isInteger(optionIndex) ? itemIndex !== optionIndex : item.id !== option.id
            ));
            changed = nextOptions.length !== currentOptions.length;
        }
        nextOptions = nextOptions.map((item) => {
            const stripped = stripAliasesFromOption(item, aliases);
            if (stripped.changed) changed = true;
            return stripped.option;
        });
        if (changed) updates.push({ id: doc.id, options: nextOptions });
    }
    return { updates, aliases };
}

async function restoreCategorySnapshots(snapshots) {
    for (const snap of snapshots) {
        await CustomBuildOption.updateOne(
            { id: snap.id },
            { $set: { options: snap.options, metadata: snap.metadata } },
        );
    }
}

function resolveOptionId(optionId) {
    if (typeof optionId !== 'string') return '';
    try {
        return decodeURIComponent(optionId);
    } catch {
        return optionId;
    }
}

function findOption(category, optionId, codeHint) {
    const raw = resolveOptionId(optionId);
    const hint = typeof codeHint === 'string' ? codeHint.trim() : '';
    const options = category.options || [];
    const idMatches = [];
    options.forEach((option, index) => {
        if (option.id === raw || option.id === optionId) idMatches.push({ index, option });
    });
    if (idMatches.length === 1) return idMatches[0];
    if (idMatches.length > 1) {
        if (hint) {
            const hit = idMatches.find((item) => optionCode(item.option, category.id) === hint);
            if (hit) return hit;
        }
        return idMatches[0];
    }
    const index = options.findIndex((item) => (
        optionCode(item, category.id) === raw || optionCode(item, category.id) === optionId
    ));
    return { index, option: index >= 0 ? options[index] : null };
}

function optionIdTaken(category, id, code) {
    return (category.options || []).some((item) => (
        item.id === id || optionCode(item, category.id) === code
    ));
}

function identitySets(options, categoryId) {
    const ids = new Set();
    const codes = new Set();
    for (const item of options || []) {
        if (item?.id) ids.add(String(item.id));
        const code = optionCode(item, categoryId);
        if (code) codes.add(String(code));
    }
    return { ids, codes };
}

function allocateUniqueCopyIdentity(category, source, extraOptions = []) {
    const base = optionCode(source, category.id);
    const { ids, codes } = identitySets([...(category.options || []), ...extraOptions], category.id);
    ids.add(String(source.id || ''));
    codes.add(String(base || ''));
    for (let suffix = 2; suffix < 1000; suffix += 1) {
        const code = `${base}-${suffix}`;
        const id = `${category.id}.${code}`;
        if (!CODE_PATTERN.test(code) || code.length > 40 || !isOptionId(id)) continue;
        if (ids.has(id) || codes.has(code)) continue;
        return { id, code };
    }
    invalid([{ field: 'code', code: 'INVALID', message: 'Could not allocate a unique option code.' }]);
}

function nextDuplicateCode(category, source) {
    return allocateUniqueCopyIdentity(category, source).code;
}

function countBy(values) {
    const counts = new Map();
    for (const value of values) {
        const key = String(value || '');
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

function repairCollidingOptionIdentities(category) {
    const options = (category.options || []).map(optionPlain);
    const idCounts = countBy(options.map((item) => item.id));
    const codeCounts = countBy(options.map((item) => optionCode(item, category.id)));
    const changes = [];

    options.forEach((option, index) => {
        const currentCode = optionCode(option, category.id);
        const duplicateId = (idCounts.get(String(option.id)) || 0) > 1;
        const duplicateCode = (codeCounts.get(String(currentCode)) || 0) > 1;
        if (!duplicateId && !duplicateCode) return;

        const canonicalId = `${category.id}.${currentCode}`;
        if (duplicateId && !duplicateCode && String(option.id) === canonicalId) return;

        const others = options.filter((_, itemIndex) => itemIndex !== index);
        const { ids, codes } = identitySets(others, category.id);
        let nextId = canonicalId;
        let nextCode = currentCode;
        if (duplicateCode || ids.has(nextId) || codes.has(nextCode)) {
            const allocated = allocateUniqueCopyIdentity(
                { ...category, options: others },
                { id: option.id, code: currentCode },
            );
            nextId = allocated.id;
            nextCode = allocated.code;
        }

        if (nextId === option.id && nextCode === currentCode) return;
        changes.push({
            index,
            from: { id: option.id, code: currentCode },
            to: { id: nextId, code: nextCode },
        });
        option.id = nextId;
        option.code = nextCode;
        if (option.attributes && typeof option.attributes === 'object' && !Array.isArray(option.attributes)) {
            if (option.attributes.wizardId != null && String(option.attributes.wizardId) !== '') {
                option.attributes = { ...option.attributes, wizardId: nextCode };
            }
        }
        idCounts.set(String(option.id), (idCounts.get(String(option.id)) || 0) + 1);
        codeCounts.set(String(currentCode), Math.max(0, (codeCounts.get(String(currentCode)) || 1) - 1));
        codeCounts.set(String(nextCode), (codeCounts.get(String(nextCode)) || 0) + 1);
    });

    return { options, changes };
}

async function optionUsedInInquiries(option, categoryId, session) {
    const query = CustomBuildInquiry.find({}, { 'configuration.selections': 1, 'configuration.notes': 1 }).lean();
    if (session) query.session(session);
    const inquiries = await query;
    return inquiries.some((inquiry) => inquiryUsesOption(inquiry, option, categoryId));
}

async function assertConstructionDeletesAllowed(current, next) {
    const removed = [
        ...removedConstructionIds(current.attributes, next.attributes, BODY_KEY).map((id) => ({ id, field: 'bodyConstructionId' })),
        ...removedConstructionIds(current.attributes, next.attributes, NECK_KEY).map((id) => ({ id, field: 'neckConstructionId' })),
    ];
    if (!removed.length) return;
    const inquiries = await CustomBuildInquiry.find({}, { 'configuration.selections': 1, 'configuration.notes': 1 }).lean();
    const blocked = removed.some((item) => inquiries.some((inquiry) => (
        inquiryUsesOption(inquiry, current, 'series')
        && inquiryUsesSeriesConstruction(inquiry, item.id, item.field)
    )));
    if (blocked) {
        throw new ApiError(409, 'CONFLICT', 'This option is used by existing inquiries.', [
            { field: 'attributes', code: 'IN_USE', message: 'A construction option is used by existing inquiries and cannot be deleted.' },
        ]);
    }
}

function logSetup(event, detail) {
    if (process.env.NODE_ENV === 'production') return;
    console.info(`[wizard-setup] ${event}`, detail);
}

function createWizardSetupService() {
    return {
        async list() {
            await ensureWizardCatalog(CustomBuildOption);
            const docs = await CustomBuildOption.find().sort({ sortOrder: 1, id: 1 }).lean();
            return { categories: docs.map(toAdminCategory) };
        },

        async repairCollidingIdentities() {
            const docs = await CustomBuildOption.find();
            const report = [];
            for (const doc of docs) {
                const { options, changes } = repairCollidingOptionIdentities(doc);
                if (!changes.length) continue;
                doc.options = options;
                doc.markModified('options');
                await doc.save();
                report.push({ categoryId: doc.id, changes });
            }
            return report;
        },

        async getCategory(categoryId) {
            if (!isCategoryId(categoryId)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Category id is invalid.');
            }
            const category = await CustomBuildOption.findOne({ id: categoryId }).lean();
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            return toAdminCategory(category);
        },

        async createOption(categoryId, body) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            const next = optionFromBody(category, body);
            if (category.options.some((item) => item.id === next.id || optionCode(item, category.id) === next.code)) {
                throw new ApiError(409, 'CONFLICT', 'That option code already exists in this step.', [
                    { field: 'code', code: 'DUPLICATE', message: 'Option code must be unique in this category.' },
                ]);
            }
            assertOptionRelations(next, await catalogById(), category.id);
            category.options = applyDefaultUniqueness(
                [...category.options.map((item) => item.toObject()), next],
                next,
                category.id,
            );
            category.markModified('options');
            await category.save();
            return toAdminOption(next, category.id);
        },

        async updateOption(categoryId, optionId, body, codeHint) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            const { index } = findOption(category, optionId, codeHint);
            if (index < 0) throw new ApiError(404, 'NOT_FOUND', 'Option was not found.');
            const current = category.options[index].toObject();
            assertImmutableIdentifiers(current, body, category.id);
            const next = optionFromBody(category, body, current);
            const duplicate = category.options.some((item, itemIndex) => (
                itemIndex !== index && optionCode(item, category.id) === next.code
            ));
            if (duplicate) {
                throw new ApiError(409, 'CONFLICT', 'That option code already exists in this step.', [
                    { field: 'code', code: 'DUPLICATE', message: 'Option code must be unique in this category.' },
                ]);
            }
            assertOptionRelations(next, await catalogById(), category.id, current);
            await assertConstructionDeletesAllowed(current, next);
            const options = category.options.map((item, itemIndex) => (itemIndex === index ? next : item.toObject()));
            const touchesDefaults = hasOwn(body, 'isDefault')
                || hasOwn(body, 'defaultForInstrumentTypeIds')
                || hasOwn(body, 'active');
            category.options = touchesDefaults
                ? applyDefaultUniqueness(options, next, category.id)
                : options;
            category.markModified('options');
            await category.save();
            return toAdminOption(next, category.id);
        },

        async duplicateOption(categoryId, optionId, codeHint) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            const { option: current } = findOption(category, optionId, codeHint);
            if (!current) throw new ApiError(404, 'NOT_FOUND', 'Option was not found.');
            const source = optionPlain(current);
            const allocated = allocateUniqueCopyIdentity(category, current);
            const attributes = source.attributes && typeof source.attributes === 'object' && !Array.isArray(source.attributes)
                ? { ...source.attributes }
                : {};
            if (attributes.wizardId != null && String(attributes.wizardId) !== '') {
                attributes.wizardId = allocated.code;
            }
            const copy = optionFromBody(category, {
                name: `${current.name} copy`.slice(0, NAME_MAX),
                description: source.description,
                code: allocated.code,
                active: source.active !== false,
                imagePath: source.imagePath,
                icon: source.icon,
                isDefault: false,
                defaultForInstrumentTypeIds: [],
                sortOrder: (category.options || []).length,
                translations: source.translations,
                compatibility: source.compatibility,
                attributes,
            });
            copy.id = allocated.id;
            copy.code = allocated.code;
            if (copy.id === source.id || optionIdTaken(category, copy.id, copy.code)) {
                throw new ApiError(409, 'CONFLICT', 'That option code already exists in this step.', [
                    { field: 'code', code: 'DUPLICATE', message: 'Option code must be unique in this category.' },
                ]);
            }
            category.options.push(copy);
            category.markModified('options');
            await category.save();
            return toAdminOption(copy, category.id);
        },

        async deleteOption(categoryId, optionId, codeHint) {
            const snapshots = (await CustomBuildOption.find().lean()).map((doc) => ({
                id: doc.id,
                options: (doc.options || []).map(optionPlain),
                metadata: doc.metadata,
            }));
            try {
                return await persistOptionDeleteWithTransaction(categoryId, optionId, codeHint);
            } catch (error) {
                if (!(error instanceof ApiError && error.status < 500)) {
                    try {
                        await restoreCategorySnapshots(snapshots);
                    } catch (restoreError) {
                        logSetup('delete-restore-failed', {
                            categoryId,
                            optionId,
                            message: restoreError.message,
                        });
                    }
                }
                throw error;
            }
        },

        async reorderOptions(categoryId, ids) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            if (!Array.isArray(ids) || !ids.length) {
                invalid([{ field: 'ids', code: 'REQUIRED', message: 'ids is required.' }]);
            }
            const byId = new Map(category.options.map((item) => [item.id, item]));
            ids.forEach((id, index) => {
                const item = byId.get(id);
                if (item) item.sortOrder = index;
            });
            await category.save();
            return toAdminCategory(category.toObject());
        },
    };
}

async function persistOptionDelete(categoryId, optionId, session, codeHint) {
    const docsQuery = CustomBuildOption.find();
    if (session) docsQuery.session(session);
    const docs = await docsQuery;
    const category = docs.find((item) => item.id === categoryId);
    if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
    const { index, option: current } = findOption(category, optionId, codeHint);
    if (!current || index < 0) {
        logSetup('delete-miss', { categoryId, optionId });
        throw new ApiError(404, 'NOT_FOUND', 'Option was not found.');
    }
    const option = optionPlain(current);
    if ((category.options || []).length <= 1) {
        throw new ApiError(409, 'CONFLICT', 'A category needs at least one option.', [
            { field: 'id', code: 'LAST_OPTION', message: 'A category needs at least one option.' },
        ]);
    }
    if (await optionUsedInInquiries(option, categoryId, session)) {
        throw new ApiError(409, 'CONFLICT', 'This option is used by existing inquiries.', [
            { field: 'id', code: 'IN_USE', message: 'This option is used by existing inquiries and cannot be deleted.' },
        ]);
    }
    const plan = buildDeletePlan(docs, categoryId, option, index);
    if (await optionUsedInInquiries(option, categoryId, session)) {
        throw new ApiError(409, 'CONFLICT', 'This option is used by existing inquiries.', [
            { field: 'id', code: 'IN_USE', message: 'This option is used by existing inquiries and cannot be deleted.' },
        ]);
    }
    const sourceUpdate = plan.updates.find((item) => item.id === categoryId);
    category.options = sourceUpdate?.options
        || (category.options || []).map(optionPlain).filter((_, itemIndex) => itemIndex !== index);
    const remainingSameId = (category.options || []).some((item) => item.id === option.id);
    const deletedIds = remainingSameId
        ? [...(category.metadata?.deletedOptionIds || [])]
        : [...new Set([...(category.metadata?.deletedOptionIds || []), option.id])];
    category.metadata = { ...(category.metadata || {}), deletedOptionIds: deletedIds };
    category.markModified('metadata');
    category.markModified('options');
    await category.save(session ? { session } : undefined);
    for (const update of plan.updates) {
        if (update.id === categoryId) continue;
        const doc = docs.find((item) => item.id === update.id);
        if (!doc) continue;
        doc.options = update.options;
        doc.markModified('options');
        await doc.save(session ? { session } : undefined);
    }
    const storedQuery = CustomBuildOption.findOne({ id: categoryId }).lean();
    if (session) storedQuery.session(session);
    const stored = await storedQuery;
    if ((stored?.options || []).some((item) => (
        item.id === option.id && optionCode(item, categoryId) === optionCode(option, categoryId)
    ))) {
        throw new ApiError(500, 'SERVER_ERROR', 'The option was not deleted.');
    }
    logSetup('delete-ok', { categoryId, optionId: option.id, cleaned: plan.updates.length });
    return { deleted: true, id: option.id, cleanedCategories: plan.updates.map((item) => item.id) };
}

async function persistOptionDeleteWithTransaction(categoryId, optionId, codeHint) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const result = await persistOptionDelete(categoryId, optionId, session, codeHint);
        await session.commitTransaction();
        return result;
    } catch (error) {
        try {
            await session.abortTransaction();
        } catch {
            // Session may already be aborted when transactions are unsupported.
        }
        if (isTransactionUnsupported(error)) {
            return persistOptionDelete(categoryId, optionId, undefined, codeHint);
        }
        throw error;
    } finally {
        session.endSession();
    }
}

module.exports = {
    createWizardSetupService,
    inquiryUsesOption,
    stripAliasesFromOption,
    buildDeletePlan,
    restoreCategorySnapshots,
    repairCollidingOptionIdentities,
    allocateUniqueCopyIdentity,
};
