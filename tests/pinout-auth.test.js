// Mock DB and side-effect modules before requiring the controllers
jest.mock('../src/config/database', () => ({
    query: jest.fn(),
    getClient: jest.fn(),
}));
jest.mock('../src/controllers/notificationController', () => ({
    createNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/config/email', () => ({
    sendWelcomeEmail: jest.fn(() => Promise.resolve({ success: true })),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve({ success: true })),
    sendMultipleDeviceWarningEmail: jest.fn(() => Promise.resolve({ success: true })),
    sendPinoutLoginOtpEmail: jest.fn(() => Promise.resolve({ success: true })),
}));

const bcrypt = require('bcryptjs');
const { query } = require('../src/config/database');
const { sendPinoutLoginOtpEmail } = require('../src/config/email');
const { appLogin, appVerifyOtp, login } = require('../src/controllers/authController');
const { resetPinoutDevice } = require('../src/controllers/adminController');

const PASSWORD = 'Secret123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const OTP = '123456';
const OTP_HASH = bcrypt.hashSync(OTP, 4);
const DEVICE_A = 'device-aaaa-1111';
const DEVICE_B = 'device-bbbb-2222';
const CHALLENGE_ID = '5d1c8f4e-0000-4000-8000-000000000001';

const baseUser = {
    id: 'user-1',
    email: 'tech@workshop.in',
    password_hash: PASSWORD_HASH,
    first_name: 'Test',
    last_name: 'Tech',
    role: 'user',
    user_type: null,
    is_active: true,
    pinout_device_id: null,
};

const mockReq = (body) => ({
    body,
    headers: { 'user-agent': 'Dart/3.5 (dart:io)' },
    ip: '10.0.0.1',
    connection: {},
});

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

// Route mocked query() calls by SQL text; first matching pattern wins.
const routeQueries = (routes) => {
    query.mockImplementation(async (sql, params) => {
        for (const [pattern, handler] of routes) {
            if (pattern.test(sql)) {
                return typeof handler === 'function' ? handler(sql, params) : handler;
            }
        }
        return { rows: [], rowCount: 0 };
    });
};

const findCall = (pattern) => query.mock.calls.find(([sql]) => pattern.test(sql));

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// appLogin — step 1
// ---------------------------------------------------------------------------

describe('appLogin', () => {
    const loginBody = { email: baseUser.email, password: PASSWORD, device_id: DEVICE_A };

    test('unknown email → 401 INVALID_CREDENTIALS', async () => {
        routeQueries([[/FROM users WHERE email/, { rows: [] }]]);
        const res = mockRes();
        await appLogin(mockReq(loginBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].code).toBe('INVALID_CREDENTIALS');
    });

    test('wrong password → 401 INVALID_CREDENTIALS', async () => {
        routeQueries([[/FROM users WHERE email/, { rows: [baseUser] }]]);
        const res = mockRes();
        await appLogin(mockReq({ ...loginBody, password: 'nope' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json.mock.calls[0][0].code).toBe('INVALID_CREDENTIALS');
    });

    test('account bound to another device → 403 DEVICE_MISMATCH, no OTP issued', async () => {
        routeQueries([
            [/FROM users WHERE email/, { rows: [{ ...baseUser, pinout_device_id: DEVICE_B }] }],
        ]);
        const res = mockRes();
        await appLogin(mockReq(loginBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].code).toBe('DEVICE_MISMATCH');
        expect(findCall(/INSERT INTO pinout_login_otps/)).toBeUndefined();
        expect(sendPinoutLoginOtpEmail).not.toHaveBeenCalled();
    });

    test('code requested within cooldown → 429 OTP_COOLDOWN', async () => {
        routeQueries([
            [/FROM users WHERE email/, { rows: [baseUser] }],
            [/created_at > NOW\(\) - INTERVAL/, { rows: [{ retry_after: 42 }] }],
        ]);
        const res = mockRes();
        await appLogin(mockReq(loginBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
        const body = res.json.mock.calls[0][0];
        expect(body.code).toBe('OTP_COOLDOWN');
        expect(body.data.retryAfterSeconds).toBe(42);
        expect(findCall(/INSERT INTO pinout_login_otps/)).toBeUndefined();
    });

    test('unbound account → stores hashed OTP for this device, emails it, returns challengeId', async () => {
        routeQueries([
            [/FROM users WHERE email/, { rows: [baseUser] }],
            [/INSERT INTO pinout_login_otps/, { rows: [{ id: CHALLENGE_ID }] }],
        ]);
        const res = mockRes();
        await appLogin(mockReq(loginBody), res, jest.fn());

        expect(res.status).not.toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.challengeId).toBe(CHALLENGE_ID);

        // Old pending codes are cleared before the new one is stored
        const deleteIdx = query.mock.calls.findIndex(([sql]) => /DELETE FROM pinout_login_otps WHERE user_id/.test(sql));
        const insertIdx = query.mock.calls.findIndex(([sql]) => /INSERT INTO pinout_login_otps/.test(sql));
        expect(deleteIdx).toBeGreaterThanOrEqual(0);
        expect(deleteIdx).toBeLessThan(insertIdx);

        // The emailed code matches the stored hash, and the plain code is never stored
        const [, insertParams] = query.mock.calls[insertIdx];
        const emailedOtp = sendPinoutLoginOtpEmail.mock.calls[0][2];
        expect(emailedOtp).toMatch(/^\d{6}$/);
        expect(insertParams[1]).toBe(DEVICE_A);
        expect(insertParams[2]).not.toBe(emailedOtp);
        expect(bcrypt.compareSync(emailedOtp, insertParams[2])).toBe(true);
    });

    test('account already bound to the same device → OTP issued', async () => {
        routeQueries([
            [/FROM users WHERE email/, { rows: [{ ...baseUser, pinout_device_id: DEVICE_A }] }],
            [/INSERT INTO pinout_login_otps/, { rows: [{ id: CHALLENGE_ID }] }],
        ]);
        const res = mockRes();
        await appLogin(mockReq(loginBody), res, jest.fn());
        expect(res.json.mock.calls[0][0].success).toBe(true);
        expect(sendPinoutLoginOtpEmail).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// appVerifyOtp — step 2
// ---------------------------------------------------------------------------

describe('appVerifyOtp', () => {
    const verifyBody = {
        challenge_id: CHALLENGE_ID,
        otp: OTP,
        device_id: DEVICE_A,
        device_name: 'Samsung SM-A515F',
        device_platform: 'android',
    };

    const MARK_USED = /^UPDATE pinout_login_otps SET used = true WHERE id = \$1$/;

    test('expired or unknown challenge → 400 OTP_EXPIRED', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [] }],
            [/SELECT id FROM pinout_login_otps/, { rows: [] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq(verifyBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].code).toBe('OTP_EXPIRED');
    });

    test('attempts already exhausted → 429 and the code is burned', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [] }],
            [/SELECT id FROM pinout_login_otps/, { rows: [{ id: CHALLENGE_ID }] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq(verifyBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json.mock.calls[0][0].code).toBe('OTP_TOO_MANY_ATTEMPTS');
        expect(findCall(MARK_USED)).toBeDefined();
    });

    test('wrong code → 400 OTP_INVALID with attempts remaining', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [{ user_id: baseUser.id, otp_hash: OTP_HASH, attempts: 2 }] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq({ ...verifyBody, otp: '000000' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        const body = res.json.mock.calls[0][0];
        expect(body.code).toBe('OTP_INVALID');
        expect(body.data.attemptsRemaining).toBe(3);
        expect(findCall(/UPDATE users\s+SET pinout_device_id/)).toBeUndefined();
    });

    test('wrong code on the last attempt → 429 and the code is burned', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [{ user_id: baseUser.id, otp_hash: OTP_HASH, attempts: 5 }] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq({ ...verifyBody, otp: '000000' }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json.mock.calls[0][0].code).toBe('OTP_TOO_MANY_ATTEMPTS');
        expect(findCall(MARK_USED)).toBeDefined();
    });

    test('correct code → binds device, creates pinout session, invalidates only pinout sessions', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [{ user_id: baseUser.id, otp_hash: OTP_HASH, attempts: 1 }] }],
            [/SET used = true WHERE id = \$1 AND used = false/, { rows: [{ id: CHALLENGE_ID }] }],
            [/FROM users WHERE id = \$1/, { rows: [baseUser] }],
            [/UPDATE users\s+SET pinout_device_id/, { rows: [{ id: baseUser.id }] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq(verifyBody), res, jest.fn());

        expect(res.status).not.toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.token).toEqual(expect.any(String));
        expect(body.data.refreshToken).toEqual(expect.any(String));
        expect(body.data.user.role).toBe('user');

        const [bindSql, bindParams] = findCall(/UPDATE users\s+SET pinout_device_id/);
        expect(bindSql).toMatch(/pinout_device_id IS NULL OR pinout_device_id = \$1/);
        expect(bindParams[0]).toBe(DEVICE_A);
        expect(JSON.parse(bindParams[1]).deviceName).toBe('Samsung SM-A515F');

        const [, sessionParams] = findCall(/INSERT INTO user_sessions/);
        expect(sessionParams[6]).toBe('pinout');

        const [invalidateSql, invalidateParams] = findCall(/UPDATE user_sessions\s+SET is_active = false/);
        expect(invalidateSql).toMatch(/client = \$3/);
        expect(invalidateParams[2]).toBe('pinout');
    });

    test('another device bound first (race) → 403 DEVICE_MISMATCH, no session', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [{ user_id: baseUser.id, otp_hash: OTP_HASH, attempts: 1 }] }],
            [/SET used = true WHERE id = \$1 AND used = false/, { rows: [{ id: CHALLENGE_ID }] }],
            [/FROM users WHERE id = \$1/, { rows: [baseUser] }],
            [/UPDATE users\s+SET pinout_device_id/, { rows: [] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq(verifyBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json.mock.calls[0][0].code).toBe('DEVICE_MISMATCH');
        expect(findCall(/INSERT INTO user_sessions/)).toBeUndefined();
    });

    test('code already claimed by a concurrent request → 400 OTP_EXPIRED', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [{ user_id: baseUser.id, otp_hash: OTP_HASH, attempts: 1 }] }],
            [/SET used = true WHERE id = \$1 AND used = false/, { rows: [] }],
        ]);
        const res = mockRes();
        await appVerifyOtp(mockReq(verifyBody), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json.mock.calls[0][0].code).toBe('OTP_EXPIRED');
        expect(findCall(/INSERT INTO user_sessions/)).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Web login stays independent of the Pinout app
// ---------------------------------------------------------------------------

describe('web login session scoping', () => {
    test('web login only checks and invalidates web sessions', async () => {
        routeQueries([
            [/FROM users WHERE email/, { rows: [baseUser] }],
        ]);
        const res = mockRes();
        await login(
            { ...mockReq({ email: baseUser.email, password: PASSWORD }), headers: { 'user-agent': 'Mozilla/5.0 Chrome/120' } },
            res,
            jest.fn()
        );
        expect(res.json.mock.calls[0][0].success).toBe(true);

        const [activeSql, activeParams] = findCall(/FROM user_sessions\s+WHERE user_id = \$1\s+AND client = \$2/);
        expect(activeSql).toBeDefined();
        expect(activeParams[1]).toBe('web');

        const [, sessionParams] = findCall(/INSERT INTO user_sessions/);
        expect(sessionParams[6]).toBe('web');

        const [invalidateSql, invalidateParams] = findCall(/UPDATE user_sessions\s+SET is_active = false/);
        expect(invalidateSql).toMatch(/client = \$3/);
        expect(invalidateParams[2]).toBe('web');
    });
});

// ---------------------------------------------------------------------------
// Admin device reset
// ---------------------------------------------------------------------------

describe('resetPinoutDevice', () => {
    test('unknown user → 404', async () => {
        routeQueries([[/UPDATE users\s+SET pinout_device_id = NULL/, { rows: [] }]]);
        const res = mockRes();
        await resetPinoutDevice({ params: { id: 'missing' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
        expect(findCall(/UPDATE user_sessions/)).toBeUndefined();
    });

    test('clears the device and revokes only pinout sessions', async () => {
        routeQueries([
            [/UPDATE users\s+SET pinout_device_id = NULL/, { rows: [{ id: baseUser.id, email: baseUser.email }] }],
            [/UPDATE user_sessions/, { rows: [], rowCount: 1 }],
        ]);
        const res = mockRes();
        await resetPinoutDevice({ params: { id: baseUser.id } }, res, jest.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.success).toBe(true);
        expect(body.data.sessions_revoked).toBe(1);

        const [revokeSql] = findCall(/UPDATE user_sessions/);
        expect(revokeSql).toMatch(/client = 'pinout'/);
    });
});
