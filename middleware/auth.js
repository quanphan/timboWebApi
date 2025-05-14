const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;
        next();
    });
}
function isAdmin(req, res, next) {
    if (req.user && req.user.admin) {
        next();
    } else {
        res.status(403).json({ message: "Admin access only" });
    }
}

module.exports = {
    authenticateToken,
    isAdmin
};