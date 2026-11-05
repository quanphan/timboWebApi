const ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a', 'h3', 'h4', 'span']);

function sanitizeServiceHtml(value) {
    let html = String(value || '');
    html = html.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*\/?\s*>/gi, '');
    html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    html = html.replace(/javascript:/gi, '');
    html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, tag, attrs) => {
        const name = String(tag).toLowerCase();
        if (!ALLOWED_TAGS.has(name)) {
            return '';
        }
        if (name === 'br') {
            return '<br>';
        }
        if (match.startsWith('</')) {
            return `</${name}>`;
        }
        if (name === 'a') {
            const hrefMatch = String(attrs).match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
            const href = hrefMatch ? String(hrefMatch[2] || hrefMatch[3] || hrefMatch[4] || '').trim() : '';
            if (!/^(https?:|mailto:|\/)/i.test(href)) {
                return '<a>';
            }
            return `<a href="${href.replace(/"/g, '')}">`;
        }
        return `<${name}>`;
    });
    return html.trim();
}

module.exports = { sanitizeServiceHtml };
