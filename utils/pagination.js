function parsePagination(query, fallbackLimit = 10, maxLimit = 50) {
    const page = Number.parseInt(query.page, 10);
    const limit = Number.parseInt(query.limit, 10);
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    const cap = Number.isInteger(maxLimit) && maxLimit > 0 ? maxLimit : 50;
    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, cap) : fallbackLimit;
    return {
        page: safePage,
        limit: safeLimit,
        skip: (safePage - 1) * safeLimit,
    };
}

module.exports = { parsePagination };
