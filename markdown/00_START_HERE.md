# AICMS – Vibe Coding Starter Pack

**AI Change Management System**  
Dokumen acuan untuk membangun aplikasi web Change Management dengan approval berjenjang dan AI-assisted document/configuration verification.

## Cara menggunakan paket ini

1. Baca `01_PRODUCT_REQUIREMENTS.md` sebagai sumber kebutuhan produk.
2. Gunakan `02_SYSTEM_ARCHITECTURE.md` untuk menentukan struktur aplikasi dan batas tanggung jawab setiap komponen.
3. Ikuti `03_DATABASE_DESIGN.md` saat membuat skema database dan migration.
4. Ikuti `04_API_SPECIFICATION.md` untuk kontrak API.
5. Gunakan `05_AI_REVIEW_FRAMEWORK.md` untuk membangun pipeline pemeriksaan AI.
6. Gunakan `06_WORKFLOW_AND_APPROVAL.md` untuk status lifecycle, routing, dan aturan approval.
7. Gunakan `07_UI_UX_SPECIFICATION.md` untuk halaman dan interaksi frontend.
8. Gunakan `08_BACKLOG_AND_ACCEPTANCE_CRITERIA.md` untuk memecah pekerjaan menjadi sprint/tiket.
9. Gunakan `09_SECURITY_AND_GOVERNANCE.md` sebelum menghubungkan data/config produksi.
10. Gunakan `10_TEST_STRATEGY.md` untuk pengujian.
11. Salin `11_VIBE_CODING_MASTER_PROMPT.md` ke coding agent sebagai instruksi awal.

## Prinsip implementasi

- Mulai dari MVP yang berjalan end-to-end, bukan membangun semua integrasi sekaligus.
- AI hanya memberi rekomendasi; keputusan approval tetap dilakukan manusia.
- Tidak ada eksekusi konfigurasi ke perangkat pada MVP.
- Gunakan synthetic/sample configuration untuk pengembangan dan demo.
- Semua keputusan, perubahan dokumen, hasil AI, dan approval harus memiliki audit trail.
- Validasi deterministik (schema, parser, rules) harus dipisahkan dari opini/generasi LLM.
- Jangan menganggap konfigurasi yang tidak dikenali parser sebagai valid; tandai sebagai `NOT_ASSESSED`.

## Default stack yang disarankan

- Frontend: Next.js + TypeScript
- Backend: Python FastAPI
- Database: PostgreSQL
- ORM/migrations: SQLAlchemy + Alembic
- Background jobs: Celery/RQ + Redis (atau task queue setara)
- File storage: S3-compatible object storage / MinIO
- Authentication: OIDC/SSO-ready; local auth hanya untuk development
- AI provider: adapter interface agar provider dapat diganti
- Container: Docker Compose untuk local development

## Definition of MVP

MVP dianggap selesai jika user dapat:
1. Login dan mendapatkan role.
2. Membuat RFC dan mengisi field wajib.
3. Mengunggah dokumen dan melihat versi/hash.
4. Menjalankan AI review secara asynchronous.
5. Melihat findings dengan evidence dan status pemeriksaan.
6. Mengirim change ke approval workflow.
7. Melakukan approve/reject/request revision sesuai kewenangan.
8. Melihat status, riwayat, audit trail, dan dashboard.
9. Menutup change dengan implementation result dan post-implementation review.

## Catatan

Dokumen ini adalah baseline rancangan. Nama role, matriks approval, retention, risk thresholds, dan security baseline perlu dikonfirmasi oleh pemilik proses organisasi sebelum production.
