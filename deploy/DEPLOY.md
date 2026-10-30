# Deploying SHAI with Docker

Two ways to run the same containers:

| | Command | Use for |
|---|---|---|
| **Local / on-premise** | `docker compose up -d --build` | a laptop, a hospital LAN server, a demo |
| **Public server with HTTPS** | `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` | a VPS with a domain name |

The stack is three containers (Postgres, the FastAPI backend, the Next.js frontend). In the
public setup a fourth, Caddy, terminates HTTPS and is the **only** thing exposed to the internet:
the database and the API are not published at all (the browser never talks to the API; the
Next.js server does, over the internal network).

## 1. Secrets (`.env`)

```bash
cp .env.example .env
openssl rand -hex 32        # run three times: API_KEY, SECRET_KEY, POSTGRES_PASSWORD
```

| Variable | What it is |
|---|---|
| `API_KEY` | shared secret between the frontend server and the API |
| `SECRET_KEY` | signs staff session tokens; changing it signs everyone out |
| `POSTGRES_PASSWORD` | database password (required for the public setup) |
| `BOOTSTRAP_ADMIN_EMAIL` / `_PASSWORD` | the first administrator, created once when there are no users. The password needs 10+ characters and **must be changed at first login**. Remove both lines after the first start |
| `DOMAIN` | public hostname (public setup only), e.g. `shai.example.com` |
| `GEMINI_API_KEY` | optional, enables AI-drafted reminders |

`docker compose` refuses to start if `API_KEY` or `SECRET_KEY` is missing, so the stack can never
run with a default secret. **Never commit `.env`.**

## 2. Local / on-premise

```bash
docker compose up -d --build
docker compose logs -f backend          # wait for "Application startup complete"
```
Open http://localhost:3000 and sign in with the bootstrap admin. (If 8000/3000 are taken, set
`BACKEND_PORT` / `FRONTEND_PORT`.) Migrations run automatically on every backend start.

## 3. Public server with HTTPS (VPS)

1. Create a Linux VPS (2 GB RAM is enough to run, but building the frontend needs about 4 GB,
   so add swap or build the images elsewhere and push them to a registry).
2. Install Docker Engine + the compose plugin.
3. Point a DNS **A record** for your domain at the server's IP. Open ports 80 and 443.
4. Copy the repository to the server, create `.env` as above and set `DOMAIN`.
5. Start:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
   Caddy obtains and renews the Let's Encrypt certificate automatically. Sessions use
   `Secure` cookies and HSTS once the site is on HTTPS.

## 4. People and roles

| Role | Can do |
|---|---|
| `front_desk` | appointments, patients, predictions, outreach, waitlist |
| `manager` | + capacity and overbooking, doctor delays, ROI simulator |
| `admin` | + creating and managing staff accounts |

Create accounts (new accounts must change their password at first login):
```bash
docker compose exec backend python create_user.py --email nurse@hospital.org --name "K. Perera" --role front_desk
docker compose exec backend python create_user.py --email nurse@hospital.org --reset-password
docker compose exec backend python create_user.py --email nurse@hospital.org --deactivate
```
An admin can also manage users through the API (`GET/POST /admin/users`, `PATCH /admin/users/{id}`).
Five wrong passwords lock an account for 15 minutes.

## 5. Demo data and real data

```bash
docker compose exec backend python seed_bulk.py --patients 2000    # synthetic demo data only
```
Do not load real patient data until the legal and ethics requirements in
`docs/VALIDATION_ON_LOCAL_DATA.md` are met. The demo dataset is synthetic.

## 6. Operations

```bash
docker compose ps                                   # status
docker compose logs -f backend frontend             # logs
git pull && docker compose up -d --build            # update (migrations run automatically)
docker compose exec db pg_dump -U noshow noshow_db | gzip > backup-$(date +%F).sql.gz    # backup
gunzip -c backup.sql.gz | docker compose exec -T db psql -U noshow noshow_db             # restore
```
Schedule the backup (cron) and copy it off the server. The database lives in the `pgdata`
Docker volume; `docker compose down -v` **deletes it**.

## 7. Hosting on a platform instead of a VPS

The images are standard, so they also run on Render, Railway or Fly.io: deploy `backend/Dockerfile`
with a managed Postgres (`DATABASE_URL`, `API_KEY`, `SECRET_KEY`, `CORS_ORIGINS`; it listens on `$PORT`),
and `frontend/Dockerfile` with `BACKEND_API_URL` (the backend's internal URL), `BACKEND_API_KEY`
(= `API_KEY`) and `SESSION_COOKIE_SECURE=true`. That needs your account on the platform.

## 8. Before real patients

Authentication is now real (hashed passwords, signed expiring sessions, roles, lockout), but a
production hospital deployment still needs: HTTPS only, database backups you have tested restoring,
encryption of backups, an audit log of who viewed what, and approval from the hospital's data
protection owner. See `docs/SYSTEM_OVERVIEW.md` §12.
