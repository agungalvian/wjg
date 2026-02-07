const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'rawinda_secret',
    database: process.env.DB_NAME || 'rawinda_finance',
    port: 5432,
});

let isInitialized = false;
const initPromise = initDb();

// Compatibility Layer for SQLite-like API
const db = {
    all: async (text, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        await initPromise;
        let i = 1;
        const sql = text.replace(/\?/g, () => `$${i++}`);
        pool.query(sql, params, (err, res) => {
            if (callback) callback(err, res ? res.rows : null);
        });
    },
    get: async (text, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        await initPromise;
        let i = 1;
        const sql = text.replace(/\?/g, () => `$${i++}`);
        pool.query(sql, params, (err, res) => {
            if (callback) callback(err, res ? res.rows[0] : null);
        });
    },
    run: async function (text, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        await initPromise;
        let i = 1;
        const sql = text.replace(/\?/g, () => `$${i++}`);
        pool.query(sql, params, (err, res) => {
            if (callback) callback(err, res);
        });
    },
    serialize: (callback) => {
        callback();
    },
    prepare: function (text) {
        let i = 1;
        const sql = text.replace(/\?/g, () => `$${i++}`);
        return {
            run: async (...args) => {
                const callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
                await initPromise;
                pool.query(sql, args, callback);
            },
            finalize: (callback) => { if (callback) callback(); }
        };
    },
    waitForReady: () => initPromise
};

async function initDb() {
    let retries = 5;
    while (retries > 0) {
        try {
            // Check connection
            await pool.query('SELECT 1');
            console.log('PostgreSQL connection established.');

            // Users Table
            await pool.query(`CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin', 'resident', 'viewer')),
                full_name TEXT,
                house_number TEXT,
                phone TEXT,
                occupancy_status TEXT DEFAULT 'dihuni' CHECK (occupancy_status IN ('dihuni', 'sewa', 'kosong'))
            )`);

            // Migration: Add occupancy_status if not exists
            await pool.query(`DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='occupancy_status') THEN
                        ALTER TABLE users ADD COLUMN occupancy_status TEXT DEFAULT 'dihuni' CHECK (occupancy_status IN ('dihuni', 'sewa', 'kosong'));
                    END IF;
                END $$;`);

            // Migration: Update role constraint if needed
            await pool.query(`DO $$ 
                BEGIN 
                    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
                    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'resident', 'viewer'));
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END $$;`);

            // Announcements Table
            await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category TEXT NOT NULL CHECK (category IN ('important', 'event', 'documentation')),
                image TEXT,
                date_created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);

            // Migration: Add image if not exists in announcements
            await pool.query(`DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='announcements' AND column_name='image') THEN
                        ALTER TABLE announcements ADD COLUMN image TEXT;
                    END IF;
                END $$;`);

            // Payments Table
            await pool.query(`CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                amount INTEGER NOT NULL,
                month_paid_for TEXT NOT NULL,
                breakdown_json TEXT,
                proof_image TEXT,
                payment_date DATE,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                admin_note TEXT,
                date_submitted TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`);

            // Migration: Add payment_date if not exists
            await pool.query(`DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='payment_date') THEN
                        ALTER TABLE payments ADD COLUMN payment_date DATE;
                    END IF;
                END $$;`);

            // Mutations Table
            await pool.query(`CREATE TABLE IF NOT EXISTS mutations (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL CHECK (type IN ('in', 'out')),
                amount INTEGER NOT NULL,
                description TEXT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                category TEXT,
                fund_type TEXT CHECK (fund_type IN ('housing', 'social', 'rt')),
                proof_image TEXT,
                payment_id INTEGER
            )`);

            // Settings Table
            await pool.query(`CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`);

            // Seed Settings
            const settingsCheck = await pool.query("SELECT key FROM settings WHERE key = 'housing_dues'");
            if (settingsCheck.rows.length === 0) {
                await pool.query(`INSERT INTO settings (key, value) VALUES 
                    ('housing_dues', '50000'),
                    ('social_dues', '10000'),
                    ('rt_dues', '10000')`);
            }

            // Seed Admin User
            const adminUsername = 'admin';
            const adminPassword = 'adminpassword';
            const adminCheck = await pool.query("SELECT id FROM users WHERE username = $1", [adminUsername]);
            if (adminCheck.rows.length === 0) {
                const hash = await bcrypt.hash(adminPassword, 10);
                await pool.query(`INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, 'admin', 'Administrator')`,
                    [adminUsername, hash]);
                console.log('Admin user created.');
            }

            console.log('PostgreSQL Database Initialized.');
            isInitialized = true;
            return;
        } catch (err) {
            console.error(`PostgreSQL initialization failed. Retrying... (${retries} retries left)`, err.message);
            retries -= 1;
            await new Promise(res => setTimeout(res, 5000)); // Wait 5s before retry
        }
    }
    throw new Error('Failed to connect to PostgreSQL after several retries.');
}

module.exports = db;
