# AICMS — Langkah Instalasi di Server Baru

## 1. Requirements

- Docker 24+
- Docker Compose v2
- Git
- RAM minimal 2 GB
- Port tersedia: `3000` (web), `8000` (api)

## 2. Clone & Start

```powershell
git clone https://github.com/mildyoner10-ui/AICMS.git
cd AICMS
docker compose up -d --build
```

Tunggu 1–2 menit sampai semua container healthy:

```powershell
docker compose ps
```

Harus tampil `Up` untuk semua: `postgres`, `redis`, `api`, `worker`, `web`.

## 3. Verifikasi

Cek API:
```powershell
curl.exe http://localhost:8000/api/v1/health
# Response: {"status":"ok","version":"0.1.0"}
```

Cek seed user:
```powershell
docker compose logs api 2>&1 | Select-String "Seed"
# Harus ada: "Seed completed successfully."
```

## 4. Login

Buka `http://<IP-SERVER>:3000`

Default user:

| Username | Password | Role |
|---|---|---|
| admin | Admin@123 | Administrator |
| requester1 | Request@123 | Requester |
| reviewer1 | Reviewer@123 | Technical Reviewer, Engineer |
| manager1 | Manager@123 | Manager |
| cm1 | CM@123 | Change Manager |
| auditor1 | Auditor@123 | Auditor |

## 5. Masalah Umum

### Login gagal / create CRF error `type "changecategory" does not exist`

Migration enum belum jalan. Reset database:

```powershell
docker compose down
docker volume rm AICMS_pgdata
docker compose up -d --build
```

### Container restart terus

```powershell
docker compose logs api --tail=50
```

Cek error di log. Biasanya koneksi DB atau Redis.

### AI review tidak jalan (queue)

Pasti worker berjalan:

```powershell
docker compose ps | Select-String "worker"
# Harus ada: Up
```

## 6. Port

| Service | Port | Akses |
|---|---|---|
| Web (Next.js) | 3000 | Browser |
| API (FastAPI) | 8000 | Internal (tidak perlu dibuka) |
| Postgres | 15432 | Internal (tidak perlu dibuka) |
| Redis | 16001 | Internal (tidak perlu dibuka) |

Buka port `3000` di firewall server.

## 7. Produksi

Untuk produksi, edit `.env` atau environment di `docker-compose.yml`:

- `JWT_SECRET` → ganti dengan secret kuat
- `AI_PROVIDER` → `mock` (tanpa API key) atau provider sebenarnya
- `ALLOW_LOCAL_LOGIN` → `false` (matikan local login)
- `STORAGE_BACKEND` → `s3` jika pakai S3/MinIO
