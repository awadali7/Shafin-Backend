// Paid lesson content (video_url, pdfs, markdown) must only reach admins and users with
// active course_access; everyone gets the free first lesson (order_index 0).
jest.mock('../src/config/database', () => {
    const query = jest.fn();
    return { query, getClient: jest.fn(async () => ({ query, release: jest.fn() })) };
});

const { query } = require('../src/config/database');
const { getCourseVideos, getVideoById } = require('../src/controllers/videoController');
const { getCourseProgress } = require('../src/controllers/userController');
const { optionalAuthenticate } = require('../src/middleware/auth');
const videoRoutes = require('../src/routes/videos');

const COURSE_ID = 'c0000000-0000-4000-8000-000000000001';
const USER_ID = 'u0000000-0000-4000-8000-000000000001';

const lesson = (order_index) => ({
    id: `v${order_index}`,
    title: `Lesson ${order_index + 1}`,
    video_url: `https://player.vimeo.com/video/10${order_index}`,
    description: 'About this lesson',
    order_index,
    pdfs: [{ name: 'wiring.pdf', url: '/uploads/pdfs/wiring.pdf' }],
    markdown: '## Notes',
    created_at: '2026-11-01T00:00:00Z',
});

const LESSONS = [lesson(0), lesson(1), lesson(2)];

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};
const sentBody = (res) => res.json.mock.calls[0][0];

// hasAccess controls what the course_access lookup returns; progress rows mark nothing unlocked
const routeQueries = ({ hasAccess }) => {
    query.mockImplementation(async (sql, params) => {
        if (/FROM course_access/.test(sql)) {
            return { rows: hasAccess ? [{ id: 'a1', user_id: USER_ID, course_id: COURSE_ID }] : [] };
        }
        if (/FROM courses/.test(sql)) {
            return { rows: [{ id: COURSE_ID, name: 'ECU Programming', slug: 'ecu-programming' }] };
        }
        if (/FROM videos v/.test(sql)) {
            const found = LESSONS.find((l) => l.id === params[0]);
            return { rows: found ? [{ ...found, course_id: COURSE_ID, course_name: 'ECU Programming' }] : [] };
        }
        if (/FROM videos/.test(sql)) return { rows: LESSONS.map((l) => ({ ...l })) };
        if (/FROM video_progress/.test(sql)) return { rows: [] };
        return { rows: [] };
    });
};

const visitor = {};
const student = { user: { id: USER_ID, role: 'student' } };
const admin = { user: { id: USER_ID, role: 'admin' } };

const listFor = async (who, { hasAccess }) => {
    routeQueries({ hasAccess });
    const res = mockRes();
    const next = jest.fn();
    await getCourseVideos({ params: { courseId: COURSE_ID }, ...who }, res, next);
    expect(next).not.toHaveBeenCalled();
    return sentBody(res).data.videos;
};

const expectHidden = (video) => {
    expect(video.video_url).toBeNull();
    expect(video.pdfs).toEqual([]);
    expect(video.markdown).toBeNull();
    expect(video.title).toBeTruthy(); // the lesson list itself stays visible
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /api/courses/:courseId/videos', () => {
    test('visitor gets only the free first lesson URL', async () => {
        const videos = await listFor(visitor, { hasAccess: false });
        expect(videos[0].video_url).toBe(LESSONS[0].video_url);
        expect(videos[0].pdfs).toEqual(LESSONS[0].pdfs);
        expectHidden(videos[1]);
        expectHidden(videos[2]);
    });

    test('logged-in user without course access gets only the first lesson URL', async () => {
        const videos = await listFor(student, { hasAccess: false });
        expect(videos[0].video_url).toBe(LESSONS[0].video_url);
        expectHidden(videos[1]);
        expectHidden(videos[2]);
    });

    test('enrolled user gets every URL, even for lessons progress has not unlocked', async () => {
        const videos = await listFor(student, { hasAccess: true });
        videos.forEach((v, i) => {
            expect(v.video_url).toBe(LESSONS[i].video_url);
            expect(v.markdown).toBe('## Notes');
        });
        expect(videos[2].is_locked).toBe(true); // lock flags are unchanged
    });

    test('admin without course access still gets every URL (admin editor uses this endpoint)', async () => {
        const videos = await listFor(admin, { hasAccess: false });
        videos.forEach((v, i) => expect(v.video_url).toBe(LESSONS[i].video_url));
    });

    test('route runs optionalAuthenticate so req.user is set when a token is sent', () => {
        const handlersFor = (path) =>
            videoRoutes.stack
                .find((layer) => layer.route && layer.route.path === path && layer.route.methods.get)
                .route.stack.map((s) => s.handle);
        expect(handlersFor('/:courseId/videos')).toContain(optionalAuthenticate);
        expect(handlersFor('/:courseId/videos/:videoId')).toContain(optionalAuthenticate);
    });
});

describe('GET /api/courses/:courseId/videos/:videoId', () => {
    const getOne = async (who, videoId, { hasAccess }) => {
        routeQueries({ hasAccess });
        const res = mockRes();
        await getVideoById({ params: { courseId: COURSE_ID, videoId }, ...who }, res, jest.fn());
        return sentBody(res).data;
    };

    test('locked lesson has no URL for a visitor', async () => {
        expectHidden(await getOne(visitor, 'v2', { hasAccess: false }));
    });

    test('free first lesson has its URL for a visitor', async () => {
        expect((await getOne(visitor, 'v0', { hasAccess: false })).video_url).toBe(LESSONS[0].video_url);
    });

    test('enrolled user gets the URL', async () => {
        expect((await getOne(student, 'v2', { hasAccess: true })).video_url).toBe(LESSONS[2].video_url);
    });
});

describe('GET /api/users/courses/:courseId/progress', () => {
    const progressFor = async ({ hasAccess }) => {
        routeQueries({ hasAccess });
        const res = mockRes();
        await getCourseProgress({ params: { courseId: COURSE_ID }, ...student }, res, jest.fn());
        return sentBody(res).data.videos;
    };

    test('user without access gets only the first lesson URL', async () => {
        const videos = await progressFor({ hasAccess: false });
        expect(videos[0].video_url).toBe(LESSONS[0].video_url);
        expect(videos[1].video_url).toBeNull();
        expect(videos[2].video_url).toBeNull();
    });

    test('enrolled user gets every URL', async () => {
        const videos = await progressFor({ hasAccess: true });
        videos.forEach((v, i) => expect(v.video_url).toBe(LESSONS[i].video_url));
    });
});
