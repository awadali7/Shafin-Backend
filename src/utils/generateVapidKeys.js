const webpush = require("web-push");

// Generate VAPID keys for push notifications
const vapidKeys = webpush.generateVAPIDKeys();

console.log("\n=== VAPID Keys for Push Notifications ===\n");
console.log("Public Key:");
console.log(vapidKeys.publicKey);
console.log("\nPrivate Key:");
console.log(vapidKeys.privateKey);
console.log("\n=== Add these to your .env file ===\n");
console.log("VAPID_PUBLIC_KEY=" + vapidKeys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + vapidKeys.privateKey);
console.log("VAPID_SUBJECT=mailto:your-email@example.com");
console.log("\n");
