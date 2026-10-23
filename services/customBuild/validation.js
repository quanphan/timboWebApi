const { ApiError } = require('../../utils/errors');
const { isCalculatedValueField } = require('./fields');
const { isPlainObject } = require('./objects');

const NOTES_MAX_LENGTH = 2000;
const MAX_INSPECTED_ITEMS = 20;
const ALLOWED_CONFIGURATION_FIELDS = new Set(['selections', 'notes']);

function issue(field, code, message) {
    return { field, code, message };
}

function fieldName(prefix, name) {
    return prefix ? `${prefix}.${name}` : name;
}

function hasDisallowedControlChars(value) {
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

function validateNotes(notes, errors, notesField) {
    if (notes === undefined || notes === null) {
        return null;
    }
    if (typeof notes !== 'string') {
        errors.push(issue(notesField, 'INVALID_TYPE', 'Notes must be a string.'));
        return null;
    }
    if (hasDisallowedControlChars(notes)) {
        errors.push(issue(notesField, 'INVALID_FORMAT', 'Notes contain unsupported characters.'));
        return null;
    }
    const trimmed = notes.trim();
    if (trimmed.length > NOTES_MAX_LENGTH) {
        errors.push(issue(notesField, 'TOO_LONG', `Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`));
        return null;
    }
    return trimmed || null;
}

function validateSingleSelection(category, value, errors, selectionField) {
    if (typeof value !== 'string' || value.trim() === '') {
        errors.push(issue(selectionField, 'INVALID_TYPE', 'Choose one option id for this category.'));
        return undefined;
    }

    const option = category.options.find((item) => item.id === value);
    if (!option) {
        errors.push(issue(selectionField, 'UNKNOWN_OPTION', 'Selected option does not exist in this category.'));
        return undefined;
    }
    if (!option.active) {
        errors.push(issue(selectionField, 'INACTIVE_OPTION', 'Selected option is not available.'));
        return undefined;
    }
    return option.id;
}

function validateMultipleSelection(category, value, errors, selectionField) {
    if (!Array.isArray(value)) {
        errors.push(issue(selectionField, 'INVALID_TYPE', 'Choose a list of option ids for this category.'));
        return undefined;
    }

    if (value.length > category.maxSelections) {
        errors.push(issue(
            selectionField,
            'TOO_MANY_SELECTIONS',
            `Choose at most ${category.maxSelections} options for this category.`,
        ));
    }

    const seen = new Set();
    const selected = [];
    const items = value.slice(0, MAX_INSPECTED_ITEMS);

    items.forEach((item, index) => {
        const itemField = `${selectionField}[${index}]`;
        if (typeof item !== 'string' || item.trim() === '') {
            errors.push(issue(itemField, 'INVALID_TYPE', 'Each selection must be an option id.'));
            return;
        }
        if (seen.has(item)) {
            errors.push(issue(itemField, 'DUPLICATE_OPTION', 'This option was selected more than once.'));
            return;
        }
        seen.add(item);

        const option = category.options.find((candidate) => candidate.id === item);
        if (!option) {
            errors.push(issue(itemField, 'UNKNOWN_OPTION', 'Selected option does not exist in this category.'));
            return;
        }
        if (!option.active) {
            errors.push(issue(itemField, 'INACTIVE_OPTION', 'Selected option is not available.'));
            return;
        }
        if (selected.length < category.maxSelections) {
            selected.push(option.id);
        }
    });

    if (value.length === 0) {
        return [];
    }
    if (selected.length === 0) {
        return undefined;
    }
    return selected;
}

function evaluateConfiguration(payload, catalog, prefix = '') {
    const errors = [];

    if (!isPlainObject(payload)) {
        errors.push(issue(
            prefix || 'body',
            'INVALID_TYPE',
            'Configuration must be a JSON object.',
        ));
        return { errors, configuration: null };
    }

    for (const key of Object.keys(payload)) {
        const keyField = fieldName(prefix, key);
        if (isCalculatedValueField(key)) {
            errors.push(issue(
                keyField,
                'CALCULATED_VALUE_REJECTED',
                'Client-supplied prices and calculated values are not accepted.',
            ));
        } else if (!ALLOWED_CONFIGURATION_FIELDS.has(key)) {
            errors.push(issue(keyField, 'UNKNOWN_FIELD', 'This field is not accepted.'));
        }
    }

    const notes = validateNotes(payload.notes, errors, fieldName(prefix, 'notes'));
    const selectionsField = fieldName(prefix, 'selections');
    const normalizedSelections = {};

    if (payload.selections === undefined) {
        errors.push(issue(selectionsField, 'REQUIRED', 'Selections are required.'));
    } else if (!isPlainObject(payload.selections)) {
        errors.push(issue(selectionsField, 'INVALID_TYPE', 'Selections must be an object keyed by category id.'));
    } else {
        const categories = new Map(catalog.categories.map((category) => [category.id, category]));

        for (const key of Object.keys(payload.selections)) {
            if (isCalculatedValueField(key)) {
                errors.push(issue(
                    `${selectionsField}.${key}`,
                    'CALCULATED_VALUE_REJECTED',
                    'Client-supplied prices and calculated values are not accepted.',
                ));
            } else if (!categories.has(key)) {
                errors.push(issue(
                    `${selectionsField}.${key}`,
                    'UNKNOWN_CATEGORY',
                    'This category does not exist.',
                ));
            }
        }

        for (const category of catalog.categories) {
            const value = payload.selections[category.id];
            const selectionField = `${selectionsField}.${category.id}`;

            if (value === undefined) {
                if (category.required) {
                    errors.push(issue(selectionField, 'REQUIRED', 'This category is required.'));
                }
                continue;
            }

            const normalized = category.selectionMode === 'single'
                ? validateSingleSelection(category, value, errors, selectionField)
                : validateMultipleSelection(category, value, errors, selectionField);

            if (normalized === undefined) {
                continue;
            }
            if (Array.isArray(normalized) && normalized.length === 0) {
                if (category.required) {
                    errors.push(issue(selectionField, 'REQUIRED', 'Choose at least one option for this category.'));
                }
                continue;
            }
            normalizedSelections[category.id] = normalized;
        }
    }

    if (errors.length > 0) {
        return { errors, configuration: null };
    }

    return {
        errors,
        configuration: {
            selections: normalizedSelections,
            notes,
        },
    };
}

function createValidationService(optionsService) {
    return {
        async inspectConfiguration(payload, prefix = '') {
            const catalog = await optionsService.listOptions();
            return evaluateConfiguration(payload, catalog, prefix);
        },

        async validateConfiguration(payload) {
            if (!isPlainObject(payload)) {
                throw new ApiError(400, 'BAD_REQUEST', 'Request body must be a JSON object.');
            }

            const result = await this.inspectConfiguration(payload, '');
            if (result.errors.length > 0) {
                throw new ApiError(
                    422,
                    'VALIDATION_ERROR',
                    'Custom build configuration is invalid.',
                    result.errors,
                );
            }

            return result.configuration;
        },
    };
}

module.exports = { evaluateConfiguration, createValidationService };
