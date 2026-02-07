const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'rawinda_secret_key_change_this',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// View Engine
app.use(expressLayouts);
app.set('layout', './layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const authRoutes = require('./src/routes/authRoutes');
const dashboardController = require('./src/controllers/dashboardController');
const residentRoutes = require('./src/routes/residentRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const paymentRoutes = require('./src/routes/paymentRoutes');
const announcementRoutes = require('./src/routes/announcementRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const settingsRoutes = require('./src/routes/settingsRoutes');

// Middleware to make user available to all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.path = req.path;
    res.locals.formatNumber = (num) => {
        const n = Number(num);
        return isNaN(n) ? '0' : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };
    next();
});

// Auth Middleware
const requireLogin = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

// Mount Routes
app.use('/', authRoutes);
app.get('/dashboard', requireLogin, dashboardController.dashboard);
app.get('/', (req, res) => res.redirect('/dashboard')); // Redirect root to dashboard

app.use('/residents', residentRoutes);
app.use('/admins', adminRoutes);
app.use('/', paymentRoutes); // Mounts /payments and /my-payments
app.use('/announcements', requireLogin, announcementRoutes);
app.use('/settings', requireLogin, settingsRoutes);
app.use('/', reportRoutes); // Mounts /reports

// Start Server
db.waitForReady().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('Failed to start server due to database error:', err);
    process.exit(1);
});

// Export app for testing/extension
module.exports = app;
