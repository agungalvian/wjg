const bcrypt = require('bcrypt');
const db = require('../../database');

exports.loginPage = (req, res) => {
    res.render('login', { error: null, layout: false });
};

exports.login = (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, user) => {
        if (err) {
            return res.render('login', { error: 'An error occurred. Please try again.', layout: false });
        }
        if (!user) {
            return res.render('login', { error: 'Invalid username or password.', layout: false });
        }

        bcrypt.compare(password, user.password_hash, (err, result) => {
            if (result) {
                req.session.userId = user.id;
                req.session.role = user.role;
                req.session.user = user;
                return res.redirect('/dashboard');
            } else {
                return res.render('login', { error: 'Invalid username or password.', layout: false });
            }
        });
    });
};

exports.logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return console.log(err);
        }
        res.redirect('/login');
    });
};

exports.profilePage = (req, res) => {
    res.render('profile', {
        title: 'Profil Saya',
        user: req.session.user,
        success: req.query.success,
        error: req.query.error,
        path: '/profile'
    });
};

exports.changePassword = (req, res) => {
    const { old_password, new_password, confirm_password } = req.body;
    const userId = req.session.userId;

    if (new_password !== confirm_password) {
        return res.redirect('/profile?error=Konfirmasi password baru tidak cocok');
    }

    db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, user) => {
        if (err || !user) return res.redirect('/profile?error=Database error');

        bcrypt.compare(old_password, user.password_hash, (err, result) => {
            if (!result) {
                return res.redirect('/profile?error=Password lama salah');
            }

            bcrypt.hash(new_password, 10, (err, hash) => {
                if (err) return res.redirect('/profile?error=Error hashing password');

                db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId], (err) => {
                    if (err) return res.redirect('/profile?error=Gagal memperbarui password');
                    res.redirect('/profile?success=Password berhasil diperbarui');
                });
            });
        });
    });
};
