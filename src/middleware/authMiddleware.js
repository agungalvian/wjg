const requireLogin = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.userId && (req.session.role === 'admin' || req.session.role === 'viewer')) {
        next();
    } else {
        res.status(403).send('Forbidden: Admin access required');
    }
};

const requireWriteAdmin = (req, res, next) => {
    if (req.session.userId && req.session.role === 'admin') {
        next();
    } else {
        if (req.session.role === 'viewer') {
            return res.status(403).send('Forbidden: View-only account cannot perform this action');
        }
        res.status(403).send('Forbidden: Admin write access required');
    }
};

module.exports = {
    requireLogin,
    requireAdmin,
    requireWriteAdmin
};
