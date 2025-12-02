const express = require("express");
const router = express.Router();
const blogController = require("../controllers/blogController");
const { authenticate } = require("../middleware/auth");
const { isAdmin } = require("../middleware/auth");

// Public routes
router.get("/", blogController.getAllBlogPosts);
router.get("/:slug", blogController.getBlogPostBySlug);

// Admin routes (require authentication and admin role)
router.get(
    "/admin/all",
    authenticate,
    isAdmin,
    blogController.getAllBlogPostsAdmin
);
router.get("/admin/:id", authenticate, isAdmin, blogController.getBlogPostById);
router.post("/", authenticate, isAdmin, blogController.createBlogPost);
router.put("/:id", authenticate, isAdmin, blogController.updateBlogPost);
router.delete("/:id", authenticate, isAdmin, blogController.deleteBlogPost);

module.exports = router;

