function sendData(res, data, status = 200, meta) {
    const body = { success: true, data };
    if (meta) {
        body.meta = meta;
    }
    res.status(status).json(body);
}

function pageMeta(page, limit, total) {
    return {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
}

module.exports = { pageMeta, sendData };
