const db = require('../../database');

exports.getSettings = (req, res) => {
    db.all('SELECT * FROM settings', (err, rows) => {
        if (err) return res.status(500).send('Database Error');

        // Convert array to object for easier access in view
        const settings = {};
        rows.forEach(row => {
            settings[row.key] = row.value;
        });

        res.render('settings', {
            title: 'Pengaturan Iuran',
            user: req.session.user,
            settings: settings,
            path: '/settings'
        });
    });
};

exports.updateSettings = (req, res) => {
    const { housing_dues, social_dues, rt_dues, bank_name, account_number, account_name } = req.body;

    const updates = [
        { key: 'housing_dues', value: housing_dues },
        { key: 'social_dues', value: social_dues },
        { key: 'rt_dues', value: rt_dues },
        { key: 'bank_name', value: bank_name },
        { key: 'account_number', value: account_number },
        { key: 'account_name', value: account_name }
    ];

    db.serialize(() => {
        // PostgreSQL UPSERT: INSERT ... ON CONFLICT ...
        const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
        updates.forEach(item => {
            stmt.run(item.key, item.value || ''); // Ensure value is not undefined
        });
        stmt.finalize((err) => {
            if (err) {
                console.error(err);
                return res.redirect('/settings?error=Gagal menyimpan pengaturan');
            }
            res.redirect('/settings?success=Pengaturan berhasil disimpan');
        });
    });
};
