# Deploying Stemma

One Ubuntu 24.04 server runs everything: Caddy in front (HTTPS, the built
React app, the admin's static files), gunicorn behind it on `127.0.0.1:8000`,
and the database on the same machine. The app and the API share one domain,
so the browser never makes a cross-origin request.

```
browser ──HTTPS──▶ Caddy ──┬── /api/*, /admin* ──▶ gunicorn :8000 ──▶ Django ──▶ MariaDB/MySQL
                           ├── /static/*        ──▶ backend/staticfiles/
                           └── everything else  ──▶ frontend/dist/ (index.html fallback)
```

## Before you start

- **A server** with a public IP, ports 80 and 443 open. 1 GB of RAM is enough
  (OCR is an API call); add swap, below.
- **A domain** whose A record points at that IP. Caddy can't issue a
  certificate until DNS resolves.
- **The OCR.space API key** (free plan) and the Groq API key.

OCR.space's free plan allows 500 requests a day **per IP address**. Every
student's photo leaves from this server's one IP, so that's 500 photo
submissions a day across the whole site; typed submissions don't count.

### On Oracle Cloud

Two firewalls stand in front of an Oracle instance, and both block web
traffic by default:

1. **The console's security list.** Open the instance's subnet → its
   security list → Add Ingress Rules: source `0.0.0.0/0`, TCP, destination
   ports `80,443`. Also add it to any Network Security Group on the VNIC.
   Until this is done, Caddy's certificate request fails with "Timeout
   during connect (likely firewall problem)".
2. **The Ubuntu image's own iptables**, which rejects everything but SSH.
   Insert the two rules ahead of its REJECT line and save them:

   ```bash
   for port in 80 443; do sudo iptables -I INPUT 5 -p tcp -m state --state NEW --dport $port -j ACCEPT; done
   sudo netfilter-persistent save
   ```

`sudo iptables -L INPUT -v -n` shows packet counts per rule. Zero on ports 80
and 443 means the first firewall is still blocking. On the Micro shape, make
the swap file 2 GB rather than 1.

## 1. Packages

```bash
sudo apt update
sudo apt install -y python3-venv git mariadb-server
```

Django 6.1 needs **MariaDB 10.11+ or MySQL 8.4+**. Ubuntu 24.04's
`mariadb-server` is 10.11, so it qualifies; its `mysql-server` is 8.0, which
Django refuses. Development runs on MySQL; Stemma uses nothing MySQL-specific,
but MariaDB has not been tested with it yet, so run through the app once after
deploying. To stay on MySQL instead, install 8.4 from MySQL's own APT
repository.

Install Caddy from its official repository:
<https://caddyserver.com/docs/install#debian-ubuntu-raspbian>

On a 1 GB server, add swap so a busy moment can't kill the database:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. User, code and photo storage

```bash
sudo useradd --system --home-dir /srv/stemma --shell /usr/sbin/nologin stemma
sudo git clone https://github.com/nsathvik2007-ui/stemma.git /srv/stemma
sudo mkdir -p /var/lib/stemma/media
sudo chown -R stemma:stemma /srv/stemma /var/lib/stemma
sudo chmod 700 /var/lib/stemma/media
```

Photos live outside the checkout, readable only by the `stemma` user — not by
Caddy, which never serves them.

## 3. Python environment

Ubuntu 24.04's Python is 3.12, the minimum Django 6.1 accepts.

```bash
cd /srv/stemma/backend
sudo -u stemma python3 -m venv venv
sudo -u stemma venv/bin/pip install -r requirements.txt
```

## 4. Database

```bash
sudo mariadb
```
```sql
CREATE DATABASE stemma CHARACTER SET utf8mb4;
CREATE USER 'stemma_app'@'localhost' IDENTIFIED BY '<a long random password>';
GRANT ALL PRIVILEGES ON stemma.* TO 'stemma_app'@'localhost';
```

Start from an empty database. The accounts and data on the development
machine are test data and stay there.

## 5. `backend/.env`

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

Then create `/srv/stemma/backend/.env`:

```
DJANGO_SECRET_KEY=<the generated key>
DJANGO_ALLOWED_HOSTS=<your domain>
DJANGO_MEDIA_ROOT=/var/lib/stemma/media
DB_NAME=stemma
DB_USER=stemma_app
DB_PASSWORD=<the database password>
DB_HOST=127.0.0.1
DB_PORT=3306
GROQ_API_KEY=<your Groq key>
OCR_PROVIDER=ocrspace
OCR_SPACE_API_KEY=<your OCR.space key>
```

`OCR_PROVIDER=google` switches back to Google Cloud Vision, if its billing is
ever restored; it then also needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at
the service-account key file.

```bash
sudo chown stemma:stemma /srv/stemma/backend/.env
sudo chmod 600 /srv/stemma/backend/.env
```

**Never set `DJANGO_DEBUG` here.** It defaults to off. With it off, the app
refuses to start on the development secret key.

## 6. Prepare Django

```bash
cd /srv/stemma/backend
sudo -u stemma venv/bin/python manage.py check --deploy   # expect: no issues
sudo -u stemma venv/bin/python manage.py migrate
sudo -u stemma venv/bin/python manage.py createcachetable
sudo -u stemma venv/bin/python manage.py collectstatic --noinput
sudo -u stemma venv/bin/python manage.py createsuperuser
```

`createcachetable` makes the table the sign-in limits are counted in; without
it every sign-in fails with a server error.

Accounts are institution-issued; there is no sign-up page.

- **Teachers:** create them in the admin at `https://<your domain>/admin/`.
  Use the college email as the username **and** fill in the Email field with
  the same address, and set a password.
- **Students:** the teacher adds them from the class's **Roster** tab by
  pasting names and emails. Each new student gets a temporary password,
  shown to the teacher once, and must choose their own at first sign-in. A
  forgotten password is reset from the same tab.

Sign-in limits: 10 wrong passwords for one account locks it for 15 minutes,
and one IP address gets 100 attempts a minute.

## 7. Run gunicorn as a service

```bash
sudo cp /srv/stemma/deploy/stemma.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stemma
systemctl status stemma
```

Errors go to the journal: `journalctl -u stemma -f`.

## 8. The frontend

Build on your own machine, which keeps Node off a small server. A production
build calls the API on its own domain, so no URL needs setting:

```bash
cd frontend && npm ci && npm run build
scp -r dist <you>@<server>:/tmp/stemma-dist
```

On the server:

```bash
sudo rm -rf /srv/stemma/frontend/dist
sudo mv /tmp/stemma-dist /srv/stemma/frontend/dist
sudo chown -R stemma:stemma /srv/stemma/frontend/dist
```

## 9. Caddy

```bash
sudo cp /srv/stemma/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/stemma.example.com/<your domain>/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Open `https://<your domain>`. The first request may take a few seconds while
Caddy fetches the certificate.

## Updating

```bash
cd /srv/stemma
sudo -u stemma git pull
sudo -u stemma backend/venv/bin/pip install -r backend/requirements.txt
cd backend
sudo -u stemma venv/bin/python manage.py migrate
sudo -u stemma venv/bin/python manage.py createcachetable
sudo -u stemma venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart stemma
```

If the frontend changed, rebuild and copy `dist` again (step 8). If the
Caddyfile changed, repeat step 9.

## Backups

Every night at 02:30 (India time), `deploy/backup.sh` saves the database
and the photo folder to `/var/backups/stemma`, readable only by root, and
deletes copies older than 14 days.

```bash
sudo cp /srv/stemma/deploy/stemma-backup.service /srv/stemma/deploy/stemma-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now stemma-backup.timer
sudo systemctl start stemma-backup.service      # run one now
sudo ls -l /var/backups/stemma                  # db-….sql.gz and media-….tar.gz
```

**These copies are on the same disk as the originals.** They cover mistakes
and corruption, not losing the server. Copy them off it as well, for
example to your own machine:

```bash
rsync -a --rsync-path="sudo rsync" <you>@<server>:/var/backups/stemma/ ~/stemma-backups/
```

On MariaDB the dump is a consistent snapshot taken without stopping the app.
On MySQL it briefly blocks writes instead, because MySQL's snapshot needs a
server-wide privilege the app's database user doesn't have.

### Restoring

Stop the app, load the dump, put the photos back, start it again:

```bash
sudo systemctl stop stemma
gunzip -c /var/backups/stemma/db-<date>.sql.gz | sudo mariadb stemma
sudo tar -xzf /var/backups/stemma/media-<date>.tar.gz -C /var/lib/stemma
sudo chown -R stemma:stemma /var/lib/stemma/media
sudo systemctl start stemma
```

Practise this once on a spare database before you need it; a backup that
has never been restored is only a hope.

## Later

- **HSTS** starts at one hour (`DJANGO_HSTS_SECONDS`). Raise it to a year
  once HTTPS has been stable for a while.
