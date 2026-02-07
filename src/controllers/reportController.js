const db = require('../../database');

exports.viewReports = (req, res) => {
    const month = req.query.month || ''; // Expects '01', '02', etc.
    const year = req.query.year || '';   // Expects '2024'

    let whereClause = '';
    let params = [];

    if (month && year) {
        whereClause = 'WHERE EXTRACT(YEAR FROM m.date) = ? AND EXTRACT(MONTH FROM m.date) = ?';
        params.push(year, month);
    } else if (year) {
        whereClause = 'WHERE EXTRACT(YEAR FROM m.date) = ?';
        params.push(year);
    } else if (month) {
        whereClause = 'WHERE EXTRACT(MONTH FROM m.date) = ?';
        params.push(month);
    }

    let initialWhere = '';
    let initialParams = [];
    let hasFilter = false;

    if (month && year) {
        initialWhere = 'WHERE date < ?';
        initialParams.push(`${year}-${month}-01`);
        hasFilter = true;
    } else if (year) {
        initialWhere = 'WHERE date < ?';
        initialParams.push(`${year}-01-01`);
        hasFilter = true;
    }

    const initialBalances = {
        housing: 0,
        social: 0,
        rt: 0
    };

    const runReportQuery = () => {
        const query = `
            SELECT m.*, u.full_name as resident_name 
            FROM mutations m 
            LEFT JOIN payments p ON m.payment_id = p.id 
            LEFT JOIN users u ON p.user_id = u.id 
            ${whereClause} 
            ORDER BY m.date DESC
        `;

        db.all(query, params, (err, rows) => {
            if (err) return res.status(500).send('Database Error');

            const summary = {
                housing: { initial: initialBalances.housing, in: 0, out: 0, balance: initialBalances.housing },
                social: { initial: initialBalances.social, in: 0, out: 0, balance: initialBalances.social },
                rt: { initial: initialBalances.rt, in: 0, out: 0, balance: initialBalances.rt },
                total: { initial: 0, balance: 0 }
            };

            const aggregatedMutations = [];
            const paymentGroups = {};

            rows.forEach(r => {
                // Calculate summary (always use individual records)
                if (r.fund_type && summary[r.fund_type]) {
                    if (r.type === 'in') summary[r.fund_type].in += r.amount;
                    else summary[r.fund_type].out += r.amount;
                }

                // Aggregate for display
                if (r.payment_id) {
                    if (!paymentGroups[r.payment_id]) {
                        paymentGroups[r.payment_id] = {
                            ...r,
                            amount: 0,
                            fund_type: 'multiple', // Placeholder for aggregated funds
                            is_aggregated: true
                        };
                        aggregatedMutations.push(paymentGroups[r.payment_id]);
                    }
                    paymentGroups[r.payment_id].amount += r.amount;
                } else {
                    aggregatedMutations.push(r);
                }
            });

            // Calculate balances
            summary.total = { initial: 0, in: 0, out: 0, balance: 0 };
            ['housing', 'social', 'rt'].forEach(type => {
                summary[type].balance = summary[type].initial + summary[type].in - summary[type].out;
                summary.total.initial += summary[type].initial;
                summary.total.in += summary[type].in;
                summary.total.out += summary[type].out;
                summary.total.balance += summary[type].balance;
            });

            res.render('reports', {
                title: 'Laporan Keuangan',
                user: req.session.user,
                mutations: aggregatedMutations,
                summary: summary,
                path: '/reports',
                filters: { month, year }
            });
        });
    };

    if (hasFilter) {
        const initialQuery = `
            SELECT fund_type, type, SUM(amount) as total 
            FROM mutations 
            ${initialWhere} 
            GROUP BY fund_type, type
        `;

        db.all(initialQuery, initialParams, (err, initialRows) => {
            if (err) return res.status(500).send('Database Error');

            initialRows.forEach(r => {
                if (r.fund_type && initialBalances.hasOwnProperty(r.fund_type)) {
                    if (r.type === 'in') initialBalances[r.fund_type] += parseInt(r.total) || 0;
                    else initialBalances[r.fund_type] -= parseInt(r.total) || 0;
                }
            });
            runReportQuery();
        });
    } else {
        runReportQuery();
    }
};

exports.viewMutations = (req, res) => {
    const query = `
        SELECT m.*, u.full_name as resident_name 
        FROM mutations m 
        LEFT JOIN payments p ON m.payment_id = p.id 
        LEFT JOIN users u ON p.user_id = u.id 
        ORDER BY m.date DESC
    `;
    db.all(query, (err, rows) => {
        if (err) return res.status(500).send('Database Error');

        const aggregatedMutations = [];
        const paymentGroups = {};

        rows.forEach(r => {
            if (r.payment_id) {
                if (!paymentGroups[r.payment_id]) {
                    paymentGroups[r.payment_id] = {
                        ...r,
                        amount: 0,
                        fund_type: 'multiple',
                        is_aggregated: true
                    };
                    aggregatedMutations.push(paymentGroups[r.payment_id]);
                }
                paymentGroups[r.payment_id].amount += r.amount;
            } else {
                aggregatedMutations.push(r);
            }
        });

        res.render('mutations', {
            title: 'Mutasi Keuangan',
            user: req.session.user,
            mutations: aggregatedMutations,
            path: '/mutations'
        });
    });
};

exports.addMutation = (req, res) => {
    const { type, amount, description, category, fund_type, date } = req.body;
    const proof_image = req.file ? req.file.filename : null;
    const finalDate = date || new Date().toISOString().slice(0, 19).replace('T', ' ');

    db.run('INSERT INTO mutations (type, amount, description, category, fund_type, date, proof_image) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [type, amount, description, category, fund_type, finalDate, proof_image],
        (err) => {
            if (err) console.error(err);
            res.redirect('/mutations'); // Redirect to mutations page after add
        }
    );
};

exports.viewPaymentMatrix = (req, res) => {
    const year = req.query.year || new Date().getFullYear();

    // Fetch all residents
    db.all("SELECT id, full_name, house_number FROM users WHERE role = 'resident' ORDER BY house_number ASC", (err, residents) => {
        if (err) return res.status(500).send('Database Error');

        // Fetch all approved payments for the selected year
        db.all("SELECT user_id, month_paid_for FROM payments WHERE status = 'approved' AND month_paid_for LIKE ?", [`%${year}-%`], (err, payments) => {
            if (err) return res.status(500).send('Database Error');

            // Map payments to a faster lookup structure
            const paymentMap = {};
            payments.forEach(p => {
                const months = p.month_paid_for.split(',').map(m => m.trim());
                months.forEach(m => {
                    if (!paymentMap[p.user_id]) paymentMap[p.user_id] = {};
                    paymentMap[p.user_id][m] = true;
                });
            });

            res.render('payment_matrix', {
                title: 'Status Iuran Warga',
                user: req.session.user,
                residents: residents,
                paymentMap: paymentMap,
                year: year,
                path: '/matrix'
            });
        });
    });
};

exports.exportReports = (req, res) => {
    const excel = require('exceljs');
    const month = req.query.month || '';
    const year = req.query.year || '';

    // Reuse filtering logic
    let whereClause = '';
    let params = [];
    let titleDetail = '';

    if (month && year) {
        whereClause = 'WHERE EXTRACT(YEAR FROM m.date) = ? AND EXTRACT(MONTH FROM m.date) = ?';
        params.push(year, month);
        titleDetail = `Bulan ${month} Tahun ${year}`;
    } else if (year) {
        whereClause = 'WHERE EXTRACT(YEAR FROM m.date) = ?';
        params.push(year);
        titleDetail = `Tahun ${year}`;
    } else if (month) {
        whereClause = 'WHERE EXTRACT(MONTH FROM m.date) = ?';
        params.push(month);
        titleDetail = `Bulan ${month}`;
    } else {
        titleDetail = 'Semua Periode';
    }

    // Logic for initial balance
    let initialWhere = '';
    let initialParams = [];
    let hasFilter = false;

    if (month && year) {
        initialWhere = 'WHERE date < ?';
        initialParams.push(`${year}-${month}-01`);
        hasFilter = true;
    } else if (year) {
        initialWhere = 'WHERE date < ?';
        initialParams.push(`${year}-01-01`);
        hasFilter = true;
    }

    const initialBalances = {
        housing: 0,
        social: 0,
        rt: 0
    };

    const generateExcel = () => {
        const query = `
            SELECT m.*, u.full_name as resident_name 
            FROM mutations m 
            LEFT JOIN payments p ON m.payment_id = p.id 
            LEFT JOIN users u ON p.user_id = u.id 
            ${whereClause} 
            ORDER BY m.date DESC
        `;

        db.all(query, params, async (err, rows) => {
            if (err) return res.status(500).send('Database Error');

            const summary = {
                housing: { initial: initialBalances.housing, in: 0, out: 0, balance: initialBalances.housing },
                social: { initial: initialBalances.social, in: 0, out: 0, balance: initialBalances.social },
                rt: { initial: initialBalances.rt, in: 0, out: 0, balance: initialBalances.rt },
                total: { initial: 0, balance: 0 }
            };

            const aggregatedMutations = [];
            const paymentGroups = {};

            rows.forEach(r => {
                if (r.fund_type && summary[r.fund_type]) {
                    if (r.type === 'in') summary[r.fund_type].in += r.amount;
                    else summary[r.fund_type].out += r.amount;
                }

                if (r.payment_id) {
                    if (!paymentGroups[r.payment_id]) {
                        paymentGroups[r.payment_id] = {
                            ...r,
                            amount: 0,
                            fund_type: 'multiple',
                            is_aggregated: true
                        };
                        aggregatedMutations.push(paymentGroups[r.payment_id]);
                    }
                    paymentGroups[r.payment_id].amount += r.amount;
                } else {
                    aggregatedMutations.push(r);
                }
            });

            summary.total = { initial: 0, in: 0, out: 0, balance: 0 };
            ['housing', 'social', 'rt'].forEach(type => {
                summary[type].balance = summary[type].initial + summary[type].in - summary[type].out;
                summary.total.initial += summary[type].initial;
                summary.total.in += summary[type].in;
                summary.total.out += summary[type].out;
                summary.total.balance += summary[type].balance;
            });

            // Create Workbook
            const workbook = new excel.Workbook();
            workbook.creator = 'Wira jatiasih greenhills System';
            workbook.created = new Date();

            // Sheet 1: Ringkasan
            const summarySheet = workbook.addWorksheet('Ringkasan');
            summarySheet.columns = [
                { header: 'Kategori Kas', key: 'category', width: 20 },
                { header: 'Saldo Awal', key: 'initial', width: 15, style: { numFmt: '#,##0' } },
                { header: 'Pemasukan', key: 'in', width: 15, style: { numFmt: '#,##0' } },
                { header: 'Pengeluaran', key: 'out', width: 15, style: { numFmt: '#,##0' } },
                { header: 'Saldo Akhir', key: 'balance', width: 15, style: { numFmt: '#,##0' } }
            ];

            summarySheet.addRow(['Laporan Keuangan: ' + titleDetail]);
            summarySheet.addRow([]); // Blank row
            summarySheet.addRow({
                category: 'Kas Perumahan',
                initial: summary.housing.initial,
                in: summary.housing.in,
                out: summary.housing.out,
                balance: summary.housing.balance
            });
            summarySheet.addRow({
                category: 'Dana Sosial',
                initial: summary.social.initial,
                in: summary.social.in,
                out: summary.social.out,
                balance: summary.social.balance
            });
            summarySheet.addRow({
                category: 'Kas RT',
                initial: summary.rt.initial,
                in: summary.rt.in,
                out: summary.rt.out,
                balance: summary.rt.balance
            });
            summarySheet.addRow({
                category: 'TOTAL',
                initial: summary.total.initial,
                in: summary.total.in,
                out: summary.total.out,
                balance: summary.total.balance
            });

            // Sheet 2: Rincian Transaksi
            const detailSheet = workbook.addWorksheet('Rincian Transaksi');
            detailSheet.columns = [
                { header: 'Tanggal', key: 'date', width: 15 },
                { header: 'Keterangan', key: 'desc', width: 30 },
                { header: 'Warga', key: 'resident', width: 20 },
                { header: 'Sumber Dana', key: 'fund', width: 15 },
                { header: 'Kategori', key: 'cat', width: 15 },
                { header: 'Masuk', key: 'in', width: 15, style: { numFmt: '#,##0' } },
                { header: 'Keluar', key: 'out', width: 15, style: { numFmt: '#,##0' } }
            ];

            aggregatedMutations.forEach(m => {
                detailSheet.addRow({
                    date: new Date(m.date).toLocaleDateString('id-ID'),
                    desc: m.description,
                    resident: m.resident_name || '-',
                    fund: m.fund_type,
                    cat: m.category,
                    in: m.type === 'in' ? m.amount : 0,
                    out: m.type === 'out' ? m.amount : 0
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=Laporan_Keuangan_${year}${month ? '_' + month : ''}.xlsx`);

            await workbook.xlsx.write(res);
            res.end();
        });
    };

    if (hasFilter) {
        const initialQuery = `
        SELECT fund_type, type, SUM(amount) as total 
        FROM mutations 
        ${initialWhere} 
        GROUP BY fund_type, type
    `;

        db.all(initialQuery, initialParams, (err, initialRows) => {
            if (err) return res.status(500).send('Database Error');

            initialRows.forEach(r => {
                if (r.fund_type && initialBalances.hasOwnProperty(r.fund_type)) {
                    if (r.type === 'in') initialBalances[r.fund_type] += parseInt(r.total) || 0;
                    else initialBalances[r.fund_type] -= parseInt(r.total) || 0;
                }
            });
            generateExcel();
        });
    } else {
        generateExcel();
    }
};
