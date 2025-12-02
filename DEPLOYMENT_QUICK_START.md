# 🚀 Quick Deployment Guide - Hostinger VPS

## Prerequisites Checklist
- [ ] VPS IP address or domain name
- [ ] SSH access credentials
- [ ] Domain name (optional but recommended)
- [ ] Email service credentials (Gmail App Password, etc.)

## Step-by-Step Deployment

### 1. Connect to VPS
```bash
ssh root@your-vps-ip
```

### 2. Run Initial Setup (One-time)
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs postgresql postgresql-contrib nginx git

# Install PM2
npm install -g pm2
```

### 3. Setup PostgreSQL
```bash
su - postgres
psql -c "CREATE DATABASE elearning_db;"
psql -c "CREATE USER elearning_user WITH PASSWORD 'YOUR_SECURE_PASSWORD';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE elearning_db TO elearning_user;"
exit
```

### 4. Upload Your Code
```bash
# Create app directory
mkdir -p /var/www/elearning-backend
cd /var/www/elearning-backend

# Option A: Clone from Git
git clone YOUR_REPO_URL backend

# Option B: Upload via SCP (from local machine)
# scp -r backend root@your-vps-ip:/var/www/elearning-backend/
```

### 5. Configure Environment
```bash
cd /var/www/elearning-backend/backend
cp env.example .env
nano .env
```

**Required .env values:**
- `DATABASE_URL=postgresql://elearning_user:YOUR_PASSWORD@localhost:5432/elearning_db`
- `JWT_SECRET` (generate: `openssl rand -base64 32`)
- `JWT_REFRESH_SECRET` (generate: `openssl rand -base64 32`)
- `EMAIL_*` (your email service credentials)
- `FRONTEND_URL=https://yourdomain.com`
- `VAPID_*` (generate: `node src/utils/generateVapidKeys.js`)

### 6. Install & Setup
```bash
# Install dependencies
npm install --production

# Setup database
psql -U elearning_user -d elearning_db -f schema.sql

# Create admin user
npm run create-admin

# Create uploads directory
mkdir -p uploads/images uploads/documents uploads/blog logs
chmod -R 755 uploads logs
```

### 7. Start with PM2
```bash
# Start application
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Setup auto-start on boot
pm2 startup
# Follow the instructions shown
```

### 8. Configure Nginx
```bash
# Create Nginx config
nano /etc/nginx/sites-available/elearning-backend
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads {
        alias /var/www/elearning-backend/backend/uploads;
        expires 30d;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/elearning-backend /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### 9. Setup SSL (Let's Encrypt)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.yourdomain.com
```

### 10. Configure Firewall
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Verify Deployment

```bash
# Check PM2
pm2 status

# Check logs
pm2 logs elearning-backend

# Test API
curl http://localhost:5001/health
```

## Common Commands

```bash
# Restart app
pm2 restart elearning-backend

# View logs
pm2 logs elearning-backend

# Update code
cd /var/www/elearning-backend/backend
git pull
npm install --production
pm2 restart elearning-backend
```

## Troubleshooting

**App won't start:**
```bash
pm2 logs elearning-backend --lines 50
```

**Database connection error:**
```bash
psql -U elearning_user -d elearning_db -h localhost
```

**Nginx error:**
```bash
nginx -t
tail -f /var/log/nginx/error.log
```

---

**Full documentation:** See `DEPLOYMENT.md` for detailed instructions.

