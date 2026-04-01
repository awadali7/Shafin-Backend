/**
 * Email Testing Script
 * Run with: node test-email.js
 */
const { sendWelcomeEmail } = require("./src/config/email");
require("dotenv").config();

async function testEmail() {
    console.log("Starting email test...");
    console.log(`Current Provider: ${process.env.EMAIL_HOST}`);
    console.log(`From Address: ${process.env.EMAIL_FROM}`);

    try {
        const result = await sendWelcomeEmail(
            process.env.EMAIL_USER || "test@example.com",
            "Test User"
        );
        
        if (result.success) {
            console.log("✅ Test successful! Message ID:", result.messageId);
        } else {
            console.warn("⚠️  Test failed:", result.message);
            console.log("NOTE: This is expected if you haven't configured real credentials yet.");
        }
    } catch (error) {
        console.error("❌ Unexpected error during test:", error.message);
    }
}

testEmail();
