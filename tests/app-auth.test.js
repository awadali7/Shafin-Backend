// Mock DB and side-effect modules before requiring the controllers
jest.mock('../src/config/database', () => {
    const query = jest.fn();
    return {
        query,
        // Transactions run through the same mocked query() so routeQueries covers them
        getClient: jest.fn(async () => ({ query, release: jest.fn() })),
    };
});
jest.mock('../src/config/email', () => ({
    sendAppOtpEmail: jest.fn(() => Promise.resolve({ success: true })),
    sendAppAccessApprovedEmail: jest.fn(() => Promise.resolve({ success: true })),
    sendAppAccessRejectedEmail: jest.fn(() => Promise.resolve({ success: true })),
}));

const bcrypt = require('bcryptjs');
const { query } = require('../src/config/database');
const {
    sendAppOtpEmail,
    sendAppAccessApprovedEmail,
    sendAppAccessRejectedEmail,
} = require('../src/config/email');
const { generateToken, generateRefreshToken } = require('../src/config/jwt');
const {
    signup,
    verifySignup,
    login,
    refresh,
    submitSerial,
    approveAppUser,
    rejectAppUser,
} = require('../src/controllers/appUserController');
const { authenticateAppUser } = require('../src/middleware/appAuth');

const PASSWORD = 'Secret123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const OTP = '123456';
const OTP_HASH = bcrypt.hashSync(OTP, 4);
const CHALLENGE_ID = '5d1c8f4e-0000-4000-8000-000000000001';
const USER_ID = '5d1c8f4e-0000-4000-8000-0000000000aa';
const SESSION_ID = '5d1c8f4e-0000-4000-8000-0000000000bb';
const DEVICE = { device_id: 'device-aaaa-1111', device_name: 'Pixel', device_platform: 'android' };

const baseUser = {
    id: USER_ID,
    full_name: 'Test Tech',
    email: 'tech@workshop.in',
    password_hash: PASSWORD_HASH,
    serial_number: null,
    status: 'serial_required',
    rejection_reason: null,
    serial_submitted_at: null,
    reviewed_at: null,
    is_active: true,
};

const mockReq = ({ body = {}, params = {}, headers = {}, ...rest } = {}) => ({
    body,
    params,
    headers: { 'user-agent': 'Dart/3.5 (dart:io)', ...headers },
    ip: '10.0.0.1',
    ...rest,
});

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const uniqueViolation = () => Object.assign(new Error('duplicate key'), { code: '23505' });

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
const callIndex = (pattern) => query.mock.calls.findIndex(([sql]) => pattern.test(sql));
const sentBody = (res) => res.json.mock.calls[0][0];

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

describe('signup', () => {
    const body = { full_name: 'Test Tech', email: baseUser.email, password: PASSWORD };

    test('email already registered → 409 EMAIL_TAKEN, no code sent', async () => {
        routeQueries([[/SELECT id FROM app_users WHERE email/, { rows: [{ id: USER_ID }] }]]);
        const res = mockRes();
        await signup(mockReq({ body }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sentBody(res).code).toBe('EMAIL_TAKEN');
        expect(sendAppOtpEmail).not.toHaveBeenCalled();
    });

    test('new email → stores hashed code with the pending account details, emails it', async () => {
        routeQueries([[/INSERT INTO app_email_otps/, { rows: [{ id: CHALLENGE_ID }] }]]);
        const res = mockRes();
        await signup(mockReq({ body }), res, jest.fn());

        expect(sentBody(res).data.challengeId).toBe(CHALLENGE_ID);

        const [, params] = findCall(/INSERT INTO app_email_otps/);
        const [email, purpose, otpHash, payload] = params;
        expect(email).toBe(baseUser.email);
        expect(purpose).toBe('signup');
        const { full_name, password_hash } = JSON.parse(payload);
        expect(full_name).toBe('Test Tech');
        expect(bcrypt.compareSync(PASSWORD, password_hash)).toBe(true);

        // The emailed code is the one whose hash was stored
        const sentOtp = sendAppOtpEmail.mock.calls[0][2];
        expect(sentOtp).toMatch(/^\d{6}$/);
        expect(bcrypt.compareSync(sentOtp, otpHash)).toBe(true);
    });

    test('code requested within cooldown → 429 OTP_COOLDOWN', async () => {
        routeQueries([[/created_at > NOW\(\) - INTERVAL/, { rows: [{ retry_after: 42 }] }]]);
        const res = mockRes();
        await signup(mockReq({ body }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
        expect(sentBody(res).data.retryAfterSeconds).toBe(42);
        expect(findCall(/INSERT INTO app_email_otps/)).toBeUndefined();
    });
});

describe('verifySignup', () => {
    const body = { challenge_id: CHALLENGE_ID, otp: OTP, ...DEVICE };
    const challenge = (attempts = 1) => ({
        email: baseUser.email,
        otp_hash: OTP_HASH,
        payload: { full_name: 'Test Tech', password_hash: PASSWORD_HASH },
        attempts,
    });

    test('expired or unknown challenge → 400 OTP_EXPIRED', async () => {
        routeQueries([]);
        const res = mockRes();
        await verifySignup(mockReq({ body }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(sentBody(res).code).toBe('OTP_EXPIRED');
    });

    test('wrong code → 400 OTP_INVALID with attempts remaining, no account', async () => {
        routeQueries([[/SET attempts = attempts \+ 1/, { rows: [challenge(2)] }]]);
        const res = mockRes();
        await verifySignup(mockReq({ body: { ...body, otp: '000000' } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(sentBody(res).data.attemptsRemaining).toBe(3);
        expect(findCall(/INSERT INTO app_users/)).toBeUndefined();
    });

    test('wrong code on the last attempt → 429 and the code is burned', async () => {
        routeQueries([[/SET attempts = attempts \+ 1/, { rows: [challenge(5)] }]]);
        const res = mockRes();
        await verifySignup(mockReq({ body: { ...body, otp: '000000' } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(429);
        expect(findCall(/UPDATE app_email_otps SET used = true WHERE id/)).toBeDefined();
    });

    test('correct code → creates the account and logs this device in', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [challenge()] }],
            [/SET used = true, payload = NULL/, { rows: [{ id: CHALLENGE_ID }] }],
            [/INSERT INTO app_users/, { rows: [baseUser] }],
        ]);
        const res = mockRes();
        await verifySignup(mockReq({ body }), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(201);
        const data = sentBody(res).data;
        expect(data.user.status).toBe('serial_required');
        expect(data.user.password_hash).toBeUndefined();
        expect(data.token).toBeDefined();
        expect(findCall(/INSERT INTO app_sessions/)).toBeDefined();
    });

    test('email registered by a concurrent signup → 409 EMAIL_TAKEN', async () => {
        routeQueries([
            [/SET attempts = attempts \+ 1/, { rows: [challenge()] }],
            [/SET used = true, payload = NULL/, { rows: [{ id: CHALLENGE_ID }] }],
            [/INSERT INTO app_users/, () => { throw uniqueViolation(); }],
        ]);
        const res = mockRes();
        await verifySignup(mockReq({ body }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sentBody(res).code).toBe('EMAIL_TAKEN');
    });
});

// ---------------------------------------------------------------------------
// Login — one device at a time
// ---------------------------------------------------------------------------

describe('login', () => {
    const body = { email: baseUser.email, password: PASSWORD, ...DEVICE };

    test('unknown email → 401 INVALID_CREDENTIALS', async () => {
        routeQueries([]);
        const res = mockRes();
        await login(mockReq({ body }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(sentBody(res).code).toBe('INVALID_CREDENTIALS');
    });

    test('wrong password → 401 INVALID_CREDENTIALS', async () => {
        routeQueries([[/FROM app_users WHERE email/, { rows: [baseUser] }]]);
        const res = mockRes();
        await login(mockReq({ body: { ...body, password: 'Nope1234' } }), res, jest.fn());
        expect(sentBody(res).code).toBe('INVALID_CREDENTIALS');
        expect(findCall(/INSERT INTO app_sessions/)).toBeUndefined();
    });

    test('deactivated account → 401 ACCOUNT_DEACTIVATED', async () => {
        routeQueries([[/FROM app_users WHERE email/, { rows: [{ ...baseUser, is_active: false }] }]]);
        const res = mockRes();
        await login(mockReq({ body }), res, jest.fn());
        expect(sentBody(res).code).toBe('ACCOUNT_DEACTIVATED');
    });

    test('success → ends other devices\' sessions under a row lock, then starts this one', async () => {
        routeQueries([[/FROM app_users WHERE email/, { rows: [baseUser] }]]);
        const res = mockRes();
        await login(mockReq({ body }), res, jest.fn());

        expect(sentBody(res).success).toBe(true);
        const lockIdx = callIndex(/FOR UPDATE/);
        const endIdx = callIndex(/ended_reason = 'replaced'/);
        const insertIdx = callIndex(/INSERT INTO app_sessions/);
        expect(lockIdx).toBeGreaterThanOrEqual(0);
        expect(lockIdx).toBeLessThan(endIdx);
        expect(endIdx).toBeLessThan(insertIdx);
        expect(findCall(/COMMIT/)).toBeDefined();
        expect(findCall(/INSERT INTO app_sessions/)[1][2]).toBe(DEVICE.device_id);
    });
});

// ---------------------------------------------------------------------------
// Sessions: app tokens only, replaced sessions are reported
// ---------------------------------------------------------------------------

describe('session checks', () => {
    const appPayload = { appUserId: USER_ID, sessionId: SESSION_ID, typ: 'app' };
    const sessionRow = (overrides) => ({
        session_active: true,
        ended_reason: null,
        session_live: true,
        ...baseUser,
        ...overrides,
    });

    test('website token → 401 TOKEN_INVALID without touching the DB', async () => {
        const token = generateToken({ userId: USER_ID, email: baseUser.email, sessionId: SESSION_ID });
        const res = mockRes();
        const next = jest.fn();
        await authenticateAppUser(mockReq({ headers: { authorization: `Bearer ${token}` } }), res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(sentBody(res).code).toBe('TOKEN_INVALID');
        expect(next).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });

    test('session ended by a login elsewhere → 401 SESSION_REPLACED', async () => {
        routeQueries([[/FROM app_sessions s/, { rows: [sessionRow({ session_active: false, ended_reason: 'replaced' })] }]]);
        const token = generateToken(appPayload);
        const res = mockRes();
        await authenticateAppUser(mockReq({ headers: { authorization: `Bearer ${token}` } }), res, jest.fn());
        expect(sentBody(res).code).toBe('SESSION_REPLACED');
    });

    test('active session → attaches the app user', async () => {
        routeQueries([[/FROM app_sessions s/, { rows: [sessionRow()] }]]);
        const token = generateToken(appPayload);
        const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
        const next = jest.fn();
        await authenticateAppUser(req, mockRes(), next);
        expect(next).toHaveBeenCalledWith();
        expect(req.appUser.id).toBe(USER_ID);
        expect(req.appUser.sessionId).toBe(SESSION_ID);
    });

    test('refresh on a replaced session → 401 SESSION_REPLACED', async () => {
        routeQueries([[/FROM app_sessions s/, { rows: [sessionRow({ session_active: false, ended_reason: 'replaced' })] }]]);
        const res = mockRes();
        await refresh(mockReq({ body: { refreshToken: generateRefreshToken(appPayload) } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(sentBody(res).code).toBe('SESSION_REPLACED');
    });

    test('refresh with a website refresh token → 401', async () => {
        const res = mockRes();
        await refresh(mockReq({ body: { refreshToken: generateRefreshToken({ userId: USER_ID, sessionId: SESSION_ID }) } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(query).not.toHaveBeenCalled();
    });

    test('refresh on an active session → new tokens plus current status', async () => {
        routeQueries([[/FROM app_sessions s/, { rows: [sessionRow({ status: 'approved' })] }]]);
        const res = mockRes();
        await refresh(mockReq({ body: { refreshToken: generateRefreshToken(appPayload) } }), res, jest.fn());
        const data = sentBody(res).data;
        expect(data.user.status).toBe('approved');
        expect(data.token).toBeDefined();
        expect(data.refreshToken).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// Serial number
// ---------------------------------------------------------------------------

describe('submitSerial', () => {
    const req = (status) =>
        mockReq({ body: { serial_number: 'DT-001' }, appUser: { ...baseUser, status } });

    test.each(['pending', 'approved'])('already %s → 409 SERIAL_ALREADY_SUBMITTED', async (status) => {
        const res = mockRes();
        await submitSerial(req(status), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sentBody(res).code).toBe('SERIAL_ALREADY_SUBMITTED');
        expect(query).not.toHaveBeenCalled();
    });

    test('serial held by another account → 409 SERIAL_TAKEN', async () => {
        routeQueries([[/UPDATE app_users/, () => { throw uniqueViolation(); }]]);
        const res = mockRes();
        await submitSerial(req('serial_required'), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sentBody(res).code).toBe('SERIAL_TAKEN');
    });

    test.each(['serial_required', 'rejected'])('from %s → pending', async (status) => {
        routeQueries([[/UPDATE app_users/, { rows: [{ ...baseUser, serial_number: 'DT-001', status: 'pending' }] }]]);
        const res = mockRes();
        await submitSerial(req(status), res, jest.fn());
        expect(sentBody(res).data.user.status).toBe('pending');
        expect(findCall(/UPDATE app_users/)[1]).toEqual(['DT-001', USER_ID]);
    });
});

// ---------------------------------------------------------------------------
// Admin review
// ---------------------------------------------------------------------------

describe('admin review', () => {
    const adminReq = (body = {}) => mockReq({ body, params: { id: USER_ID }, user: { id: 'admin-1' } });
    const reviewed = { id: USER_ID, full_name: 'Test Tech', email: baseUser.email, serial_number: 'DT-001' };

    test('approve → approved, email sent', async () => {
        routeQueries([[/SET status = 'approved'/, { rows: [{ ...reviewed, status: 'approved' }] }]]);
        const res = mockRes();
        await approveAppUser(adminReq(), res, jest.fn());
        expect(sentBody(res).data.user.status).toBe('approved');
        expect(sendAppAccessApprovedEmail).toHaveBeenCalledWith(baseUser.email, 'Test Tech', 'DT-001');
    });

    test('approve after someone else claimed the serial → 409 SERIAL_TAKEN', async () => {
        routeQueries([[/SET status = 'approved'/, () => { throw uniqueViolation(); }]]);
        const res = mockRes();
        await approveAppUser(adminReq(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
        expect(sentBody(res).code).toBe('SERIAL_TAKEN');
    });

    test('approve a user who has not submitted a serial → 409', async () => {
        routeQueries([[/SELECT status FROM app_users/, { rows: [{ status: 'serial_required' }] }]]);
        const res = mockRes();
        await approveAppUser(adminReq(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(409);
    });

    test('unknown user → 404', async () => {
        routeQueries([]);
        const res = mockRes();
        await rejectAppUser(adminReq(), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
    });

    test('reject → rejected with reason, email sent', async () => {
        routeQueries([
            [/SET status = 'rejected'/, (sql, params) => ({
                rows: [{ ...reviewed, status: 'rejected', rejection_reason: params[0] }],
            })],
        ]);
        const res = mockRes();
        await rejectAppUser(adminReq({ reason: '  Wrong serial  ' }), res, jest.fn());
        expect(sentBody(res).data.user.rejection_reason).toBe('Wrong serial');
        expect(sendAppAccessRejectedEmail).toHaveBeenCalledWith(baseUser.email, 'Test Tech', 'DT-001', 'Wrong serial');
    });
});
