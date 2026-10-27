const { WIZARD_GROUPS } = require('./wizardGroups');

function option(categoryId, code, name, extra = {}) {
    return {
        id: `${categoryId}.${code}`,
        code,
        name,
        description: extra.description || null,
        active: extra.active !== false,
        isDefault: Boolean(extra.isDefault),
        sortOrder: extra.sortOrder || 0,
        translations: extra.translations || {
            en: { name, description: extra.description || '' },
            vi: { name: extra.viName || name, description: extra.viDescription || extra.description || '' },
        },
        imagePath: extra.imagePath || '',
        icon: extra.icon || '',
        compatibility: extra.compatibility || {},
        attributes: extra.attributes || {},
    };
}

const WIZARD_OPTIONS = {
    'instrument-type': [
        option('instrument-type', 'electric-guitar', 'Electric Guitar', { icon: 'electric', viName: 'Guitar điện', sortOrder: 0 }),
        option('instrument-type', 'bass', 'Bass', { icon: 'bass', viName: 'Bass', sortOrder: 1 }),
        option('instrument-type', 'classical-guitar', 'Classical Guitar', { icon: 'classical', viName: 'Guitar classic', sortOrder: 2 }),
        option('instrument-type', 'acoustic-guitar', 'Acoustic Guitar', { icon: 'acoustic', viName: 'Guitar acoustic', sortOrder: 3 }),
    ],
    series: [
        option('series', 'solid-body', 'Custom Solid Body', {
            viName: 'Thân đặc custom',
            compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'] },
        }),
        option('series', 'headless', 'Headless', {
            viName: 'Headless',
            compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'] },
        }),
    ],
    'body-shape': [
        option('body-shape', 't-style', 'T-style', { attributes: { silhouette: 'tStyle' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'] } }),
        option('body-shape', 'offset', 'Offset', { attributes: { silhouette: 'offset' }, compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'], seriesIds: ['solid-body', 'headless'] } }),
        option('body-shape', 'double-cut', 'Double cut', { attributes: { silhouette: 'doubleCut' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'] } }),
        option('body-shape', 'modern-carve', 'Modern carve', { attributes: { silhouette: 'modern' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body', 'headless'] } }),
        option('body-shape', 'compact-modern', 'Compact modern', { attributes: { silhouette: 'compact' }, compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'], seriesIds: ['headless'] } }),
        option('body-shape', 'p-inspired', 'P-inspired', { attributes: { silhouette: 'precision' }, compatibility: { instrumentTypeIds: ['bass'], seriesIds: ['solid-body', 'headless'] } }),
        option('body-shape', 'j-inspired', 'J-inspired', { attributes: { silhouette: 'offset' }, compatibility: { instrumentTypeIds: ['bass'], seriesIds: ['solid-body'] } }),
    ],
    scale: [
        option('scale', '24-75', '24.75″', { attributes: { type: 'single', display: '24.75″', wizardId: '24.75' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'], shapeIds: ['offset'] } }),
        option('scale', '25-5', '25.5″', { attributes: { type: 'single', display: '25.5″', wizardId: '25.5' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body', 'headless'], shapeIds: ['t-style', 'offset', 'double-cut', 'modern-carve', 'compact-modern'] } }),
        option('scale', '27', '27″', { attributes: { type: 'single', display: '27″', wizardId: '27' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'], shapeIds: ['double-cut', 'modern-carve'] } }),
        option('scale', '25-25-5-multi', '25″–25.5″', { attributes: { type: 'multiscale', display: '25″–25.5″', bass: '25″', treble: '25.5″', wizardId: '25-25.5-multi' }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['headless'], shapeIds: ['compact-modern', 'offset', 'modern-carve'] } }),
        option('scale', '34', '34″', { attributes: { type: 'single', display: '34″', wizardId: '34' }, compatibility: { instrumentTypeIds: ['bass'], seriesIds: ['solid-body', 'headless'], shapeIds: ['offset', 'p-inspired', 'j-inspired', 'compact-modern'] } }),
    ],
    'string-count': [
        option('string-count', '6', '6 strings', { attributes: { value: 6, wizardId: '6' }, compatibility: { instrumentTypeIds: ['electric-guitar'], scaleIds: ['24.75', '25.5', '27', '25-25.5-multi'] } }),
        option('string-count', '7', '7 strings', { attributes: { value: 7, wizardId: '7' }, compatibility: { instrumentTypeIds: ['electric-guitar'], scaleIds: ['25.5', '27'] } }),
        option('string-count', '8', '8 strings', { attributes: { value: 8, wizardId: '8' }, compatibility: { instrumentTypeIds: ['electric-guitar'], scaleIds: ['25.5', '25-25.5-multi'] } }),
        option('string-count', '4', '4 strings', { attributes: { value: 4, wizardId: '4' }, compatibility: { instrumentTypeIds: ['bass'], scaleIds: ['34'] } }),
        option('string-count', '5', '5 strings', { attributes: { value: 5, wizardId: '5' }, compatibility: { instrumentTypeIds: ['bass'], scaleIds: ['34'] } }),
        option('string-count', '6-bass', '6-string bass', { attributes: { value: 6, wizardId: '6-bass' }, compatibility: { instrumentTypeIds: ['bass'], scaleIds: ['34'] } }),
    ],
    radius: [
        option('radius', 'compound-12-16', '12″–16″ compound', { attributes: { type: 'compound', display: '12″–16″ compound' }, compatibility: { instrumentTypeIds: ['electric-guitar'], scaleIds: ['25.5', '25-25.5-multi'] } }),
        option('radius', '16', '16″', { attributes: { type: 'fixed', display: '16″' }, compatibility: { instrumentTypeIds: ['bass'], scaleIds: ['34'] } }),
    ],
    'body-wood': [
        option('body-wood', 'alder', 'Alder', { attributes: { allowsTop: true, noneTopAllowed: true }, compatibility: { instrumentTypeIds: ['bass'] } }),
        option('body-wood', 'mahogany', 'Mahogany', { attributes: { allowsTop: true, noneTopAllowed: true }, compatibility: { instrumentTypeIds: ['electric-guitar'] } }),
        option('body-wood', 'swamp-ash', 'Swamp ash', { attributes: { allowsTop: false, noneTopAllowed: false }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'], shapeIds: ['t-style'], scaleIds: ['25.5'] } }),
        option('body-wood', 'walnut', 'Walnut', { attributes: { allowsTop: true, noneTopAllowed: true }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'], scaleIds: ['27'] } }),
    ],
    'top-wood': [
        option('top-wood', 'none', 'No separate top', { attributes: { kind: 'none', wizardId: 'none' } }),
        option('top-wood', 'stabilized-burl', 'Stabilized burl', { compatibility: { instrumentTypeIds: ['bass'], bodyWoodIds: ['alder'] } }),
        option('top-wood', 'exotic-figured', 'Exotic figured', { compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
        option('top-wood', 'maple', 'Maple', { compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany', 'walnut'] } }),
    ],
    'neck-wood': [
        option('neck-wood', 'roasted-maple', 'Roasted maple', { compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'], bodyWoodIds: ['alder', 'swamp-ash', 'walnut'] } }),
        option('neck-wood', 'mahogany', 'Mahogany', { compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body', 'headless'], bodyWoodIds: ['mahogany'] } }),
        option('neck-wood', 'mahogany-maple-laminate', 'Mahogany/maple laminate', { compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
    ],
    'neck-construction': [
        option('neck-construction', 'bolt-on', 'Bolt-on', { compatibility: { instrumentTypeIds: ['bass'] } }),
        option('neck-construction', 'set-neck', 'Set neck', { compatibility: { instrumentTypeIds: ['electric-guitar'] } }),
    ],
    fingerboard: [
        option('fingerboard', 'roasted-maple-board', 'Roasted maple', { compatibility: { instrumentTypeIds: ['bass'], neckWoodIds: ['roasted-maple'] } }),
        option('fingerboard', 'ebony', 'Ebony', { compatibility: { instrumentTypeIds: ['electric-guitar'], neckWoodIds: ['mahogany', 'mahogany-maple-laminate'] } }),
    ],
    'neck-profile': [
        option('neck-profile', 'asymmetric-c', 'Asymmetric C', { compatibility: { instrumentTypeIds: ['bass'] } }),
        option('neck-profile', 'thin-c', 'Thin C', { compatibility: { instrumentTypeIds: ['electric-guitar'] } }),
    ],
    'fret-spec': [
        option('fret-spec', 'nickel-medium-jumbo', 'Nickel medium jumbo', { compatibility: { instrumentTypeIds: ['bass'] } }),
        option('fret-spec', 'stainless-jumbo', 'Stainless jumbo', { compatibility: { instrumentTypeIds: ['electric-guitar'] } }),
    ],
    'pickup-config': [
        option('pickup-config', 'hh', 'HH', { attributes: { positions: ['neck', 'bridge'] }, compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'], stringCounts: [5, 6] } }),
    ],
    pickups: [
        option('pickups', 'soapbar-humbucker', 'Soapbar humbucker', { compatibility: { instrumentTypeIds: ['bass'], pickupConfigIds: ['hh'], stringCounts: [5] } }),
        option('pickups', 'humbucker', 'Humbucker', { compatibility: { instrumentTypeIds: ['electric-guitar'], pickupConfigIds: ['hh'], stringCounts: [6] } }),
    ],
    bridge: [
        option('bridge', 'single-saddle-bass', 'Single-saddle bass', { attributes: { traditionalTuners: true }, compatibility: { instrumentTypeIds: ['bass'], seriesIds: ['solid-body'], stringCounts: [5] } }),
        option('bridge', 'hardtail', 'Hardtail', { attributes: { traditionalTuners: true }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['solid-body'], stringCounts: [6] } }),
        option('bridge', 'individual-saddle-hardtail', 'Individual-saddle hardtail', { attributes: { traditionalTuners: false }, compatibility: { instrumentTypeIds: ['electric-guitar'], seriesIds: ['headless'], stringCounts: [6] } }),
    ],
    tuners: [
        option('tuners', 'hipshot-style-ultralight', 'Hipshot-style ultralight', { compatibility: { instrumentTypeIds: ['bass'], seriesIds: ['solid-body'], stringCounts: [5] } }),
    ],
    hardware: [
        option('hardware', 'black', 'Black', { compatibility: { instrumentTypeIds: ['electric-guitar', 'bass'] } }),
    ],
    electronics: [
        option('electronics', 'vol-blend-tone-passive', 'Volume / blend / tone', { compatibility: { instrumentTypeIds: ['bass'], pickupConfigIds: ['hh'], stringCounts: [5] } }),
        option('electronics', 'vol-tone-3way', 'Volume / tone / 3-way', { compatibility: { instrumentTypeIds: ['electric-guitar'], pickupConfigIds: ['hh'], stringCounts: [6] } }),
    ],
    'finish-type': [
        option('finish-type', 'conversion-varnish', 'Conversion varnish', { attributes: { sheen: 'gloss' }, compatibility: { instrumentTypeIds: ['bass'], bodyWoodIds: ['alder'] } }),
        option('finish-type', 'oil-thin-varnish', 'Oil / thin varnish', { attributes: { sheen: 'satin' }, compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
        option('finish-type', 'thin-varnish', 'Thin varnish', { attributes: { sheen: 'satin' }, compatibility: { instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
    ],
    'finish-color': [
        option('finish-color', 'natural-amber-burst', 'Natural amber burst', { attributes: { swatch: '#c48a3a' }, compatibility: { finishTypeIds: ['conversion-varnish'], instrumentTypeIds: ['bass'], bodyWoodIds: ['alder'] } }),
        option('finish-color', 'natural-wood', 'Natural wood', { attributes: { swatch: '#8b5a2b' }, compatibility: { finishTypeIds: ['oil-thin-varnish'], instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
        option('finish-color', 'natural-dark-figure', 'Natural dark figure', { attributes: { swatch: '#3d2b1f' }, compatibility: { finishTypeIds: ['thin-varnish'], instrumentTypeIds: ['electric-guitar'], bodyWoodIds: ['mahogany'] } }),
    ],
    inlay: [
        option('inlay', 'offset-dots', 'Offset dots', { compatibility: { instrumentTypeIds: ['bass'], fingerboardWoodIds: ['roasted-maple-board'] } }),
        option('inlay', 'side-dots', 'Side dots', { compatibility: { instrumentTypeIds: ['electric-guitar'], fingerboardWoodIds: ['ebony'] } }),
    ],
    engraving: [
        option('engraving', 'optional-top', 'Optional top engraving', { compatibility: { instrumentTypeIds: ['electric-guitar'], topWoodIds: ['exotic-figured'] } }),
    ],
};

function wizardCategories() {
    return WIZARD_GROUPS.map((group, index) => ({
        ...group,
        description: null,
        maxSelections: 1,
        sortOrder: 100 + index,
        demo: true,
        metadata: { step: group.step, wizardGroup: group.wizardGroup },
        options: WIZARD_OPTIONS[group.id] || [],
    }));
}

module.exports = { WIZARD_OPTIONS, wizardCategories, option };
