function isCalculatedValueField(key) {
    const normalized = String(key).replace(/[_-]/g, '');
    return /price|cost|quote|currency|subtotal|amount/i.test(normalized)
        || /^(total|estimate|estimates)$/i.test(normalized);
}

module.exports = { isCalculatedValueField };
