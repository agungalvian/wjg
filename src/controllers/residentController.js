const db = require('../../database');
const bcrypt = require('bcrypt');

exports.listResidents = (req, res) => {
    const search = req.query.search || '';
    const query = `
        SELECT * FROM users 
        WHERE role = 'resident' 
        AND (full_name LIKE ? OR house_number LIKE ?)
        ORDER BY LOWER(username) ASC
    `;

    db.all(query, [`%${search}%`, `%${search}%`], (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        res.render('residents', {
            title: 'Data Warga',
            user: req.session.user,
            residents: rows,
            search: search,
            path: '/residents'
        });
    });
};

exports.addResident = (req, res) => {
    const { username, password, full_name, house_number, phone, occupancy_status } = req.body;
    const saltRounds = 10;

    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) return res.status(500).send('Error hashing password');

        // Check for duplicate username case-insensitively
        db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username], (err, row) => {
            if (row) {
                return res.redirect('/residents?error=Username sudah digunakan');
            }

            const sql = `INSERT INTO users (username, password_hash, role, full_name, house_number, phone, occupancy_status) VALUES (?, ?, 'resident', ?, ?, ?, ?)`;
            db.run(sql, [username, hash, full_name, house_number, phone, occupancy_status || 'dihuni'], (err) => {
                if (err) {
                    console.error(err);
                    return res.redirect('/residents?error=Failed to add resident');
                }
                res.redirect('/residents');
            });
        });
    });
};

exports.deleteResident = (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM users WHERE id = ? AND role = 'resident'", [id], (err) => {
        if (err) console.error(err);
        res.redirect('/residents');
    });
};

exports.editResidentPage = (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM users WHERE id = ? AND role = 'resident'", [id], (err, resident) => {
        if (err || !resident) return res.redirect('/residents?error=Warga tidak ditemukan');
        res.render('edit_resident', {
            title: 'Edit Data Warga',
            user: req.session.user,
            resident: resident,
            path: '/residents'
        });
    });
};

exports.updateResident = (req, res) => {
    const id = req.params.id;
    const { username, full_name, house_number, phone, password, occupancy_status } = req.body;

    // Check for duplicate username case-insensitively (excluding current user)
    db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?', [username, id], (err, row) => {
        if (row) {
            return res.redirect(`/residents?error=Username sudah digunakan`);
        }

        if (password && password.trim() !== '') {
            bcrypt.hash(password, 10, (err, hash) => {
                if (err) return res.status(500).send('Error hashing password');
                db.run("UPDATE users SET username = ?, password_hash = ?, full_name = ?, house_number = ?, phone = ?, occupancy_status = ? WHERE id = ? AND role = 'resident'",
                    [username, hash, full_name, house_number, phone, occupancy_status, id], (err) => {
                        if (err) return res.redirect(`/residents?error=Gagal update data`);
                        res.redirect('/residents?success=Data warga berhasil diperbarui');
                    });
            });
        } else {
            db.run("UPDATE users SET username = ?, full_name = ?, house_number = ?, phone = ?, occupancy_status = ? WHERE id = ? AND role = 'resident'",
                [username, full_name, house_number, phone, occupancy_status, id], (err) => {
                    if (err) return res.redirect(`/residents?error=Gagal update data`);
                    res.redirect('/residents?success=Data warga berhasil diperbarui');
                });
        }
    });
};
