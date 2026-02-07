const db = require('../../database');

// Resident: List their own payments
exports.myPayments = (req, res) => {
    const userId = req.session.userId;
    db.all('SELECT * FROM settings', (err, settingsRows) => {
        if (err) return res.status(500).send('Database Error');

        const settings = {};
        settingsRows.forEach(r => settings[r.key] = r.value);

        const currentYear = new Date().getFullYear();
        db.all("SELECT month_paid_for FROM payments WHERE user_id = ? AND status = 'approved' AND month_paid_for LIKE ?", [userId, `${currentYear}-%`], (err, paymentRows) => {
            if (err) return res.status(500).send('Database Error');

            const paidMonths = new Set();
            paymentRows.forEach(p => {
                p.month_paid_for.split(',').forEach(m => paidMonths.add(m.trim()));
            });

            db.all('SELECT * FROM payments WHERE user_id = ? ORDER BY date_submitted DESC', [userId], (err, rows) => {
                if (err) return res.status(500).send('Database Error');
                res.render('my_payments', {
                    title: 'Pembayaran Saya',
                    user: req.session.user,
                    payments: rows,
                    settings: settings,
                    paidMonths: paidMonths,
                    path: '/my-payments'
                });
            });
        });
    });
};

// Resident: View their dues status matrix
exports.myStatus = (req, res) => {
    const userId = req.session.userId;
    const year = req.query.year || new Date().getFullYear();

    db.all("SELECT month_paid_for FROM payments WHERE user_id = ? AND status = 'approved' AND month_paid_for LIKE ?", [userId, `${year}-%`], (err, rows) => {
        if (err) return res.status(500).send('Database Error');

        const paymentMap = {};
        rows.forEach(p => {
            p.month_paid_for.split(',').forEach(m => {
                if (m.trim().startsWith(year.toString())) {
                    paymentMap[m.trim()] = true;
                }
            });
        });

        res.render('my_status', {
            title: 'Status Iuran Anda',
            user: req.session.user,
            year: year,
            paymentMap: paymentMap,
            path: '/my-status'
        });
    });
};

// Resident: Submit Payment
exports.submitPayment = (req, res) => {
    const { months, payment_date } = req.body; // Array of months + payment date
    const proof_image = req.file ? req.file.filename : null;
    const userId = req.session.userId;

    if (!proof_image) {
        return res.redirect('/my-payments?error=Bukti pembayaran wajib diupload');
    }
    if (!months || months.length === 0) {
        return res.redirect('/my-payments?error=Pilih minimal satu bulan');
    }

    // Fetch dynamic settings
    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) {
            console.error(err);
            return res.redirect('/my-payments?error=Gagal mengambil data iuran');
        }

        const settings = {};
        rows.forEach(r => settings[r.key] = parseInt(r.value) || 0);

        const housing = settings.housing_dues || 0;
        const social = settings.social_dues || 0;
        const rt = settings.rt_dues || 0;
        const count = months.length;

        const totalAmount = (housing + social + rt) * count;
        const monthString = Array.isArray(months) ? months.join(', ') : months;

        const breakdown = JSON.stringify({
            housing: housing * count,
            social: social * count,
            rt: rt * count,
            count: count
        });

        const sql = `INSERT INTO payments (user_id, amount, month_paid_for, breakdown_json, proof_image, payment_date, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')`;

        db.run(sql, [userId, totalAmount, monthString, breakdown, proof_image, payment_date], (err) => {
            if (err) {
                console.error(err);
                return res.redirect('/my-payments?error=Gagal mengirim pembayaran');
            }
            res.redirect('/my-payments?success=Pembayaran berhasil dikirim');
        });
    });
};

// Admin: List all payments
exports.listPayments = (req, res) => {
    const statusFilter = req.query.status || 'pending';
    const sql = `
        SELECT p.*, u.full_name, u.house_number 
        FROM payments p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.status = ?
        ORDER BY p.date_submitted DESC
    `;

    db.all(sql, [statusFilter], (err, rows) => {
        if (err) return res.status(500).send('Database Error');
        res.render('payments', {
            title: 'Konfirmasi Pembayaran',
            user: req.session.user,
            payments: rows,
            statusFilter: statusFilter,
            path: '/payments'
        });
    });
};

// Admin: Approve/Reject Payment
exports.updateStatus = (req, res) => {
    const { id, status, admin_note } = req.body;

    db.run('UPDATE payments SET status = ?, admin_note = ? WHERE id = ?', [status, admin_note, id], function (err) {
        if (err) return res.status(500).send('Database Error');

        if (status === 'approved') {
            // Fetch breakdown to record individual mutations
            db.get('SELECT breakdown_json, month_paid_for, user_id, proof_image, payment_date FROM payments WHERE id = ?', [id], (err, payment) => {
                if (err || !payment || !payment.breakdown_json) {
                    return res.redirect('/payments');
                }

                try {
                    const breakdown = JSON.parse(payment.breakdown_json);
                    const desc = `Iuran ${payment.month_paid_for}`;

                    db.serialize(() => {
                        const stmt = db.prepare('INSERT INTO mutations (type, amount, description, category, fund_type, payment_id, proof_image, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

                        if (breakdown.housing > 0) stmt.run('in', breakdown.housing, desc, 'iuran', 'housing', id, payment.proof_image, payment.payment_date);
                        if (breakdown.social > 0) stmt.run('in', breakdown.social, desc, 'iuran', 'social', id, payment.proof_image, payment.payment_date);
                        if (breakdown.rt > 0) stmt.run('in', breakdown.rt, desc, 'iuran', 'rt', id, payment.proof_image, payment.payment_date);

                        stmt.finalize(() => {
                            res.redirect('/payments');
                        });
                    });
                } catch (e) {
                    console.error('Error processing approval:', e);
                    res.redirect('/payments');
                }
            });
        } else {
            res.redirect('/payments');
        }
    });
};
