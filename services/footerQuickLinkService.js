const mongoose = require('mongoose');
const FooterQuickLink = require('../models/FooterQuickLink');
const { ApiError } = require('../utils/errors');
const { cleanString } = require('../utils/text');

function presentLocale(value, fallbackTitle) {
    return {
        title: value && value.title ? value.title : fallbackTitle,
    };
}

function presentLink(link) {
    const title = link.title;
    const linkType = link.linkType === 'external' ? 'external' : 'internal';
    return {
        id: String(link._id),
        title,
        url: link.url,
        linkType,
        openInNewTab: linkType === 'external' && link.openInNewTab === true,
        translations: {
            vi: presentLocale(link.translations && link.translations.vi, title),
            en: presentLocale(link.translations && link.translations.en, title),
        },
        isActive: link.isActive !== false,
        sortOrder: link.sortOrder || 0,
        createdAt: link.createdAt || null,
        updatedAt: link.updatedAt || link.createdAt || null,
    };
}

function displayTitle(translations) {
    const en = translations && translations.en && translations.en.title;
    const vi = translations && translations.vi && translations.vi.title;
    return en || vi || '';
}

function readTitleLocale(value, field) {
    if (value === undefined || value === null) return undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field,
            code: 'INVALID',
            message: 'Translation must be an object.',
        }]);
    }
    const title = value.title === undefined ? null : cleanString(value.title);
    if (title && title.length > 80) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: `${field}.title`,
            code: 'INVALID',
            message: 'Title is too long.',
        }]);
    }
    return { title: title || null };
}

function readInternalUrl(value) {
    const url = cleanString(value);
    if (!url || url.length > 500) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'url',
            code: 'INVALID',
            message: 'Internal path is required.',
        }]);
    }
    if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\') || /[\s<>"]/.test(url)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'url',
            code: 'INVALID',
            message: 'Internal links must start with a single /.',
        }]);
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'url',
            code: 'INVALID',
            message: 'Internal links cannot include a URL scheme.',
        }]);
    }
    return url;
}

function readExternalUrl(value) {
    const raw = cleanString(value);
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'url',
            code: 'INVALID',
            message: 'External links must use http or https.',
        }]);
    }
    if (raw.length > 500) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'url',
            code: 'INVALID',
            message: 'URL is too long.',
        }]);
    }
    return parsed.toString();
}

function readLinkType(value, required) {
    if (value === undefined) {
        if (required) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
                field: 'linkType',
                code: 'REQUIRED',
                message: 'Link type is required.',
            }]);
        }
        return undefined;
    }
    if (value !== 'internal' && value !== 'external') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'linkType',
            code: 'INVALID',
            message: 'Link type must be internal or external.',
        }]);
    }
    return value;
}

function readBoolean(value, field) {
    if (value === undefined) return undefined;
    if (typeof value !== 'boolean') {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field,
            code: 'INVALID',
            message: `${field} must be true or false.`,
        }]);
    }
    return value;
}

function readSortOrder(value) {
    if (value === undefined) return undefined;
    const sortOrder = Number(value);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
            field: 'sortOrder',
            code: 'INVALID',
            message: 'sortOrder must be a non-negative integer.',
        }]);
    }
    return sortOrder;
}

function readInput(body, { partial = false, existingLinkType } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
    }
    const updates = {};
    if (!partial || body.linkType !== undefined) {
        updates.linkType = readLinkType(body.linkType, !partial);
    }
    const linkType = updates.linkType || existingLinkType;
    if (!partial || body.url !== undefined) {
        if (linkType === 'external') updates.url = readExternalUrl(body.url);
        else updates.url = readInternalUrl(body.url);
    }
    const openInNewTab = readBoolean(body.openInNewTab, 'openInNewTab');
    if (openInNewTab !== undefined || updates.linkType) {
        if (linkType === 'internal') updates.openInNewTab = false;
        else if (openInNewTab !== undefined) updates.openInNewTab = openInNewTab;
    }
    const isActive = readBoolean(body.isActive, 'isActive');
    if (isActive !== undefined) updates.isActive = isActive;
    else if (!partial) updates.isActive = true;
    const sortOrder = readSortOrder(body.sortOrder);
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (!partial || body.translations !== undefined) {
        if (!body.translations || typeof body.translations !== 'object' || Array.isArray(body.translations)) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
                field: 'translations',
                code: 'REQUIRED',
                message: 'Provide Vietnamese and English titles.',
            }]);
        }
        updates.translations = {};
        if (body.translations.vi !== undefined) {
            updates.translations.vi = readTitleLocale(body.translations.vi, 'translations.vi');
        }
        if (body.translations.en !== undefined) {
            updates.translations.en = readTitleLocale(body.translations.en, 'translations.en');
        }
        const title = displayTitle(updates.translations);
        if (!partial && !title) {
            throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link is invalid.', [{
                field: 'translations.en.title',
                code: 'REQUIRED',
                message: 'A title is required.',
            }]);
        }
        if (title) updates.title = title;
    }
    return updates;
}

async function loadLink(id) {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(404, 'NOT_FOUND', 'Footer link was not found.');
    }
    const link = await FooterQuickLink.findById(id);
    if (!link) {
        throw new ApiError(404, 'NOT_FOUND', 'Footer link was not found.');
    }
    return link;
}

function mergeTranslations(currentDoc, incoming) {
    const current = currentDoc ? currentDoc.toObject() : {};
    return {
        ...current,
        ...(incoming.vi ? { vi: { ...(current.vi || {}), ...incoming.vi } } : {}),
        ...(incoming.en ? { en: { ...(current.en || {}), ...incoming.en } } : {}),
    };
}

function createFooterQuickLinkService() {
    return {
        async listPublic() {
            const links = await FooterQuickLink.find({ isActive: { $ne: false } }).sort({ sortOrder: 1, title: 1, _id: 1 });
            return links.map(presentLink);
        },

        async listAdmin() {
            const links = await FooterQuickLink.find({}).sort({ sortOrder: 1, title: 1, _id: 1 });
            return links.map(presentLink);
        },

        async getAdmin(id) {
            return presentLink(await loadLink(id));
        },

        async create(body) {
            const input = readInput(body);
            if (input.sortOrder === undefined) {
                const last = await FooterQuickLink.findOne({}).sort({ sortOrder: -1 }).select('sortOrder');
                input.sortOrder = last ? (last.sortOrder || 0) + 1 : 0;
            }
            if (input.linkType === 'internal') input.openInNewTab = false;
            else if (input.openInNewTab === undefined) input.openInNewTab = true;
            const link = await FooterQuickLink.create(input);
            return presentLink(link);
        },

        async update(id, body) {
            const link = await loadLink(id);
            const input = readInput(body, { partial: true, existingLinkType: link.linkType });
            if (input.translations) {
                link.translations = mergeTranslations(link.translations, input.translations);
                const title = displayTitle(link.translations.toObject ? link.translations.toObject() : link.translations);
                if (title) link.title = title;
                delete input.translations;
            }
            Object.assign(link, input);
            await link.save();
            return presentLink(link);
        },

        async reorder(body) {
            if (!body || !Array.isArray(body.ids) || body.ids.length === 0) {
                throw new ApiError(422, 'VALIDATION_ERROR', 'Footer link order is invalid.', [{
                    field: 'ids',
                    code: 'REQUIRED',
                    message: 'Provide the link ids in the new order.',
                }]);
            }
            const unique = [...new Set(body.ids.map(String))];
            const found = await FooterQuickLink.find({ _id: { $in: unique } }).select('_id');
            if (found.length !== unique.length) {
                throw new ApiError(404, 'NOT_FOUND', 'One or more footer links were not found.');
            }
            await Promise.all(unique.map((id, index) => FooterQuickLink.updateOne({ _id: id }, { sortOrder: index })));
            return this.listAdmin();
        },

        async remove(id) {
            const link = await loadLink(id);
            await link.deleteOne();
            return { deleted: true, id: String(link._id) };
        },
    };
}

module.exports = { createFooterQuickLinkService };
