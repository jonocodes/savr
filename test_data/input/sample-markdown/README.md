# StashCast Deployment Guide

## Deploying with cPanel

cPanel provides a "Setup Python App" interface that makes deployment simpler. Here's how to deploy StashCast on cPanel:

### Step 1: Create Python Application in cPanel

1. **Log into cPanel** and find "Setup Python App" (under Software section)

2. **Create a new application:**
   - Python version: 3.13 (or highest available, minimum 3.11)
   - Application root: `/home/username/stashcast` (or your preferred path)
   - Application URL: Choose your domain/subdomain
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`

3. **Click "Create"** - cPanel will create a virtual environment automatically

### Step 2: Upload and Install Application

1. **Upload the application:**
   - Use File Manager or FTP to upload all StashCast files to the Application root directory
   - Or use Git if available: `git clone https://github.com/yourusername/stashcast.git`

2. **Enter the virtual environment** (in cPanel Terminal or SSH):
   ```bash
   cd ~/stashcast
   source /home/username/virtualenv/stashcast/3.13/bin/activate  # Path shown in cPanel
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Install system dependencies:**
   - Contact your hosting provider to ensure `yt-dlp` and `ffmpeg` are installed system-wide
   - Or install in your home directory if you have SSH access:
   ```bash
   # Install yt-dlp in user space
   pip install yt-dlp

   # For ffmpeg, you may need to contact support or use a static build
   ```

### Step 3: Configure Environment Variables

1. **In cPanel Python App interface**, click "Edit" on your application

2. **Add environment variables** in the "Environment variables" section:
   ```
   DJANGO_SECRET_KEY=your-secret-key-here
   STASHCAST_USER_TOKEN=your-user-token-here
   STASHCAST_DATA_DIR=/home/username/stashcast_data
   DEBUG=False
   ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
   ```

3. **Save changes** and restart the application

### Step 4: Set Up the Database

In cPanel Terminal or SSH:

```bash
cd ~/stashcast
source /home/username/virtualenv/stashcast/3.13/bin/activate

# Create data directory
mkdir -p ~/stashcast_data/media

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Collect static files
python manage.py collectstatic --noinput
```

### Step 5: Configure Static and Media Files

1. **In cPanel Python App**, the static files should be automatically served if collected to `staticfiles/`

2. **For media files**, you may need to create a symlink or configure Apache:

   Option A: Create symlink in public_html (if using subdomain):
   ```bash
   cd ~/public_html/stashcast  # or your subdomain directory
   ln -s ~/stashcast/staticfiles static
   ln -s ~/stashcast_data/media media
   ```

   Option B: Use .htaccess (in public_html or subdomain root):
   ```apache
   # Serve static files
   Alias /static /home/username/stashcast/staticfiles
   <Directory /home/username/stashcast/staticfiles>
       Require all granted
   </Directory>

   # Serve media files
   Alias /media/files /home/username/stashcast_data/media
   <Directory /home/username/stashcast_data/media>
       Require all granted
   </Directory>
   ```

### Step 6: Set Up Background Worker (Huey)

**IMPORTANT:** Background tasks require a separate process. Contact your hosting provider about:

1. **Cron jobs** - Can run Huey worker via cron (less ideal):
   ```bash
   # Add to crontab (cPanel > Cron Jobs)
   # Run every minute
   * * * * * cd ~/stashcast && source /home/username/virtualenv/stashcast/3.13/bin/activate && python manage.py run_huey --no-periodic >> ~/huey.log 2>&1
   ```

2. **Background process** - Some cPanel hosts allow persistent processes:
   - Contact support to enable
   - May require VPS or dedicated server
   - Alternative: Use Django Q or Celery with Redis if available

3. **Limitations:** If background workers aren't available:
   - Media processing won't happen automatically
   - You can manually process items using: `./manage.py stash <url>` via SSH
   - Consider upgrading to VPS for full functionality

### Step 7: Restart the Application

In cPanel Python App interface:
- Click "Restart" button
- Or use command: `touch /home/username/stashcast/tmp/restart.txt`

### Troubleshooting cPanel Deployment

1. **Application won't start:**
   - Check error logs in cPanel > Python App > "View log"
   - Verify all environment variables are set
   - Ensure `passenger_wsgi.py` is in the application root

2. **Static files not loading:**
   - Run `python manage.py collectstatic --noinput`
   - Check file permissions: `chmod -R 755 ~/stashcast/staticfiles`
   - Verify symlinks or .htaccess configuration

3. **Media files not serving:**
   - Check STASHCAST_DATA_DIR path is correct
   - Verify directory permissions: `chmod -R 755 ~/stashcast_data`
   - Ensure web server can read the directory

4. **Background tasks not working:**
   - Check if Huey worker is running (cron or persistent process)
   - View Huey logs: `tail -f ~/huey.log`
   - May need to contact hosting provider for support

5. **Permission errors:**
   - Ensure application files are owned by your user
   - Check that data directory is writable
   - Fix permissions: `chmod -R 755 ~/stashcast`

### cPanel Production Checklist

- [ ] Python app created in cPanel
- [ ] All dependencies installed (`requirements.txt`)
- [ ] Environment variables configured
- [ ] Database migrations run (`migrate`)
- [ ] Superuser created (`createsuperuser`)
- [ ] Static files collected (`collectstatic`)
- [ ] Static files accessible via web
- [ ] Media files accessible via web
- [ ] Background worker configured (cron or persistent)
- [ ] Application restarted
- [ ] HTTPS enabled (SSL certificate in cPanel)
- [ ] Backups configured

### cPanel Limitations

cPanel shared hosting has some limitations:

1. **Background workers** may not be fully supported
2. **System commands** (yt-dlp, ffmpeg) may need provider installation
3. **Resource limits** (CPU, memory) may affect large media files
4. **Process restrictions** may limit concurrent downloads

**Recommendation:** For full StashCast functionality, consider:
- VPS or dedicated server
- Cloud hosting (DigitalOcean, Linode, AWS)
- PaaS platforms that support background workers

---

## Deploying with Passenger (Apache/Nginx)

### Prerequisites

- Python 3.13+
- Passenger (mod_passenger for Apache or Passenger for Nginx)
- yt-dlp installed system-wide
- ffmpeg installed system-wide
- Access to your web server configuration

### Step 1: Prepare the Application

1. **Clone the repository to your server:**
   ```bash
   cd /var/www/
   git clone https://github.com/yourusername/stashcast.git
   cd stashcast
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and set:
   # - STASHCAST_DATA_DIR (e.g., /var/www/stashcast/data)
   # - STASHCAST_USER_TOKEN (generate a secure random key)
   # - DJANGO_SECRET_KEY (generate a secure random key)
   # - DEBUG=False
   # - ALLOWED_HOSTS (your domain name)
   ```

5. **Run database migrations:**
   ```bash
   ./manage.py migrate
   ```

6. **Create a superuser:**
   ```bash
   ./manage.py createsuperuser
   ```

7. **Collect static files:**
   ```bash
   ./manage.py collectstatic --noinput
   ```
   This creates a `staticfiles/` directory with all static assets.

### Step 2: Configure Apache with Passenger

Create an Apache virtual host configuration (e.g., `/etc/apache2/sites-available/stashcast.conf`):

```apache
<VirtualHost *:80>
    ServerName stashcast.example.com
    DocumentRoot /var/www/stashcast/public

    # Point Passenger to the WSGI file
    PassengerPython /var/www/stashcast/venv/bin/python
    PassengerAppRoot /var/www/stashcast

    # Serve static files directly (bypass Django)
    Alias /static /var/www/stashcast/staticfiles
    <Directory /var/www/stashcast/staticfiles>
        Require all granted
    </Directory>

    # Serve media files directly (bypass Django)
    Alias /media/files /var/www/stashcast/data/media
    <Directory /var/www/stashcast/data/media>
        Require all granted
    </Directory>

    # All other requests go through the WSGI application
    <Directory /var/www/stashcast>
        Require all granted
        Options -MultiViews
        AllowOverride None
    </Directory>

    # Environment variables
    SetEnv DJANGO_SETTINGS_MODULE stashcast.settings

    # Load environment variables from .env file
    # Note: You may need to set these explicitly or use PassengerEnvVar
    # PassengerEnvVar STASHCAST_USER_TOKEN "your-user-token-here"
    # PassengerEnvVar STASHCAST_DATA_DIR "/var/www/stashcast/data"

    # Error and access logs
    ErrorLog ${APACHE_LOG_DIR}/stashcast-error.log
    CustomLog ${APACHE_LOG_DIR}/stashcast-access.log combined
</VirtualHost>
```

Enable the site:
```bash
sudo a2ensite stashcast
sudo systemctl reload apache2
```

### Step 3: Configure Nginx with Passenger (Alternative)

If using Nginx, create a server block (e.g., `/etc/nginx/sites-available/stashcast`):

```nginx
server {
    listen 80;
    server_name stashcast.example.com;

    root /var/www/stashcast/public;

    # Passenger configuration
    passenger_enabled on;
    passenger_python /var/www/stashcast/venv/bin/python;
    passenger_app_root /var/www/stashcast;
    passenger_startup_file passenger_wsgi.py;
    passenger_app_type wsgi;

    # Environment variables
    passenger_env_var DJANGO_SETTINGS_MODULE stashcast.settings;
    # passenger_env_var STASHCAST_USER_TOKEN "your-user-token-here";
    # passenger_env_var STASHCAST_DATA_DIR "/var/www/stashcast/data";

    # Serve static files directly
    location /static/ {
        alias /var/www/stashcast/staticfiles/;
        expires 30d;
        access_log off;
    }

    # Serve media files directly
    location /media/files/ {
        alias /var/www/stashcast/data/media/;
        expires 7d;
    }

    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/stashcast /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 4: Set Up the Huey Worker

The Huey worker processes background tasks (downloads, transcoding, etc.) and must run separately from the web application.

Create a systemd service file `/etc/systemd/system/stashcast-huey.service`:

```ini
[Unit]
Description=StashCast Huey Worker
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/stashcast
Environment="PATH=/var/www/stashcast/venv/bin"
EnvironmentFile=/var/www/stashcast/.env
ExecStart=/var/www/stashcast/venv/bin/python /var/www/stashcast/manage.py run_huey
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the worker:
```bash
sudo systemctl daemon-reload
sudo systemctl enable stashcast-huey
sudo systemctl start stashcast-huey
sudo systemctl status stashcast-huey
```

### Step 5: Set File Permissions

```bash
# Make sure the web server can write to the data directory
sudo chown -R www-data:www-data /var/www/stashcast/data
sudo chmod -R 755 /var/www/stashcast/data

# Make sure the application files are readable
sudo chown -R www-data:www-data /var/www/stashcast
```

### Step 6: Enable HTTPS (Recommended)

Use Let's Encrypt with certbot:

```bash
sudo apt install certbot python3-certbot-apache  # For Apache
# OR
sudo apt install certbot python3-certbot-nginx   # For Nginx

# Generate certificate
sudo certbot --apache -d stashcast.example.com   # For Apache
# OR
sudo certbot --nginx -d stashcast.example.com    # For Nginx
```

### Troubleshooting

1. **Static files not loading:**
   - Verify `./manage.py collectstatic` was run
   - Check Apache/Nginx configuration for the `/static` alias
   - Check file permissions on `staticfiles/` directory

2. **Application errors:**
   - Check logs: `sudo tail -f /var/log/apache2/stashcast-error.log`
   - Or for Nginx: `sudo tail -f /var/log/nginx/error.log`
   - Check Passenger logs: `sudo passenger-status`

3. **Background tasks not running:**
   - Check Huey worker status: `sudo systemctl status stashcast-huey`
   - Check worker logs: `sudo journalctl -u stashcast-huey -f`

4. **Permission denied errors:**
   - Ensure www-data user can write to `STASHCAST_DATA_DIR`
   - Check file ownership and permissions

### Maintenance

- **Update the application:**
  ```bash
  cd /var/www/stashcast
  git pull
  source venv/bin/activate
  pip install -r requirements.txt
  ./manage.py migrate
  ./manage.py collectstatic --noinput
  sudo systemctl restart stashcast-huey
  sudo passenger-config restart-app /var/www/stashcast
  ```

- **View logs:**
  ```bash
  # Application logs
  sudo tail -f /var/log/apache2/stashcast-error.log

  # Huey worker logs
  sudo journalctl -u stashcast-huey -f
  ```

### Production Checklist

- [ ] `DEBUG=False` in settings
- [ ] `ALLOWED_HOSTS` configured
- [ ] `DJANGO_SECRET_KEY` set to a secure random value
- [ ] `STASHCAST_USER_TOKEN` set to a secure random value
- [ ] HTTPS enabled
- [ ] Static files collected and served by web server
- [ ] Media files directory writable by web server
- [ ] Huey worker service running
- [ ] Database backed up regularly
- [ ] Log rotation configured
