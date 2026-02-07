const db = require('../../database');
const bcrypt = require('bcrypt');

exports.listAdmins = (req, res) => {
    db.all("SELECT * FROM users WHERE role IN ('admin', 'viewer') ORDER BY LOWER(username) ASC", (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        res.render('admins', {
            title: 'Kelola Admin',
            user: req.session.user,
            admins: rows,
            path: '/admins'
        });
    });
};

exports.addAdmin = (req, res) => {
    const { username, password, full_name, role } = req.body;
    const saltRounds = 10;

    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) return res.status(500).send('Error hashing password');

        // Check for duplicates case-insensitively before inserting
        db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, row) => {
            if (row) {
                return res.redirect('/admins?error=Username sudah digunakan');
            }

            const sql = `INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)`;
            db.run(sql, [username, hash, role || 'admin', full_name], (err) => {
                if (err) {
                    console.error(err);
                    return res.redirect('/admins?error=Database error');
                }
                res.redirect('/admins?success=Admin berhasil ditambahkan');
            });
        });
    });
};

exports.deleteAdmin = (req, res) => {
    const id = req.params.id;

    // Prevent self-deletion
    if (parseInt(id) === req.session.userId) {
        return res.redirect('/admins?error=Tidak dapat menghapus akun Anda sendiri');
    }

    db.run("DELETE FROM users WHERE id = ? AND role IN ('admin', 'viewer')", [id], (err) => {
        if (err) console.error(err);
        res.redirect('/admins?success=Admin berhasil dihapus');
    });
};

exports.updateAdmin = (req, res) => {
    const { id, username, password, full_name, role } = req.body;
    const saltRounds = 10;

    // Check if new username is already taken by another user (case-insensitive)
    db.get("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?", [username, id], (err, row) => {
        if (err) {
            console.error(err);
            return res.redirect('/admins?error=Database error');
        }
        if (row) {
            return res.redirect('/admins?error=Username sudah digunakan');
        }

        const finalizeUpdate = (passwordHash) => {
            let sql, params;
            if (passwordHash) {
                sql = "UPDATE users SET username = ?, password_hash = ?, full_name = ?, role = ? WHERE id = ?";
                params = [username, passwordHash, full_name, role, id];
            } else {
                sql = "UPDATE users SET username = ?, full_name = ?, role = ? WHERE id = ?";
                params = [username, full_name, role, id];
            }

            db.run(sql, params, (err) => {
                if (err) {
                    console.error(err);
                    return res.redirect('/admins?error=Gagal mengupdate admin');
                }
                res.redirect('/admins?success=Admin berhasil diperbarui');
            });
        };

        if (password && password.trim() !== "") {
            bcrypt.hash(password, saltRounds, (err, hash) => {
                if (err) return res.status(500).send('Error hashing password');
                finalizeUpdate(hash);
            });
        } else {
            finalizeUpdate(null);
        }
    });
};
