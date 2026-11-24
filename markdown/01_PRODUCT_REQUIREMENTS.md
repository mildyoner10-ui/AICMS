# Product Requirements Document (PRD)

## 1. Ringkasan Produk

AICMS (AI Change Management System) adalah aplikasi web untuk mengelola Request for Change (RFC) pada infrastruktur IT. Aplikasi menyediakan proses digital dari pengajuan, upload dokumen, pemeriksaan kelengkapan, AI-assisted technical review, risk assessment, approval berjenjang, penjadwalan, implementasi, hingga post-implementation review.

AI berperan sebagai technical assistant/reviewer. AI tidak memiliki kewenangan menyetujui atau mengeksekusi perubahan.

## 2. Masalah yang Diselesaikan

- Pengajuan change dan dokumen tersebar di email, spreadsheet, dan folder.
- Kelengkapan dokumen sering diperiksa manual dan tidak konsisten.
- Reviewer harus membaca konfigurasi dan MOP secara manual.
- Risiko perubahan dan dampak layanan tidak selalu terdokumentasi.
- Approval sulit dilacak dan rawan melewati SLA.
- Audit trail dan histori perubahan sulit dikonsolidasikan.

## 3. Tujuan

1. Menstandarkan proses RFC.
2. Memusatkan dokumen dan versioning.
3. Mempercepat pemeriksaan awal dengan AI.
4. Meningkatkan konsistensi risk assessment.
5. Menerapkan approval sesuai kewenangan dan separation of duties.
6. Menyediakan audit trail end-to-end.
7. Menyediakan dasar integrasi inventory dan monitoring pada fase lanjutan.

## 4. Non-Goals MVP

- Menjalankan konfigurasi langsung ke router, switch, firewall, F5, atau perangkat lain.
- Menggantikan keputusan approver/CAB.
- Menjamin seluruh konfigurasi vendor dapat dipahami AI.
- Menggantikan CMDB/NetBox sebagai source of truth.
- Melakukan autonomous remediation.
- Menggunakan data produksi untuk training model.

## 5. Persona dan Role

| Persona | Kebutuhan |
|---|---|
| Requester | Membuat RFC, upload dokumen, memantau status |
| Engineer | Menyiapkan perubahan dan memperbaiki temuan |
| Technical Reviewer | Memeriksa konfigurasi, dampak, dan hasil AI |
| Manager | Menilai kebutuhan dan risiko serta memberi approval |
| Change Manager | Mengelola proses, jadwal, dan kepatuhan |
| CAB Member | Menilai change yang memerlukan CAB |
| Final Approver | Memberi persetujuan akhir sesuai delegasi |
| Auditor | Melihat histori dan bukti tanpa mengubah data |
| Administrator | Mengelola user, role, workflow, dan konfigurasi sistem |
| AI/Rule Administrator | Mengelola rule, baseline, dan versi prompt/model |

## 6. Jenis Change

- Standard: perubahan berulang dengan prosedur yang telah disetujui dan memenuhi kriteria standard change.
- Normal: perubahan yang memerlukan penilaian dan approval normal.
- Emergency: perubahan mendesak dengan jalur emergency approval dan retrospective review.

Jenis change tidak otomatis menentukan risikonya. Risk score, hard blocker, dan matriks kewenangan tetap berlaku.

## 7. Functional Requirements

### FR-01 Authentication & Authorization
- Login/logout.
- OIDC/SSO-ready.
- RBAC.
- Pengelolaan role dan assignment.
- Session expiry dan access denial untuk role tidak berwenang.

### FR-02 Change Request
- Create, edit draft, submit, view, search, filter, dan cancel RFC.
- Generate Change ID unik, contoh `CHG-2026-000001`.
- Field: title, description, category, type, justification, affected service, affected device, environment, implementation window, impact, implementation plan, test plan, rollback plan, communication plan.
- Simpan requester dan timestamps.
- Setelah submit, perubahan isi penting harus melalui revision/version baru.

### FR-03 Document Management
- Upload PDF, DOCX, XLSX, TXT, CFG, YAML, JSON, dan PNG/JPG sesuai batas ukuran.
- Simpan metadata, ukuran, MIME type, checksum SHA-256, uploader, waktu, versi, dan relasi RFC.
- Download hanya bagi user berwenang.
- Virus/malware scanning sebelum file diproses.
- File asli tidak ditimpa; upload ulang membuat versi baru.
- Ekstraksi teks dan OCR bila dibutuhkan.
- File gagal diproses diberi status yang eksplisit.

### FR-04 AI Review
- Review dijalankan asynchronous.
- Tampilkan status queued/running/completed/failed.
- Review terikat pada snapshot versi RFC dan dokumen.
- Hasil mencakup summary, checklist, findings, severity, evidence, confidence, limitations, dan recommendation.
- Temuan harus dapat ditelusuri ke file dan page/line/section bila tersedia.
- AI tidak boleh mengubah file sumber.
- User dapat meminta review ulang setelah revisi.

### FR-05 Risk Assessment
- Risk score 0–100 dengan faktor dan bobot yang dapat dikonfigurasi.
- Pisahkan inherent risk dan residual risk bila data mitigasi tersedia.
- Hard blocker mengalahkan skor agregat.
- Simpan versi formula dan input penilaian.
- Skor bukan keputusan approval.

### FR-06 Approval Workflow
- Workflow configurable berdasarkan jenis change, kategori, risiko, lingkungan, dan aturan organisasi.
- Sequential dan parallel approval.
- Approve, reject, request revision, delegate (jika diizinkan), dan comment.
- Approval wajib mencatat actor, role, timestamp, decision, comment, dan workflow step.
- Requester tidak boleh menyetujui change sendiri jika separation of duties aktif.
- Approval hanya berlaku untuk snapshot yang disetujui. Perubahan material membatalkan approval terkait dan memerlukan review ulang.
- Emergency workflow dan retrospective review.

### FR-07 Change Calendar
- Tampilan kalender/list.
- Filter tanggal, kategori, status, environment, dan owner.
- Deteksi jadwal bentrok berdasarkan affected service/device bila data tersedia.
- Tidak mengklaim konflik jika dependency data belum tersedia.

### FR-08 Implementation & PIR
- Catat actual start/end, implementer, execution notes, evidence, outcome.
- Outcome: successful, successful_with_deviation, failed, rolled_back.
- Post-check dan service validation.
- PIR dan closure approval bila diwajibkan.

### FR-09 Dashboard & Reporting
- Total RFC per status.
- Pending approval dan aging.
- Change per risk/category/type.
- Upcoming changes.
- AI review findings.
- Success/failure/rollback rate.
- Approval lead time dan SLA.
- Export CSV/PDF pada fase yang ditentukan.

### FR-10 Audit
- Audit event append-only untuk create/update/submit/upload/download/review/decision/status change/config change.
- Catat actor, action, object, timestamp, request/correlation ID, dan metadata relevan.
- Audit log tidak dapat diedit oleh user aplikasi biasa.

## 8. AI Review Checks

1. Document completeness.
2. Configuration syntax/parse validation.
3. Before-vs-after configuration diff.
4. Baseline and policy compliance.
5. Security checks.
6. Service/technical impact review.
7. Rollback readiness.
8. Test and validation plan quality.
9. AI summary and recommendation.

Setiap pemeriksaan wajib memiliki status `PASS`, `WARN`, `FAIL`, atau `NOT_ASSESSED`.

## 9. Recommendation States

- `RECOMMEND_APPROVE`
- `RECOMMEND_APPROVE_WITH_CONDITIONS`
- `REQUEST_REVISION`
- `NOT_RECOMMENDED`
- `INSUFFICIENT_EVIDENCE`

Recommendation tidak sama dengan approval decision.

## 10. Non-Functional Requirements

- Responsive desktop-first web UI.
- API p95 target awal < 800 ms untuk operasi CRUD normal, tidak termasuk job AI/file processing.
- AI review diproses background; UI menampilkan progress.
- Availability target ditetapkan bersama pemilik layanan.
- Encryption in transit dan at rest.
- Backup dan restore teruji.
- Observability: structured logs, metrics, tracing/correlation ID.
- Configurable file size, retention, and timeout.
- Accessibility dasar: keyboard navigation, labels, contrast.
- Idempotency untuk endpoint submit/review/approval yang relevan.

## 11. Acceptance Criteria Tingkat Produk

- RFC dapat dibuat, disimpan, disubmit, dan dicari.
- Dokumen dapat diunggah dengan checksum dan versioning.
- AI review menghasilkan hasil terstruktur atau status failure yang jelas.
- Temuan memiliki evidence dan limitation.
- Workflow mencegah approval oleh role yang tidak berwenang.
- Perubahan material pada RFC/dokumen membuat hasil review/approval lama menjadi stale.
- Audit trail lengkap.
- Change hanya dapat masuk execution-ready setelah seluruh gate wajib terpenuhi.
