const WIZARD_GROUPS = [
    { id: 'instrument-type', step: 1, wizardGroup: 'instrumentType', name: 'Instrument type', required: true, selectionMode: 'single' },
    { id: 'series', step: 1, wizardGroup: 'series', name: 'Series', required: false, selectionMode: 'single' },
    { id: 'body-shape', step: 1, wizardGroup: 'shape', name: 'Body shape', required: true, selectionMode: 'single' },
    { id: 'scale', step: 1, wizardGroup: 'scale', name: 'Scale length', required: false, selectionMode: 'single' },
    { id: 'string-count', step: 1, wizardGroup: 'stringCount', name: 'String count', required: false, selectionMode: 'single' },
    { id: 'radius', step: 1, wizardGroup: 'radius', name: 'Fretboard radius', required: false, selectionMode: 'single' },
    { id: 'body-wood', step: 2, wizardGroup: 'bodyWood', name: 'Body wood', required: true, selectionMode: 'single' },
    { id: 'top-wood', step: 2, wizardGroup: 'topWood', name: 'Top wood', required: false, selectionMode: 'single' },
    { id: 'neck-wood', step: 3, wizardGroup: 'neckWood', name: 'Neck wood', required: true, selectionMode: 'single' },
    { id: 'neck-construction', step: 3, wizardGroup: 'neckConstruction', name: 'Neck construction', required: false, selectionMode: 'single' },
    { id: 'fingerboard', step: 3, wizardGroup: 'fingerboard', name: 'Fingerboard', required: true, selectionMode: 'single' },
    { id: 'neck-profile', step: 3, wizardGroup: 'neckProfile', name: 'Neck profile', required: false, selectionMode: 'single' },
    { id: 'fret-spec', step: 3, wizardGroup: 'fretSpec', name: 'Fret specification', required: false, selectionMode: 'single' },
    { id: 'pickup-config', step: 4, wizardGroup: 'pickupConfig', name: 'Pickup configuration', required: false, selectionMode: 'single' },
    { id: 'pickups', step: 4, wizardGroup: 'pickupType', name: 'Pickup type', required: false, selectionMode: 'single' },
    { id: 'bridge', step: 4, wizardGroup: 'bridge', name: 'Bridge', required: false, selectionMode: 'single' },
    { id: 'tuners', step: 4, wizardGroup: 'tuners', name: 'Tuners', required: false, selectionMode: 'single' },
    { id: 'hardware', step: 4, wizardGroup: 'hardwareFinish', name: 'Hardware finish', required: false, selectionMode: 'single' },
    { id: 'electronics', step: 4, wizardGroup: 'controlLayout', name: 'Control layout', required: false, selectionMode: 'single' },
    { id: 'finish-type', step: 5, wizardGroup: 'finishType', name: 'Finish type', required: true, selectionMode: 'single' },
    { id: 'finish-color', step: 5, wizardGroup: 'finishColor', name: 'Finish color', required: false, selectionMode: 'single' },
    { id: 'inlay', step: 5, wizardGroup: 'inlay', name: 'Inlays', required: false, selectionMode: 'single' },
    { id: 'engraving', step: 5, wizardGroup: 'engraving', name: 'Engraving', required: false, selectionMode: 'single' },
];

const COMPATIBILITY_KEYS = [
    'instrumentTypeIds',
    'seriesIds',
    'shapeIds',
    'scaleIds',
    'stringCounts',
    'bodyWoodIds',
    'topWoodIds',
    'neckWoodIds',
    'neckConstructionIds',
    'fingerboardWoodIds',
    'pickupConfigIds',
    'pickupTypeIds',
    'bridgeIds',
    'finishTypeIds',
];

const COMPATIBILITY_KEY_CATEGORIES = {
    instrumentTypeIds: 'instrument-type',
    seriesIds: 'series',
    shapeIds: 'body-shape',
    scaleIds: 'scale',
    stringCounts: 'string-count',
    bodyWoodIds: 'body-wood',
    topWoodIds: 'top-wood',
    neckWoodIds: 'neck-wood',
    neckConstructionIds: 'neck-construction',
    fingerboardWoodIds: 'fingerboard',
    pickupConfigIds: 'pickup-config',
    pickupTypeIds: 'pickups',
    bridgeIds: 'bridge',
    finishTypeIds: 'finish-type',
};

function groupOrderIndex(categoryId) {
    return WIZARD_GROUPS.findIndex((item) => item.id === categoryId);
}

function precedingGroups(categoryId) {
    const index = groupOrderIndex(categoryId);
    if (index <= 0) return [];
    return WIZARD_GROUPS.slice(0, index);
}

function groupStep(categoryId) {
    return WIZARD_GROUPS.find((item) => item.id === categoryId)?.step ?? null;
}

function allowedCompatibilityGroupIds(categoryId) {
    const preceding = precedingGroups(categoryId);
    const step = groupStep(categoryId);
    if (Number(step) >= 4) {
        return preceding
            .filter((item) => item.step === 1 || item.step === step)
            .map((item) => item.id);
    }
    return preceding.map((item) => item.id);
}

function allowedCompatibilityKeys(categoryId) {
    const allowed = new Set(allowedCompatibilityGroupIds(categoryId));
    return COMPATIBILITY_KEYS.filter((key) => allowed.has(COMPATIBILITY_KEY_CATEGORIES[key]));
}

module.exports = {
    WIZARD_GROUPS,
    COMPATIBILITY_KEYS,
    COMPATIBILITY_KEY_CATEGORIES,
    groupOrderIndex,
    precedingGroups,
    groupStep,
    allowedCompatibilityGroupIds,
    allowedCompatibilityKeys,
};
