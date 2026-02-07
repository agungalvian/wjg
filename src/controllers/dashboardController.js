const db = require('../../database');

exports.dashboard = (req, res) => {
    // Determine which dashboard to show or show combined data based on role
    // For now, we fetch basic stats for everyone

    // Example: Count residents, pending payments, total funds
    const stats = {
        residents: 0,
        pendingPayments: 0,
        balance: 0
    };

    const now = new Date();
    const currentMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Parallel queries (or serialized for simplicity)
    db.serialize(() => {
        db.get("SELECT COUNT(*) as count FROM users WHERE role = 'resident'", (err, row) => {
            if (!err) stats.residents = row.count;

            db.get("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'", (err, row) => {
                if (!err) stats.pendingPayments = row.count;

                // Calculate balances per fund type
                db.all(`SELECT fund_type, type, SUM(amount) as total FROM mutations GROUP BY fund_type, type`, (err, rows) => {
                    const balances = {
                        housing: 0,
                        social: 0,
                        rt: 0
                    };

                    if (!err) {
                        rows.forEach(r => {
                            if (r.fund_type) {
                                const amount = parseFloat(r.total) || 0;
                                if (r.type === 'in') balances[r.fund_type] += amount;
                                else balances[r.fund_type] -= amount;
                            }
                        });
                    }

                    stats.balances = balances;
                    stats.totalBalance = (parseFloat(balances.housing) || 0) + (parseFloat(balances.social) || 0) + (parseFloat(balances.rt) || 0);

                    // Fetch Monthly Balances for Chart (Current Year)
                    const currentYear = now.getFullYear();
                    const chartData = {
                        housing: Array(12).fill(0),
                        social: Array(12).fill(0),
                        rt: Array(12).fill(0),
                        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des']
                    };
                    stats.chartData = chartData;

                    // 1. Get initial balance before current year
                    db.all(`
                        SELECT fund_type, type, SUM(amount) as total 
                        FROM mutations 
                        WHERE date < ? 
                        GROUP BY fund_type, type
                    `, [`${currentYear}-01-01`], (err, initialRows) => {
                        const runningBalance = { housing: 0, social: 0, rt: 0 };
                        if (err) console.error('Error fetching initial balances:', err);

                        if (!err && initialRows) {
                            initialRows.forEach(row => {
                                if (row.fund_type && runningBalance.hasOwnProperty(row.fund_type)) {
                                    const amount = parseFloat(row.total) || 0;
                                    if (row.type === 'in') runningBalance[row.fund_type] += amount;
                                    else runningBalance[row.fund_type] -= amount;
                                }
                            });
                        }

                        // 2. Get monthly changes in current year
                        db.all(`
                            SELECT 
                                EXTRACT(MONTH FROM date) as month, 
                                fund_type, 
                                type, 
                                SUM(amount) as total 
                            FROM mutations 
                            WHERE EXTRACT(YEAR FROM date) = ?
                            GROUP BY month, fund_type, type
                            ORDER BY month ASC
                        `, [currentYear], (err, mutationRows) => {
                            if (err) {
                                console.error('Error fetching monthly mutations:', err);
                            } else {
                                console.log(`Fetched ${mutationRows ? mutationRows.length : 0} mutation rows for chart.`);
                            }

                            if (!err && mutationRows) {
                                // Create a map of monthly changes
                                const monthlyChanges = Array.from({ length: 12 }, () => ({ housing: 0, social: 0, rt: 0 }));

                                mutationRows.forEach(row => {
                                    const monthIndex = parseInt(row.month) - 1;
                                    const amount = parseFloat(row.total) || 0;
                                    if (row.fund_type && monthlyChanges[monthIndex].hasOwnProperty(row.fund_type)) {
                                        if (row.type === 'in') monthlyChanges[monthIndex][row.fund_type] += amount;
                                        else monthlyChanges[monthIndex][row.fund_type] -= amount;
                                    }
                                });

                                // 3. Calculate cumulative balances for each month
                                for (let i = 0; i < 12; i++) {
                                    runningBalance.housing += monthlyChanges[i].housing;
                                    runningBalance.social += monthlyChanges[i].social;
                                    runningBalance.rt += monthlyChanges[i].rt;

                                    // Only show data up to current month
                                    if (i <= now.getMonth()) {
                                        chartData.housing[i] = runningBalance.housing;
                                        chartData.social[i] = runningBalance.social;
                                        chartData.rt[i] = runningBalance.rt;
                                    } else {
                                        chartData.housing[i] = null;
                                        chartData.social[i] = null;
                                        chartData.rt[i] = null;
                                    }
                                }
                            }
                            console.log('Final Chart Data:', JSON.stringify(chartData));

                            if (req.session.role === 'resident') {
                                // Get all approved payments for this user in the current year
                                const userId = req.session.userId;
                                db.all("SELECT month_paid_for FROM payments WHERE user_id = ? AND status = 'approved' AND month_paid_for LIKE ?", [userId, `${currentYear}-%`], (err, payments) => {
                                    const statuses = [];
                                    const paidMonths = new Set();

                                    if (!err && payments) {
                                        payments.forEach(p => {
                                            const months = p.month_paid_for.split(',').map(m => m.trim());
                                            months.forEach(m => paidMonths.add(m));
                                        });
                                    }

                                    // Check Current Month
                                    const isCurrentMonthPaid = paidMonths.has(currentMonth);

                                    // Check Arrears (Previous months of current year)
                                    let hasArrears = false;
                                    for (let m = 0; m < now.getMonth(); m++) {
                                        const checkMonth = currentYear + '-' + String(m + 1).padStart(2, '0');
                                        if (!paidMonths.has(checkMonth)) {
                                            hasArrears = true;
                                            break;
                                        }
                                    }

                                    if (hasArrears) statuses.push('MENUNGGAK');
                                    if (!isCurrentMonthPaid) statuses.push('BELUM BAYAR');
                                    if (statuses.length === 0) statuses.push('LUNAS');

                                    stats.residentStatus = statuses;
                                    render();
                                });
                            } else {
                                render();
                            }
                        });
                    });
                });
            });
        });
    });

    function render() {
        res.render('dashboard', {
            title: 'Dashboard',
            user: req.session.user,
            path: '/dashboard',
            stats: stats,
            currentMonthLabel: now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
        });
    }
};
