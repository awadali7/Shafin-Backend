# 🚀 Backend Deployment Guide - Hostinger VPS

Complete guide for deploying the E-Learning Platform backend to Hostinger VPS (KVM2).

## 📋 Prerequisites

- Hostinger VPS with root/SSH access
- Domain name (optional but recommended)
- Basic knowledge of Linux commands
- SSH client (Terminal on Mac/Linux, PuTTY on Windows)

## 🔧 Step 1: Connect to Your VPS

```bash
ssh root@your-vps-ip
# or
ssh root@your-domain.com
```

## 📦 Step 2: Update System

```bash
# Update package list
apt update && apt upgrade -y

# Install essential tools
apt install -y curl wget git build-essential
```

## 🗄️ Step 3: Install PostgreSQL

```bash
# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
systemctl start postgresql
systemctl enable postgresql

# Switch to postgres user
su - postgres

# Create database and user
psql -c "CREATE DATABASE elearning_db;"
psql -c "CREATE USER elearning_user WITH PASSWORD 'your_secure_password_here';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE elearning_db TO elearning_user;"
psql -c "ALTER USER elearning_user CREATEDB;"

# Exit postgres user
exit
```

## 🟢 Step 4: Install Node.js (v18+)

```bash
# Install Node.js using NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Verify installation
node -v  # Should show v18.x.x or higher
npm -v
```

## 📁 Step 5: Setup Application Directory

```bash
# Create application directory
mkdir -p /var/www/elearning-backend
cd /var/www/elearning-backend

# Set ownership (replace 'your-user' with your actual user)
# If using root, you can skip this
# chown -R your-user:your-user /var/www/elearning-backend
```

## 📥 Step 6: Upload Your Code

### Option A: Using Git (Recommended)

```bash
# Clone your repository
git clone https://github.com/your-username/your-repo.git /var/www/elearning-backend

# Or if you have a private repo, use SSH
# git clone git@github.com:your-username/your-repo.git /var/www/elearning-backend
```

### Option B: Using SCP (from your local machine)

```bash
# From your local machine, compress and upload
cd /path/to/your/project
tar -czf backend.tar.gz backend/
scp backend.tar.gz root@your-vps-ip:/var/www/

# On VPS, extract
cd /var/www
tar -xzf backend.tar.gz
mv backend elearning-backend
```

## 🔐 Step 7: Configure Environment Variables

```bash
cd /var/www/elearning-backend/backend

# Create .env file
nano .env
```

Add the following configuration (adjust values according to your setup):

```env
# Server Configuration
NODE_ENV=production
PORT=5001

# Database Configuration
DATABASE_URL=postgresql://elearning_user:your_secure_password_here@localhost:5432/elearning_db
DB_POOL_MAX=10
DB_POOL_MIN=2

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration (Gmail example)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Frontend URL
FRONTEND_URL=https://yourdomain.com

# Admin Configuration (for initial admin creation)
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-admin-password

# VAPID Keys for Push Notifications (generate using: node src/utils/generateVapidKeys.js)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email@yourdomain.com
```

**Important Notes:**
- Generate strong secrets: `openssl rand -base64 32`
- For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833)
- Update `FRONTEND_URL` with your actual frontend domain
- Generate VAPID keys: `node src/utils/generateVapidKeys.js`

## 📦 Step 8: Install Dependencies

```bash
cd /var/www/elearning-backend/backend
npm install --production
```

## 🗄️ Step 9: Setup Database Schema

```bash
# Run database schema
psql -U elearning_user -d elearning_db -f schema.sql

# Or if you need to run migrations
# npm run db:migrate
```

## 👤 Step 10: Create Admin User

```bash
# Create initial admin user
npm run create-admin
```

## 🔄 Step 11: Install PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start application with PM2
cd /var/www/elearning-backend/backend
pm2 start server.js --name elearning-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Follow the instructions shown by the command above
```

## 🌐 Step 12: Install and Configure Nginx

```bash
# Install Nginx
apt install -y nginx

# Create Nginx configuration
nano /etc/nginx/sites-available/elearning-backend
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;  # Change to your API subdomain

    # Increase body size for file uploads
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
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Serve uploaded files directly
    location /uploads {
        alias /var/www/elearning-backend/backend/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:

```bash
# Create symbolic link
ln -s /etc/nginx/sites-available/elearning-backend /etc/nginx/sites-enabled/

# Remove default site (optional)
rm /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx
```

## 🔒 Step 13: Setup SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
certbot --nginx -d api.yourdomain.com

# Certbot will automatically configure Nginx
# Certificates auto-renew via cron job
```

## 📁 Step 14: Setup File Uploads Directory

```bash
# Create uploads directory
mkdir -p /var/www/elearning-backend/backend/uploads/images
mkdir -p /var/www/elearning-backend/backend/uploads/documents
mkdir -p /var/www/elearning-backend/backend/uploads/blog

# Set proper permissions
chmod -R 755 /var/www/elearning-backend/backend/uploads
```

## 🔥 Step 15: Configure Firewall

```bash
# Install UFW (Uncomplicated Firewall)
apt install -y ufw

# Allow SSH
ufw allow 22/tcp

# Allow HTTP and HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Enable firewall
ufw enable

# Check status
ufw status
```

## ✅ Step 16: Verify Deployment

```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs elearning-backend

# Check Nginx status
systemctl status nginx

# Test API endpoint
curl http://localhost:5001/health
```

## 🔄 Step 17: PM2 Management Commands

```bash
# View logs
pm2 logs elearning-backend

# Restart application
pm2 restart elearning-backend

# Stop application
pm2 stop elearning-backend

# View application info
pm2 info elearning-backend

# Monitor resources
pm2 monit
```

## 📝 Step 18: Update Nginx Config for SSL (After Certbot)

Your Nginx config will be automatically updated by Certbot. It should look like:

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # ... rest of configuration
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## 🐛 Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs elearning-backend --lines 50

# Check if port is in use
netstat -tulpn | grep 5001

# Check environment variables
pm2 env 0
```

### Database connection issues
```bash
# Test PostgreSQL connection
psql -U elearning_user -d elearning_db -h localhost

# Check PostgreSQL status
systemctl status postgresql

# Check PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log
```

### Nginx issues
```bash
# Test configuration
nginx -t

# Check Nginx logs
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log

# Restart Nginx
systemctl restart nginx
```

### File upload issues
```bash
# Check directory permissions
ls -la /var/www/elearning-backend/backend/uploads

# Fix permissions if needed
chmod -R 755 /var/www/elearning-backend/backend/uploads
chown -R www-data:www-data /var/www/elearning-backend/backend/uploads
```

## 🔄 Updating the Application

```bash
# Navigate to application directory
cd /var/www/elearning-backend/backend

# Pull latest changes (if using Git)
git pull origin main

# Install new dependencies
npm install --production

# Run database migrations (if any)
# psql -U elearning_user -d elearning_db -f schema.sql

# Restart application
pm2 restart elearning-backend

# Check logs
pm2 logs elearning-backend
```

## 📊 Monitoring

### PM2 Monitoring
```bash
# Install PM2 monitoring module
pm2 install pm2-logrotate

# View real-time monitoring
pm2 monit
```

### System Resources
```bash
# Check CPU and memory
htop

# Check disk space
df -h

# Check application logs
pm2 logs elearning-backend --lines 100
```

## 🔐 Security Best Practices

1. **Change default passwords** - Use strong, unique passwords
2. **Keep system updated** - Run `apt update && apt upgrade` regularly
3. **Use SSH keys** - Disable password authentication for SSH
4. **Regular backups** - Backup database and uploads directory
5. **Monitor logs** - Regularly check application and system logs
6. **Firewall** - Only open necessary ports
7. **SSL/TLS** - Always use HTTPS in production

## 📦 Backup Strategy

### Database Backup
```bash
# Create backup
pg_dump -U elearning_user elearning_db > backup_$(date +%Y%m%d).sql

# Restore backup
psql -U elearning_user elearning_db < backup_20231127.sql
```

### Files Backup
```bash
# Backup uploads directory
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz /var/www/elearning-backend/backend/uploads
```

## 🎯 Quick Reference

| Service | Command | Port |
|---------|---------|------|
| Node.js App | `pm2 restart elearning-backend` | 5001 |
| PostgreSQL | `systemctl restart postgresql` | 5432 |
| Nginx | `systemctl restart nginx` | 80, 443 |
| PM2 Logs | `pm2 logs elearning-backend` | - |
| Nginx Logs | `tail -f /var/log/nginx/error.log` | - |

## 📞 Support

If you encounter issues:
1. Check application logs: `pm2 logs elearning-backend`
2. Check Nginx logs: `tail -f /var/log/nginx/error.log`
3. Check system resources: `htop`
4. Verify environment variables: `pm2 env 0`

---

**Deployment completed!** Your backend should now be accessible at `https://api.yourdomain.com`

