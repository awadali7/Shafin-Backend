/**
 * Generate a slug from a string
 */
const generateSlug = (str) => {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
};

/**
 * Format date to ISO string
 */
const formatDate = (date) => {
    return new Date(date).toISOString();
};

/**
 * Check if date is in the past
 */
const isPast = (date) => {
    return new Date(date) < new Date();
};

/**
 * Check if date is in the future
 */
const isFuture = (date) => {
    return new Date(date) > new Date();
};

/**
 * Check if current time is between two dates
 */
const isBetween = (startDate, endDate) => {
    const now = new Date();
    return now >= new Date(startDate) && now <= new Date(endDate);
};

/**
 * Sanitize user input
 */
const sanitizeInput = (input) => {
    if (typeof input !== "string") return input;
    return input.trim().replace(/[<>]/g, "");
};

/**
 * Extract YouTube video ID from URL
 */
const extractYouTubeId = (url) => {
    const regExp =
        /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
};

/**
 * Format YouTube URL to embed format
 */
const formatYouTubeEmbedUrl = (url) => {
    const videoId = extractYouTubeId(url);
    if (!videoId) return url;
    return `https://www.youtube.com/embed/${videoId}`;
};

/**
 * Normalize image URL - transforms localhost URLs to production backend URL
 */
const normalizeImageUrl = (url) => {
    if (!url) return url;

    // If it's already a full external URL (not localhost), return as is
    if (url.startsWith("https://") && !url.includes("localhost")) {
        return url;
    }

    // If it's a localhost URL, transform it
    if (url.includes("localhost") || url.startsWith("http://localhost")) {
        const backendUrl =
            process.env.BACKEND_URL ||
            process.env.API_URL ||
            "https://api.diagtools.in";

        try {
            // Extract the path from the URL
            const urlObj = new URL(url);
            const path = urlObj.pathname;
            // Construct new URL
            return `${backendUrl}${path}`;
        } catch (e) {
            // If URL parsing fails, try to extract path manually
            const pathMatch = url.match(/\/uploads\/.*$/);
            if (pathMatch) {
                return `${backendUrl}${pathMatch[0]}`;
            }
        }
    }

    // If it's a relative path starting with /uploads/, prepend backend URL
    if (url.startsWith("/uploads/")) {
        const backendUrl =
            process.env.BACKEND_URL ||
            process.env.API_URL ||
            "https://api.diagtools.in";
        return `${backendUrl}${url}`;
    }

    return url;
};

module.exports = {
    generateSlug,
    formatDate,
    isPast,
    isFuture,
    isBetween,
    sanitizeInput,
    extractYouTubeId,
    formatYouTubeEmbedUrl,
    normalizeImageUrl,
};
