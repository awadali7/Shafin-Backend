const pool = require("../config/database");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { v4: uuidv4 } = require("uuid");
const { sendProductExtraInfoEmail } = require("../config/email");

const createZipArchive = async (title, body, images, pdfs, outputPath) => {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Sets the compression level.
        });

        output.on('close', function() {
            resolve();
        });

        archive.on('error', function(err) {
            reject(err);
        });

        archive.pipe(output);

        // Add the body.md
        if (body) {
            archive.append(body, { name: 'body.md' });
        }

        // Add images
        if (images && images.length > 0) {
            images.forEach((file) => {
                archive.file(file.path, { name: `images/${file.originalname}` });
            });
        }

        // Add pdfs
        if (pdfs && pdfs.length > 0) {
            pdfs.forEach((file) => {
                archive.file(file.path, { name: `pdfs/${file.originalname}` });
            });
        }

        archive.finalize();
    });
};

exports.createProductExtraInfo = async (req, res) => {
    try {
        const { title, body } = req.body;
        const images = req.files && req.files['images'] ? req.files['images'] : [];
        const pdfs = req.files && req.files['pdfs'] ? req.files['pdfs'] : [];

        if (!title) {
            return res.status(400).json({ success: false, message: "Title is required" });
        }

        // Ensure directories exist
        const extraInfoDir = path.join(__dirname, "../../private_uploads/extra_info");
        if (!fs.existsSync(extraInfoDir)) {
            fs.mkdirSync(extraInfoDir, { recursive: true });
        }

        const zipFileName = `${uuidv4()}-extra-info.zip`;
        const zipFilePath = path.join(extraInfoDir, zipFileName);
        const relativeZipPath = `private_uploads/extra_info/${zipFileName}`;

        await createZipArchive(title, body, images, pdfs, zipFilePath);

        // Clean up uploaded temporary files to save space
        [...images, ...pdfs].forEach(file => {
            if (fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                } catch (e) {
                    console.error("Failed to delete temp file:", file.path, e);
                }
            }
        });

        // Insert into database
        const result = await pool.query(
            `INSERT INTO product_extra_infos (title, body, zip_file_path)
             VALUES ($1, $2, $3)
             RETURNING id, title, zip_file_path, created_at`,
            [title, body, relativeZipPath]
        );

        res.status(201).json({
            success: true,
            message: "Product Extra Info created successfully",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Error creating product extra info:", error);
        res.status(500).json({ success: false, message: "Error creating product extra info" });
    }
};

exports.getAllProductExtraInfos = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, created_at FROM product_extra_infos ORDER BY created_at DESC`
        );
        res.status(200).json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error("Error fetching product extra infos:", error);
        res.status(500).json({ success: false, message: "Error fetching product extra infos" });
    }
};

exports.grantAccess = async (req, res) => {
    try {
        const { product_extra_info_id, user_id, product_name } = req.body;
        
        if (!product_extra_info_id || !user_id) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        const infoResult = await pool.query(
            "SELECT id, title, zip_file_path FROM product_extra_infos WHERE id = $1",
            [product_extra_info_id]
        );
        if (infoResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Extra Info package not found" });
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

        const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
        // Simple download URL (could be secured with short-lived tokens in production)
        const zipDownloadUrl = `${backendUrl}/api/product-extra-info/download/${product_extra_info_id}`;
        
        const emailResult = await sendProductExtraInfoEmail(
            user.email,
            user.first_name,
            product_name || extraInfo.title,
            zipDownloadUrl
        );

        res.status(200).json({ success: true, message: "Access granted and email sent" });
    } catch (error) {
        console.error("Error granting access:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message, stack: error.stack });
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
            return res.status(404).json({ success: false, message: "Extra Info package not found" });
        }
        
        const extraInfo = infoResult.rows[0];
        const fullPath = path.join(__dirname, "../../", extraInfo.zip_file_path);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ success: false, message: "File not found on server" });
        }
        
        res.download(fullPath, `${extraInfo.title}.zip`);
    } catch (error) {
        console.error("Error downloading zip:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
