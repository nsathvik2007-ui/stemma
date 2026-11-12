# gunicorn settings for Stemma, started by deploy/stemma.service from backend/.

# Loopback only: Caddy is the one thing allowed to reach the app. Django trusts
# Caddy's X-Forwarded-Proto header (SECURE_PROXY_SSL_HEADER), which is only safe
# while nothing else can connect here.
bind = "127.0.0.1:8000"

# Each worker is a full copy of the app. Two fit comfortably on a 1 GB server
# alongside the database; raise this on a bigger machine.
workers = 2

# The bulk AI review calls Groq once per flagged pair, synchronously, so one
# request can take well past gunicorn's 30-second default.
timeout = 120

accesslog = "-"
errorlog = "-"
