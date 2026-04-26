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
 * Extract Vimeo video ID from URL
 * Supports formats:
 * - https://vimeo.com/123456789
 * - https://player.vimeo.com/video/123456789
 * - https://vimeo.com/channels/staffpicks/123456789
 * - Full embed codes with parameters
 */
const extractVimeoId = (url) => {
    // Handle player.vimeo.com/video/ID format
    const playerMatch = url.match(/player\.vimeo\.com\/video\/(\d+)/);
    if (playerMatch && playerMatch[1]) {
        return playerMatch[1];
    }
    
    // Handle vimeo.com/ID format (including channels, groups)
    const regExp = /(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^/]*)\/videos\/|video\/|)(\d+)(?:|\/\?))/;
    const match = url.match(regExp);
    return match ? match[1] : null;
};

/**
 * Format Vimeo URL to embed format
 * Adds privacy and control parameters
 */
const formatVimeoEmbedUrl = (url) => {
    const videoId = extractVimeoId(url);
    if (!videoId) return url;
    // Add parameters: no title, no byline, no portrait for cleaner embed
    return `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0&dnt=1`;
};

/**
 * Detect video platform from URL
 * Returns: 'youtube', 'vimeo', or 'unknown'
 */
const detectVideoPlatform = (url) => {
    if (!url || typeof url !== 'string') return 'unknown';
    
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('youtube.com') || 
        urlLower.includes('youtu.be') || 
        urlLower.includes('youtube-nocookie.com')) {
        return 'youtube';
    }
    
    if (urlLower.includes('vimeo.com')) {
        return 'vimeo';
    }
    
    return 'unknown';
};

/**
 * Format video URL to proper embed format (supports YouTube and Vimeo)
 * Auto-detects platform and returns appropriate embed URL
 */
const formatVideoEmbedUrl = (url) => {
    if (!url) return url;
    
    const platform = detectVideoPlatform(url);
    
    switch (platform) {
        case 'youtube':
            return formatYouTubeEmbedUrl(url);
        case 'vimeo':
            return formatVimeoEmbedUrl(url);
        default:
            return url; // Return as-is if unknown platform
    }
};

/**
 * Get public URL for uploads/assets
 * Uses PUBLIC_URL if set, otherwise BACKEND_URL, otherwise FRONTEND_URL
 * Upload files are served by the backend, so BACKEND_URL must win over FRONTEND_URL
 */
const getPublicUrl = () => {
    // Priority: PUBLIC_URL > BACKEND_URL > FRONTEND_URL > default
    let url = 
        process.env.PUBLIC_URL ||
        process.env.BACKEND_URL ||
        process.env.FRONTEND_URL ||
        (process.env.NODE_ENV === "production"
            ? "https://www.diagtools.in"
            : "http://localhost:5001");
    
    // Clean up URL - remove any commas and extra whitespace (in case env var has multiple URLs)
    if (url && typeof url === 'string') {
        url = url.split(',')[0].trim(); // Take only the first URL if multiple are present
        // Remove trailing slash
        url = url.replace(/\/+$/, '');
    }
    
    return url;
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
    extractVimeoId,
    formatVimeoEmbedUrl,
    detectVideoPlatform,
    formatVideoEmbedUrl,
    normalizeImageUrl,
    getPublicUrl,
};
