# Email Setup Guide for Localhost Development

This guide explains how to set up email functionality for local development.

## Option 1: Gmail with App Password (Recommended for Quick Setup)

### Steps:

1. **Enable 2-Factor Authentication** on your Gmail account
   - Go to: https://myaccount.google.com/security
   - Enable 2-Step Verification

2. **Generate App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "E-Learning Platform" as the name
   - Click "Generate"
   - Copy the 16-character password (no spaces)

3. **Update your `.env` file:**

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
EMAIL_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:3000
```

### Example `.env` file:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=john.doe@gmail.com
EMAIL_PASS=abcd efgh ijkl mnop
EMAIL_FROM=john.doe@gmail.com
FRONTEND_URL=http://localhost:3000
```

**Note:** Remove spaces from the app password when pasting.

---

## Option 2: Mailtrap (Best for Testing - No Real Emails Sent)

Mailtrap is perfect for development - it captures all emails without sending them.

### Steps:

1. **Sign up for free**: https://mailtrap.io/
2. **Create an inbox** in your Mailtrap dashboard
3. **Copy SMTP credentials** from your inbox settings
4. **Update your `.env` file:**

```env
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your-mailtrap-username
EMAIL_PASS=your-mailtrap-password
EMAIL_FROM=noreply@elearning-platform.com
FRONTEND_URL=http://localhost:3000
```

**Benefits:**
- ✅ Free tier available
- ✅ No real emails sent
- ✅ View emails in Mailtrap dashboard
- ✅ Test email templates easily

---

## Option 3: MailHog (Local SMTP Server)

MailHog runs a local SMTP server that captures all emails.

### Installation:

**macOS:**
```bash
brew install mailhog
```

**Or using Docker:**
```bash
docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

### Start MailHog:
```bash
mailhog
# Or if using Docker, it's already running
```

### Access MailHog UI:
Open http://localhost:8025 in your browser to view captured emails.

### Update your `.env` file:

```env
EMAIL_HOST=localhost
EMAIL_PORT=1025
EMAIL_USER=(leave empty or any value)
EMAIL_PASS=(leave empty or any value)
EMAIL_FROM=noreply@elearning-platform.com
FRONTEND_URL=http://localhost:3000
```

**Benefits:**
- ✅ Completely local
- ✅ No internet required
- ✅ View emails in web UI
- ✅ Perfect for offline development

---

## Option 4: SendGrid (Production-like Testing)

### Steps:

1. **Sign up**: https://sendgrid.com/
2. **Create API Key**:
   - Go to Settings → API Keys
   - Create a new API key with "Mail Send" permissions
3. **Update your `.env` file:**

```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
EMAIL_FROM=your-verified-sender-email@example.com
FRONTEND_URL=http://localhost:3000
```

---

## Option 5: Mailgun (Alternative Production Service)

### Steps:

1. **Sign up**: https://www.mailgun.com/
2. **Get SMTP credentials** from your Mailgun dashboard
3. **Update your `.env` file:**

```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=your-mailgun-smtp-username
EMAIL_PASS=your-mailgun-smtp-password
EMAIL_FROM=noreply@your-domain.com
FRONTEND_URL=http://localhost:3000
```

---

## Testing Your Email Setup

After configuring your `.env` file, restart your backend server:

```bash
cd backend
npm run dev
```

You should see one of these messages:
- ✅ `Email service is ready to send messages` (if configured correctly)
- ⚠️ `Email service not configured` (if credentials are missing)

### Test Email Sending:

1. **Register a new user** - should send welcome email
2. **Login from different device** - should send multiple device warning
3. **Request password reset** - should send reset email

---

## Troubleshooting

### Gmail Issues:

**Error: "Invalid login"**
- Make sure you're using an App Password, not your regular Gmail password
- Check that 2-Factor Authentication is enabled

**Error: "Less secure app access"**
- Gmail no longer supports "less secure apps"
- You MUST use App Passwords

### Mailtrap Issues:

**Error: "Connection timeout"**
- Check your internet connection
- Verify Mailtrap credentials are correct

### MailHog Issues:

**Error: "Connection refused"**
- Make sure MailHog is running: `mailhog`
- Check if port 1025 is available

### General Issues:

**Error: "ECONNREFUSED"**
- Check EMAIL_HOST and EMAIL_PORT are correct
- Verify the SMTP server is accessible

**Emails not sending but no error:**
- Check server logs for email warnings
- Verify EMAIL_USER and EMAIL_PASS are set correctly
- Check EMAIL_FROM is set

---

## Recommended Setup for Development

**For quick testing:** Use **Mailtrap** or **MailHog**
- No risk of sending real emails
- Easy to view/test email templates
- Free to use

**For production-like testing:** Use **Gmail with App Password**
- Tests real email delivery
- Free to use
- Easy to set up

---

## Environment Variables Summary

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com          # SMTP server hostname
EMAIL_PORT=587                      # SMTP port (587 for TLS, 465 for SSL)
EMAIL_USER=your-email@gmail.com    # SMTP username
EMAIL_PASS=your-app-password       # SMTP password or API key
EMAIL_FROM=your-email@gmail.com    # From email address

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000  # Your frontend URL
```

---

## Security Notes

⚠️ **Never commit your `.env` file to Git!**

Make sure `.env` is in your `.gitignore`:
```
.env
.env.local
.env.*.local
```

---

## Quick Start (Gmail)

1. Enable 2FA on Gmail
2. Generate App Password
3. Add to `.env`:
   ```env
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-16-char-app-password
   EMAIL_FROM=your-email@gmail.com
   ```
4. Restart server
5. Test by registering a new user

Done! ✅

