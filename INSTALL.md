# AICMS — Langkah Instalasi di Server Baru

## 1. Requirements

- Ubuntu 20.04/22.04/24.04
- Docker 24+
- Docker Compose Plugin
- Git
- RAM minimal 2 GB
- Port tersedia: `3000` (web), `8000` (api)

## 2. Install Docker (jika belum)

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

## 3. Clone & Start

```bash
git clone https://github.com/mildyoner10-ui/AICMS.git
cd AICMS
sudo docker compose up -d --build
```

Tunggu 1–2 menit sampai semua container healthy:

```bash
sudo docker compose ps
```

Harus tampil `Up` untuk semua: `postgres`, `redis`, `api`, `worker`, `web`.

## 4. Verifikasi

Cek API:
```bash
curl http://localhost:8000/api/v1/health
# Response: {"status":"ok","version":"0.1.0"}
```

Cek seed user:
```bash
sudo docker compose logs api 2>&1 | grep "Seed"
# Harus ada: "Seed completed successfully."
```

## 5. Verifikasi Skema Database

```bash
sudo docker compose exec api alembic current
# Harus: (head)

sudo docker compose exec postgres psql -U aicms -d aicms -c \
  "SELECT n.nspname,t.typname,string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'changecategory%' GROUP BY n.nspname,t.typname;"
```

Harus keluar **satu** baris:

```
 public | changecategory | HEAD_OFFICE,CHANNEL,BRANCH_OFFICE,OTHER
```

Kaluar `changecategory_v2` atau error `type "changecategory" does not exist` → jalankan repair:

```bash
sudo docker compose exec api alembic upgrade head
```

## 6. Login

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

## 7. Masalah Umum

### Error `type "changecategory" does not exist`

Enum type name tidak cocok dengan model. Coba repair dulu (tanpa hapus data):

```bash
sudo docker compose exec api alembic upgrade head
```

Kalau masih error, cek migration:

```bash
sudo docker compose exec api alembic current
# Harus: e5f6a7b8c9d0 (head)
```

Kalau bukan head, reset database (data akan hilang):

```bash
sudo docker compose down
sudo docker volume rm AICMS_pgdata
sudo docker compose up -d --build
```

### Container restart terus

```bash
sudo docker compose logs api --tail=50
```

Cek error di log. Biasanya koneksi DB atau Redis.

### AI review tidak jalan (queue)

Pasti worker berjalan:

```bash
sudo docker compose ps | grep worker
# Harus ada: Up
```

## 7. Port & Firewall

| Service | Port | Akses |
|---|---|---|
| Web (Next.js) | 3000 | Browser |
| API (FastAPI) | 8000 | Internal (tidak perlu dibuka) |
| Postgres | 15432 | Internal (tidak perlu dibuka) |
| Redis | 16001 | Internal (tidak perlu dibuka) |

Buka port `3000` di firewall:

```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

## 8. Akses dari Komputer Lain

Buka `http://<IP-SERVER-UBUNTU>:3000`

Pastikan firewall server mengizinkan:

```bash
sudo ufw allow 3000/tcp
sudo ufw status verbose
```

## 9. Produksi

Untuk produksi, edit `.env` atau environment di `docker-compose.yml`:

- `JWT_SECRET` → ganti dengan secret kuat
- `AI_PROVIDER` → `mock` (tanpa API key) atau provider sebenarnya
- `ALLOW_LOCAL_LOGIN` → `false` (matikan local login)
- `STORAGE_BACKEND` → `s3` jika pakai S3/MinIO
