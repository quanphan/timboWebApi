const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    buildConfigGroups,
    customBuildWorkshopEmail,
    resolveDisplayName,
} = require('../services/email/customBuildInquiryEmail');

function option(id, name, extra = {}) {
    return {
        id,
        code: extra.code || id.slice(id.indexOf('.') + 1),
        name,
        translations: extra.translations || {
            en: { name },
            vi: { name: extra.viName || name },
        },
        attributes: extra.attributes || {},
    };
}

const catalog = {
    categories: [
        {
            id: 'body-shape',
            step: 1,
            options: [option('body-shape.compact-modern', 'Compact Modern', { viName: 'Compact Modern' })],
        },
        {
            id: 'neck-profile',
            step: 3,
            options: [option('neck-profile.thin-c', 'Thin C')],
        },
        {
            id: 'radius',
            step: 1,
            options: [option('radius.compound-12-16', '12″–16″ compound', {
                attributes: { display: '12″–16″ compound' },
            })],
        },
        {
            id: 'scale',
            step: 1,
            options: [option('scale.25', '25″', { code: '25', attributes: { display: '25″', wizardId: '25' } })],
        },
        {
            id: 'body-wood',
            step: 2,
            options: [
                option('body-wood.mahogany', 'Mahogany', { viName: 'Gỗ gụ' }),
                option('body-wood.alder', 'Alder', { viName: 'Alder' }),
            ],
        },
        {
            id: 'series',
            step: 1,
            options: [option('series.solid-body', 'PQ-BOUTIQUE', {
                attributes: {
                    bodyConstruction: [
                        { id: 'single-piece', name: 'Single piece', translations: { en: { name: 'Single piece' }, vi: { name: 'Một mảnh' } }, pieceCount: 1 },
                        { id: '2-pieces', name: '2 Pieces', translations: { en: { name: '2 Pieces' }, vi: { name: '2 mảnh' } }, pieceCount: 2 },
                    ],
                },
            })],
        },
    ],
};

function record(notes, extra = {}) {
    return {
        id: 'inq_test',
        createdAt: new Date('2026-11-11T02:20:00.000Z'),
        customer: { name: 'Lan Pham', email: 'lan@example.com', phone: '0901234567' },
        message: 'Please build this.',
        configuration: { notes, selections: extra.selections || {} },
        referenceImages: extra.referenceImages || [],
    };
}

describe('custom build inquiry email', () => {
    it('resolves catalog display names instead of raw ids', () => {
        assert.equal(resolveDisplayName(catalog, 'shapeId', 'body-shape.compact-modern', 'en', 'inq_test'), 'Compact Modern');
        assert.equal(resolveDisplayName(catalog, 'neckProfileId', 'neck-profile.thin-c', 'en', 'inq_test'), 'Thin C');
        assert.equal(resolveDisplayName(catalog, 'radiusId', 'radius.compound-12-16', 'en', 'inq_test'), '12″–16″ compound');
        assert.equal(resolveDisplayName(catalog, 'scaleId', 'scale.25', 'en', 'inq_test'), '25″');
        assert.equal(resolveDisplayName(catalog, 'scaleId', '25', 'en', 'inq_test'), '25″');
    });

    it('keeps the original value and does not invent a name when the option is missing', () => {
        const errors = [];
        const original = console.error;
        console.error = (line) => errors.push(String(line));
        try {
            assert.equal(
                resolveDisplayName(catalog, 'shapeId', 'body-shape.unknown-x', 'en', 'inq_test'),
                'body-shape.unknown-x',
            );
            assert.match(errors.join('\n'), /could not resolve option name/);
            assert.match(errors.join('\n'), /body-shape.unknown-x/);
        } finally {
            console.error = original;
        }
    });

    it('hides secondary wood for single piece and shows it for two pieces', () => {
        const single = buildConfigGroups(record(
            'language=en\nwizard:\nseriesId=solid-body\nbodyConstructionId=single-piece\nbodyWoodId=mahogany\nsecondaryBodyWoodId=alder',
        ), catalog, 'en');
        const body = single.find((group) => group.step === 2);
        assert.equal(body.rows.some((row) => row.key === 'secondaryBodyWoodId'), false);
        assert.equal(body.rows.find((row) => row.key === 'bodyWoodId').value, 'Mahogany');
        assert.equal(body.rows.find((row) => row.key === 'bodyConstructionId').value, 'Single piece');

        const laminated = buildConfigGroups(record(
            'language=en\nwizard:\nseriesId=solid-body\nbodyConstructionId=2-pieces\nbodyWoodId=mahogany\nsecondaryBodyWoodId=alder',
        ), catalog, 'en');
        const laminatedBody = laminated.find((group) => group.step === 2);
        assert.equal(laminatedBody.rows.find((row) => row.key === 'secondaryBodyWoodId').value, 'Alder');
    });

    it('omits empty groups, draft ids, and uses Vietnamese labels when language=vi', () => {
        const groups = buildConfigGroups(record(
            'language=vi\ndraftId=draft-12345678\nwizard:\nshapeId=compact-modern\nbodyWoodId=mahogany',
        ), catalog, 'vi');
        assert.equal(groups.some((group) => group.step === 4), false);
        const instrument = groups.find((group) => group.step === 1);
        assert.equal(instrument.rows.find((row) => row.key === 'shapeId').value, 'Compact Modern');
        const email = customBuildWorkshopEmail(record(
            'language=vi\ndraftId=draft-12345678\nwizard:\nshapeId=compact-modern',
        ), { frontendBaseUrl: 'https://phanquanguitars.com' }, catalog);
        assert.match(email.subject, /Yêu cầu custom guitar mới/);
        assert.match(email.text, /Dáng thân: Compact Modern/);
        assert.equal(email.text.includes('draftId'), false);
        assert.equal(email.html.includes('<script'), false);
        assert.match(email.html, /<table/);
        assert.match(email.text, /01\. Nhạc cụ & dáng đàn/);
    });

    it('still includes unresolved selected values so configuration is not dropped', () => {
        const original = console.error;
        console.error = () => {};
        try {
            const groups = buildConfigGroups(record(
                'language=en\nwizard:\nfinishTypeId=finish-type.unknown-oil',
            ), catalog, 'en');
            const finish = groups.find((group) => group.step === 5);
            assert.equal(finish.rows.find((row) => row.key === 'finishTypeId').value, 'finish-type.unknown-oil');
        } finally {
            console.error = original;
        }
    });
});
