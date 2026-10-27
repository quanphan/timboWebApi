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

function readDefaultForInstrumentTypeIds(value) {
    if (value == null || value === '') return { value: [] };
    if (!Array.isArray(value)) {
        return { error: { field: 'defaultForInstrumentTypeIds', code: 'INVALID', message: 'defaultForInstrumentTypeIds must be an array.' } };
    }
    return {
        value: [...new Set(value.map((item) => String(item).trim()).filter(Boolean))],
    };
}

function readImagePath(value) {
    const path = cleanString(value);
    if (!path) return '';
    if (!path.startsWith('/uploads/') || path.includes('..') || path.includes('\\')) {
        return { error: { field: 'imagePath', code: 'INVALID', message: 'imagePath must be an uploaded file path.' } };
    }
    return path.slice(0, 240);
}

function translationsFrom(body, fallbackName) {
    const vi = body.translations?.vi || {};
    const en = body.translations?.en || {};
    return {
        vi: {
            name: cleanString(vi.name).slice(0, NAME_MAX),
            description: cleanString(vi.description).slice(0, TEXT_MAX),
        },
        en: {
            name: cleanString(en.name || fallbackName).slice(0, NAME_MAX),
            description: cleanString(en.description).slice(0, TEXT_MAX),
        },
    };
}

function optionFromBody(category, body, { existingId } = {}) {
    const errors = [];
    const name = cleanString(body.name).slice(0, NAME_MAX);
    if (!name) errors.push({ field: 'name', code: 'REQUIRED', message: 'Name is required.' });
    const code = readCode(body.code);
    if (!code || !CODE_PATTERN.test(code) || code.length > 40) {
        errors.push({ field: 'code', code: 'INVALID', message: 'Use a lowercase slug such as electric-guitar.' });
    }
    const id = existingId || `${category.id}.${code}`;
    if (!isOptionId(id)) {
        errors.push({ field: 'code', code: 'INVALID', message: 'Option id is invalid for this category.' });
    }
    const compatibility = readCompatibility(body.compatibility);
    if (compatibility.error) errors.push(compatibility.error);
    const imagePath = readImagePath(body.imagePath);
    if (imagePath && imagePath.error) errors.push(imagePath.error);
    if (errors.length) invalid(errors);

    const scopes = readDefaultForInstrumentTypeIds(body.defaultForInstrumentTypeIds);
    if (scopes.error) errors.push(scopes.error);
    if (errors.length) invalid(errors);

    const isDefault = Boolean(body.isDefault);
    const active = body.active === false ? false : true;
    const defaultForInstrumentTypeIds = active ? (scopes.value || []) : [];
    if ((isDefault || defaultForInstrumentTypeIds.length) && !active) {
        invalid([{ field: 'isDefault', code: 'INVALID', message: 'A default option must be active.' }]);
    }

    return {
        id,
        name,
        description: cleanString(body.description).slice(0, TEXT_MAX) || null,
        active,
        code,
        imagePath: imagePath || '',
        icon: cleanString(body.icon).slice(0, 40),
        isDefault,
        defaultForInstrumentTypeIds,
        sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : (category.options || []).length,
        translations: translationsFrom(body, name),
        compatibility: compatibility.value || {},
        attributes: body.attributes && typeof body.attributes === 'object' && !Array.isArray(body.attributes)
            ? body.attributes
            : {},
    };
}

function applyDefaultUniqueness(options, nextOption) {
    const claimed = new Set(nextOption.defaultForInstrumentTypeIds || []);
    return options.map((raw) => {
        const item = raw.toObject?.() || raw;
        if (item.id === nextOption.id) return nextOption;
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

function buildDeletePlan(docs, categoryId, option) {
    const aliases = optionAliases(option, categoryId);
    const updates = [];
    for (const doc of docs) {
        const currentOptions = (doc.options || []).map(optionPlain);
        let changed = false;
        let nextOptions = currentOptions;
        if (doc.id === categoryId) {
            nextOptions = currentOptions.filter((item) => item.id !== option.id);
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

function findOption(category, optionId) {
    const raw = resolveOptionId(optionId);
    const index = (category.options || []).findIndex((item) => (
        item.id === raw
        || item.id === optionId
        || optionCode(item, category.id) === raw
        || optionCode(item, category.id) === optionId
    ));
    return { index, option: index >= 0 ? category.options[index] : null };
}

async function optionUsedInInquiries(option, categoryId, session) {
    const query = CustomBuildInquiry.find({}, { 'configuration.selections': 1, 'configuration.notes': 1 }).lean();
    if (session) query.session(session);
    const inquiries = await query;
    return inquiries.some((inquiry) => inquiryUsesOption(inquiry, option, categoryId));
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
            category.options = applyDefaultUniqueness([...category.options.map((item) => item.toObject()), next], next);
            category.markModified('options');
            await category.save();
            return toAdminOption(next, category.id);
        },

        async updateOption(categoryId, optionId, body) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            const { index } = findOption(category, optionId);
            if (index < 0) throw new ApiError(404, 'NOT_FOUND', 'Option was not found.');
            const current = category.options[index].toObject();
            const merged = {
                ...current,
                ...body,
                code: body.code || current.code || optionCode(current, category.id),
                translations: body.translations || current.translations,
                compatibility: body.compatibility !== undefined ? body.compatibility : current.compatibility,
                attributes: body.attributes !== undefined ? body.attributes : current.attributes,
                defaultForInstrumentTypeIds: body.defaultForInstrumentTypeIds !== undefined
                    ? body.defaultForInstrumentTypeIds
                    : current.defaultForInstrumentTypeIds,
            };
            const next = optionFromBody(category, merged, { existingId: current.id });
            const duplicate = category.options.some((item, itemIndex) => (
                itemIndex !== index && (item.id === next.id || optionCode(item, category.id) === next.code)
            ));
            if (duplicate) {
                throw new ApiError(409, 'CONFLICT', 'That option code already exists in this step.');
            }
            assertOptionRelations(next, await catalogById(), category.id, current);
            const options = category.options.map((item, itemIndex) => (itemIndex === index ? next : item.toObject()));
            category.options = applyDefaultUniqueness(options, next);
            category.markModified('options');
            await category.save();
            return toAdminOption(next, category.id);
        },

        async duplicateOption(categoryId, optionId) {
            const category = await CustomBuildOption.findOne({ id: categoryId });
            if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
            const { option: current } = findOption(category, optionId);
            if (!current) throw new ApiError(404, 'NOT_FOUND', 'Option was not found.');
            let suffix = 2;
            let code = `${optionCode(current, category.id)}-${suffix}`;
            while (category.options.some((item) => optionCode(item, category.id) === code)) {
                suffix += 1;
                code = `${optionCode(current, category.id)}-${suffix}`;
            }
            const copy = optionFromBody(category, {
                ...current.toObject(),
                code,
                name: `${current.name} copy`,
                isDefault: false,
                defaultForInstrumentTypeIds: [],
            });
            category.options.push(copy);
            category.markModified('options');
            await category.save();
            return toAdminOption(copy, category.id);
        },

        async deleteOption(categoryId, optionId) {
            const snapshots = (await CustomBuildOption.find().lean()).map((doc) => ({
                id: doc.id,
                options: (doc.options || []).map(optionPlain),
                metadata: doc.metadata,
            }));
            try {
                return await persistOptionDeleteWithTransaction(categoryId, optionId);
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

async function persistOptionDelete(categoryId, optionId, session) {
    const docsQuery = CustomBuildOption.find();
    if (session) docsQuery.session(session);
    const docs = await docsQuery;
    const category = docs.find((item) => item.id === categoryId);
    if (!category) throw new ApiError(404, 'NOT_FOUND', 'Custom build category was not found.');
    const { option: current } = findOption(category, optionId);
    if (!current) {
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
    const plan = buildDeletePlan(docs, categoryId, option);
    if (await optionUsedInInquiries(option, categoryId, session)) {
        throw new ApiError(409, 'CONFLICT', 'This option is used by existing inquiries.', [
            { field: 'id', code: 'IN_USE', message: 'This option is used by existing inquiries and cannot be deleted.' },
        ]);
    }
    const deletedIds = [...new Set([...(category.metadata?.deletedOptionIds || []), option.id])];
    category.metadata = { ...(category.metadata || {}), deletedOptionIds: deletedIds };
    category.markModified('metadata');
    const sourceUpdate = plan.updates.find((item) => item.id === categoryId);
    category.options = sourceUpdate?.options
        || (category.options || []).map(optionPlain).filter((item) => item.id !== option.id);
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
    if ((stored?.options || []).some((item) => item.id === option.id)) {
        throw new ApiError(500, 'SERVER_ERROR', 'The option was not deleted.');
    }
    logSetup('delete-ok', { categoryId, optionId: option.id, cleaned: plan.updates.length });
    return { deleted: true, id: option.id, cleanedCategories: plan.updates.map((item) => item.id) };
}

async function persistOptionDeleteWithTransaction(categoryId, optionId) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const result = await persistOptionDelete(categoryId, optionId, session);
        await session.commitTransaction();
        return result;
    } catch (error) {
        try {
            await session.abortTransaction();
        } catch {
            // Session may already be aborted when transactions are unsupported.
        }
        if (isTransactionUnsupported(error)) {
            return persistOptionDelete(categoryId, optionId);
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
};
