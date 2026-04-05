const pool = require("../config/database");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { sendProductExtraInfoEmail } = require("../config/email");
const { generateSlug } = require("../utils/helpers");

const getSchemaMismatchMessage = (error) => {
    if (error?.code === "42P01") {
        return "Product extra info database table is missing. Run the latest migration.";
    }

    if (error?.code === "42703") {
        return "Product extra info database schema is outdated. Run the latest migration.";
    }

    return null;
};

const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

const toPublicAssetUrl = (relativePath) => {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const baseUrl = process.env.BACKEND_URL || "http://localhost:5001";
    return `${baseUrl}/${normalizedPath}`;
};

const getFrontendUrl = () => {
    if (process.env.FRONTEND_URL) {
        return process.env.FRONTEND_URL.split(",")[0].trim();
    }

    return "http://localhost:3000";
};

const buildAccessUrl = (slug) => {
    return `${getFrontendUrl()}/product-extra-info/${slug}`;
};

const ensureUniqueSlug = async (baseSlug, excludeId = null) => {
    const rootSlug = baseSlug || `extra-info-${Date.now()}`;
    let slug = rootSlug;
    let suffix = 1;

    while (true) {
        const params = [slug];
        let sql = "SELECT id FROM product_extra_infos WHERE slug = $1";

        if (excludeId) {
            sql += " AND id != $2";
            params.push(excludeId);
        }

        const existing = await pool.query(sql, params);
        if (existing.rows.length === 0) {
            return slug;
        }

        slug = `${rootSlug}-${suffix++}`;
    }
};

const buildAttachmentMetadata = (files, kind, packageId) =>
    files.map((file) => {
        const relativePath = path
            .join("uploads", "product-extra-info", packageId, kind, file.filename)
            .replace(/\\/g, "/");

        return {
            name: file.originalName,
            filename: file.filename,
            mime_type: file.mimetype,
            size: file.size,
            path: relativePath,
            url: toPublicAssetUrl(relativePath),
        };
    });

const moveUploadedFiles = (files, targetDir) =>
    files.map((file) => {
        ensureDir(targetDir);
        const targetPath = path.join(targetDir, file.filename);
        fs.renameSync(file.path, targetPath);

        return {
            ...file,
            path: targetPath,
        };
    });

exports.createProductExtraInfo = async (req, res) => {
    const tempImages = req.files?.images || [];
    const tempPdfs = req.files?.pdfs || [];

    try {
        const { title, body } = req.body;

        if (!title) {
            return res
                .status(400)
                .json({ success: false, message: "Title is required" });
        }

        const slug = await ensureUniqueSlug(generateSlug(title));

        const packageId = uuidv4();
        const packageDir = path.join(
            __dirname,
            "../../uploads/product-extra-info",
            packageId
        );
        const imagesDir = path.join(packageDir, "images");
        const pdfsDir = path.join(packageDir, "pdfs");

        ensureDir(packageDir);

        const images = moveUploadedFiles(
            tempImages.map((file) => ({
                ...file,
                originalName: file.originalname,
            })),
            imagesDir
        );
        const pdfs = moveUploadedFiles(
            tempPdfs.map((file) => ({
                ...file,
                originalName: file.originalname,
            })),
            pdfsDir
        );

        const imageFiles = buildAttachmentMetadata(images, "images", packageId);
        const pdfFiles = buildAttachmentMetadata(pdfs, "pdfs", packageId);

        const result = await pool.query(
            `INSERT INTO product_extra_infos (id, title, slug, body, zip_file_path, image_files, pdf_files)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, title, slug, body, zip_file_path, image_files, pdf_files, created_at, updated_at`,
            [
                packageId,
                title,
                slug,
                body || "",
                null,
                JSON.stringify(imageFiles),
                JSON.stringify(pdfFiles),
            ]
        );

        res.status(201).json({
            success: true,
            message: "Product Extra Info created successfully",
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Error creating product extra info:", error);
        [...tempImages, ...tempPdfs].forEach((file) => {
            if (file?.path && fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                } catch (cleanupError) {
                    console.error("Failed to cleanup temp file:", cleanupError);
                }
            }
        });

        res.status(500).json({
            success: false,
            message:
                getSchemaMismatchMessage(error) ||
                "Error creating product extra info",
        });
    }
};

exports.getAllProductExtraInfos = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, slug, body, zip_file_path, image_files, pdf_files, created_at, updated_at
             FROM product_extra_infos
             ORDER BY created_at DESC`
        );
        res.status(200).json({
            success: true,
            data: result.rows,
        });
    } catch (error) {
        console.error("Error fetching product extra infos:", error);
        res.status(500).json({
            success: false,
            message:
                getSchemaMismatchMessage(error) ||
                "Error fetching product extra infos",
        });
    }
};

exports.getProductExtraInfoById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT id, title, slug, body, zip_file_path, image_files, pdf_files, created_at, updated_at
             FROM product_extra_infos
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "Extra Info package not found" });
        }

        return res.status(200).json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Error fetching product extra info detail:", error);
        res.status(500).json({
            success: false,
            message:
                getSchemaMismatchMessage(error) ||
                "Error fetching product extra info detail",
        });
    }
};

exports.getAccessibleProductExtraInfoBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await pool.query(
            `SELECT pei.id, pei.title, pei.slug, pei.body, pei.image_files, pei.pdf_files, pei.created_at, pei.updated_at
             FROM product_extra_infos pei
             LEFT JOIN product_extra_info_access peia
               ON peia.product_extra_info_id = pei.id
               AND peia.user_id = $2
             WHERE pei.slug = $1
               AND ($2 IS NOT NULL)
               AND (peia.id IS NOT NULL OR $3 = true)
             LIMIT 1`,
            [slug, req.user?.id || null, req.user?.role === "admin"]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Extra information not found or access denied",
            });
        }

        return res.json({
            success: true,
            data: result.rows[0],
        });
    } catch (error) {
        console.error("Error fetching accessible product extra info:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching extra information",
        });
    }
};

exports.grantAccess = async (req, res) => {
    try {
        const { product_extra_info_id, user_id, product_name } = req.body;

        if (!product_extra_info_id || !user_id) {
            return res
                .status(400)
                .json({ success: false, message: "Missing required fields" });
        }

        const infoResult = await pool.query(
            "SELECT id, title, slug FROM product_extra_infos WHERE id = $1",
            [product_extra_info_id]
        );
        if (infoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Extra Info package not found",
            });
        }
        const extraInfo = infoResult.rows[0];

        const userResult = await pool.query(
            "SELECT id, email, first_name, last_name FROM users WHERE id = $1",
            [user_id]
        );
        if (userResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        const user = userResult.rows[0];

        await pool.query(
            `INSERT INTO product_extra_info_access (user_id, product_extra_info_id, source, granted_by, note)
             VALUES ($1, $2, 'admin_grant', $3, $4)
             ON CONFLICT (user_id, product_extra_info_id) DO UPDATE
             SET source = 'admin_grant',
                 granted_by = EXCLUDED.granted_by,
                 note = EXCLUDED.note,
                 updated_at = CURRENT_TIMESTAMP`,
            [
                user_id,
                product_extra_info_id,
                req.user?.id || null,
                `Access granted for ${product_name || extraInfo.title}`,
            ]
        );

        await sendProductExtraInfoEmail(
            user.email,
            user.first_name,
            product_name || extraInfo.title,
            extraInfo.title,
            buildAccessUrl(extraInfo.slug)
        );

        res.status(200).json({
            success: true,
            message: "Access granted and email sent",
        });
    } catch (error) {
        console.error("Error granting access:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
            stack: error.stack,
        });
    }
};

exports.downloadZip = async (req, res) => {
    try {
        const { id } = req.params;

        const infoResult = await pool.query(
            "SELECT id, title, zip_file_path FROM product_extra_infos WHERE id = $1",
            [id]
        );
        if (infoResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Extra Info package not found",
            });
        }

        const extraInfo = infoResult.rows[0];
        const fullPath = path.join(__dirname, "../../", extraInfo.zip_file_path);

        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({
                success: false,
                message: "File not found on server",
            });
        }

        res.download(fullPath, `${extraInfo.title}.zip`);
    } catch (error) {
        console.error("Error downloading zip:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
