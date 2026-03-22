const Module = require('module');
const path = require('path');

// --- In-Memory State ---
const State = {
    users: [
        { 
            id: 1, 
            name: 'Administrator', 
            email: 'admin@admin.com', 
            password: 'adminpassword_hashed', 
            role: 'admin', 
            coins: 0, 
            permissions: JSON.stringify(['manage_students', 'manage_videos', 'manage_codes', 'manage_admins', 'manage_requests', 'manage_exams']) 
        }
    ],
    batches: [],
    codes: [],
    settings: { codes_per_batch: '500', coins_per_code: '1' },
    videoPrices: {}
};

// --- Resolver for Firestore FieldValue ---
function resolveValue(current, update) {
    if (typeof update === 'string' && update.startsWith('INCREMENT(')) {
        const val = parseInt(update.match(/INCREMENT\(([^)]+)\)/)[1]);
        return (parseInt(current) || 0) + val;
    }
    return update;
}

// --- Mock Firebase Admin ---
const mockAdmin = {
    initializeApp: () => { console.log('[Mock] Firebase Initialized'); },
    apps: [{ name: 'mock' }],
    firestore: Object.assign(() => {
        const fsInstance = {
            settings: (s) => { console.log('[Mock] Firestore Settings:', s); },
            collection: (name) => ({
                doc: (id) => ({
                    get: async () => {
                        const user = State.users.find(u => u.id == id);
                        return {
                            exists: !!user,
                            data: () => {
                                if (!user) return null;
                                let perms = [];
                                try { perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions; } catch(e) {}
                                return { ...user, permissions: perms, coins: parseInt(user.coins) || 0 };
                            }
                        };
                    },
                    set: async (data) => { 
                        console.log(`[Mock] Firestore SET ${name}/${id}:`, data); 
                        if (name === 'users') {
                            const idx = State.users.findIndex(u => u.id == id);
                            const current = idx >= 0 ? State.users[idx] : { coins: 0 };
                            const user = { id: parseInt(id) || id, ...data };
                            user.coins = resolveValue(current.coins, data.coins || 0);
                            if (idx >= 0) State.users[idx] = user;
                            else State.users.push(user);
                        }
                    },
                    update: async (data) => { 
                        console.log(`[Mock] Firestore UPDATE ${name}/${id}:`, data); 
                        if (name === 'users') {
                            const user = State.users.find(u => u.id == id);
                            if (user) {
                                for (let key in data) {
                                    user[key] = resolveValue(user[key], data[key]);
                                }
                            }
                        }
                    },
                    delete: async () => { 
                        console.log(`[Mock] Firestore DELETE ${name}/${id}`); 
                        if (name === 'users') {
                            State.users = State.users.filter(u => u.id != id);
                        }
                    }
                })
            })
        };
        fsInstance.FieldValue = mockAdmin.firestore.FieldValue;
        return fsInstance;
    }, {
        FieldValue: {
            increment: (n) => `INCREMENT(${n})`,
            serverTimestamp: () => 'TIMESTAMP'
        }
    })
};

// --- Mock SQLite3 ---
const mockSqlite = {
    verbose: () => mockSqlite,
    Database: function(path, cb) {
        console.log('[Mock] SQLite Connected (Stateful V7)');
        setTimeout(() => cb && cb(null), 10);
        return {
            serialize: (fn) => fn(),
            run: function(sql, params, cb) {
                if (typeof params === 'function') { cb = params; params = []; }
                const actualParams = Array.isArray(params) ? params : [params];
                const sqlLower = (sql || '').toLowerCase();
                console.log('[Mock] SQLite RUN:', sql);

                let lastID = Date.now();
                if (sqlLower.includes('insert into code_batches')) {
                    const batch = { id: State.batches.length + 1, created_at: actualParams[0], count: parseInt(actualParams[1]), coins_per_code: parseInt(actualParams[2]) };
                    State.batches.push(batch);
                    lastID = batch.id;
                } else if (sqlLower.includes('insert or ignore into codes')) {
                    State.codes.push({ id: State.codes.length + 1, code: actualParams[0], batch_id: actualParams[1], is_used: 0 });
                } else if (sqlLower.includes('insert into users')) {
                    const user = { id: State.users.length + 1, name: actualParams[0], email: actualParams[1], password: actualParams[2], role: actualParams[3] || 'student', coins: parseInt(actualParams[4]) || 0, permissions: actualParams[5] || '[]' };
                    State.users.push(user);
                    lastID = user.id;
                } else if (sqlLower.includes('insert or replace into app_settings')) {
                    const keyMatch = sql.match(/key = '([^']+)'/) || sql.match(/VALUES \('([^']+)'/);
                    const key = keyMatch ? keyMatch[1] : actualParams[0];
                    const val = keyMatch ? actualParams[0] : actualParams[1];
                    State.settings[key] = val.toString();
                } else if (sqlLower.includes('update app_settings')) {
                    State.settings[actualParams[1]] = actualParams[0].toString();
                } else if (sqlLower.includes('update users set coins = coins + ?')) {
                     const user = State.users.find(u => u.id == actualParams[1]);
                     if (user) user.coins = (parseInt(user.coins) || 0) + parseInt(actualParams[0]);
                } else if (sqlLower.includes('insert or replace into video_prices')) {
                    State.videoPrices[actualParams[0]] = parseInt(actualParams[1]);
                }

                setTimeout(() => cb && cb.call({ lastID, changes: 1 }, null), 10);
            },
            get: function(sql, params, cb) {
                if (typeof params === 'function') { cb = params; params = []; }
                const actualParams = Array.isArray(params) ? params : [params];
                const sqlLower = (sql || '').toLowerCase();
                console.log('[Mock] SQLite GET:', sql);

                let result = null;
                if (sqlLower.includes('from users')) {
                    if (sqlLower.includes('email = ?')) {
                        const email = actualParams[0] ? actualParams[0].toString().toLowerCase() : '';
                        result = State.users.find(u => u.email === email);
                    } else if (sqlLower.includes('id = ?')) {
                        result = State.users.find(u => u.id == actualParams[0]);
                    }
                } else if (sqlLower.includes('from app_settings')) {
                    const keyMatch = sql.match(/key = '([^']+)'/);
                    const key = keyMatch ? keyMatch[1] : actualParams[0];
                    result = State.settings[key] ? { value: State.settings[key] } : null;
                } else if (sqlLower.includes('from codes')) {
                    if (sqlLower.includes('code = ?')) {
                        result = State.codes.find(c => c.code === actualParams[0].toUpperCase());
                    }
                }

                setTimeout(() => cb && cb(null, result), 10);
            },
            all: function(sql, params, cb) {
                if (typeof params === 'function') { cb = params; params = []; }
                const actualParams = Array.isArray(params) ? params : [params];
                const sqlLower = (sql || '').toLowerCase();
                console.log('[Mock] SQLite ALL:', sql);

                let results = [];
                if (sqlLower.includes('from code_batches')) {
                   results = State.batches.map(b => ({
                       ...b,
                       used_count: State.codes.filter(c => c.batch_id === b.id && c.is_used).length,
                       available_count: State.codes.filter(c => c.batch_id === b.id && !c.is_used).length
                   }));
                } else if (sqlLower.includes('from codes')) {
                   results = State.codes.filter(c => c.batch_id == actualParams[0]);
                } else if (sqlLower.includes('from app_settings')) {
                   results = Object.entries(State.settings).map(([key, value]) => ({ key, value }));
                } else if (sqlLower.includes('from users')) {
                   results = State.users.filter(u => sqlLower.includes("role = 'admin'") ? u.role === 'admin' : u.role === 'student');
                } else if (sqlLower.includes('from video_prices')) {
                   results = Object.entries(State.videoPrices).map(([video_path, price]) => ({ video_path, price }));
                }

                setTimeout(() => cb && cb(null, results), 10);
            },
            prepare: (sql) => {
                let stmtSql = sql;
                return { 
                    run: function() {
                         const actualParams = Array.isArray(arguments[0]) ? arguments[0] : Array.from(arguments);
                         if (stmtSql.includes('INSERT OR IGNORE INTO codes')) {
                             State.codes.push({ id: State.codes.length + 1, code: actualParams[0], batch_id: actualParams[1], is_used: 0 });
                         } else if (stmtSql.includes('video_prices')) {
                             State.videoPrices[actualParams[0]] = parseInt(actualParams[1]);
                             console.log(`[Mock] Price Saved: ${actualParams[0]} = ${actualParams[1]}`);
                         }
                    }, 
                    finalize: (cb) => cb && cb(null) 
                };
            },
            close: () => {}
        };
    }
};

// --- Mock Bcrypt ---
const mockBcrypt = {
    genSalt: async () => 'salt',
    hash: async (p) => p + '_hashed',
    compare: async (p, h) => p + '_hashed' === h || h === p || (p === 'adminpassword' && h === 'adminpassword_hashed')
};

// --- Mock AI ---
const mockAI = {
    GoogleGenerativeAI: () => ({
        getGenerativeModel: () => ({
            generateContent: async () => ({
                response: {
                    text: () => JSON.stringify([{ question_text: "Mock Question?", option_a: "A", option_b: "B", option_c: "C", option_d: "D", correct_option: "a" }])
                }
            })
        })
    })
};

// --- Inject Mocks ---
const originalRequire = Module.prototype.require;
Module.prototype.require = function(name) {
    if (name === 'firebase-admin') return mockAdmin;
    if (name === 'sqlite3') return mockSqlite;
    if (name === 'bcrypt') return mockBcrypt;
    if (name === '@google/generative-ai') return mockAI;
    return originalRequire.apply(this, arguments);
};

process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3001';
process.env.ADMIN_EMAIL = 'admin@admin.com';
process.env.ADMIN_PASSWORD = 'adminpassword';

console.log('Full Stateful Mocks Injected V7 (Firebase + SQLite + AI)');
