/**
 * Who may receive a lesson's paid content: its playable video_url, PDFs and notes.
 *
 * The first lesson (order_index 0) is a free preview for everyone. Every other lesson goes
 * only to admins and to users with active course_access. Lock flags are not enough on their
 * own: the API used to send every URL and leave the hiding to the client.
 */
const canViewLessonContent = (video, { hasAccess = false, isAdmin = false } = {}) =>
    isAdmin || hasAccess || video.order_index === 0;

/**
 * Returns the lesson unchanged if the viewer may see its content, otherwise a copy with
 * video_url, pdfs and markdown emptied (only the fields the caller selected).
 */
const protectLesson = (video, viewer) => {
    if (canViewLessonContent(video, viewer)) return video;

    const hidden = { ...video, video_url: null };
    if ("pdfs" in video) hidden.pdfs = [];
    if ("markdown" in video) hidden.markdown = null;
    return hidden;
};

module.exports = { canViewLessonContent, protectLesson };
