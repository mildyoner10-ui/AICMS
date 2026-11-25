"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice, Page, PageHeader } from "@/components/ui";
import { CATEGORY, CHANGE_TYPE, ENVIRONMENT, categoryLabel, changeTypeLabel, environmentLabel } from "@/lib/labels";

const EMPTY = {
  title: "",
  description: "",
  category: "HEAD_OFFICE",
  change_type: "NORMAL",
  environment: "TEST",
  business_justification: "",
  impact_description: "",
  implementation_plan: "",
  test_plan: "",
  rollback_plan: "",
  affected_devices: "",
  affected_services: "",
};

type Form = typeof EMPTY;

const TEXTAREAS = [
  ["business_justification", "Justifikasi bisnis", true, "Mengapa perubahan ini dibutuhkan. Dasar penilaian approver."],
  ["impact_description", "Dampak", false, "Layanan, pengguna, atau jendela operasi yang terdampak."],
  ["implementation_plan", "Rencana implementasi", true, "Langkah eksekusi berurutan. Jangan sertakan kredensial."],
  ["test_plan", "Rencana uji", false, "Pemeriksaan pasca-eksekusi untuk menyatakan perubahan berhasil."],
  ["rollback_plan", "Rencana rollback", true, "Wajib: cara kembali ke kondisi awal bila gagal."],
] as const;

export default function NewChangePage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("token")) router.push("/login");
  }, [router]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/v1/changes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({
          ...form,
          affected_devices: form.affected_devices.split(",").map((s) => s.trim()).filter(Boolean),
          affected_services: form.affected_services.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || "CRF gagal disimpan. Periksa isian lalu coba lagi.");
      router.push(`/changes/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "CRF gagal disimpan. Periksa isian lalu coba lagi.");
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Buat CRF Baru"
        description="Isi informasi teknis yang cukup agar reviewer dan AI dapat menilai risiko dengan bukti. CRF tersimpan sebagai draf."
        back={{ href: "/changes", label: "Permohonan Perubahan" }}
      />

      <Page>
        <form onSubmit={submit} noValidate>
          {error && <Notice kind="danger">{error}</Notice>}

          <div className="d-flex flex-column gap-4">
            <Card title="Ringkasan perubahan" description="Identitas dan klasifikasi CRF">
              <div className="d-flex flex-column gap-3">
                <div>
                  <label htmlFor="title" className="form-label">
                    Judul <span className="text-danger">*</span>
                  </label>
                  <input
                    id="title"
                    required
                    value={form.title}
                    onChange={set("title")}
                    placeholder="Contoh: Upgrade IOS core switch gedung A"
                    className="form-control"
                  />
                </div>

                <div className="row g-3">
                  <div className="col-md-4">
                    <label htmlFor="category" className="form-label">
                      Kategori
                    </label>
                    <select id="category" value={form.category} onChange={set("category")} className="form-select">
                      {Object.keys(CATEGORY).map((o) => (
                        <option key={o} value={o}>
                          {categoryLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="change_type" className="form-label">
                      Tipe perubahan
                    </label>
                    <select id="change_type" value={form.change_type} onChange={set("change_type")} className="form-select">
                      {Object.keys(CHANGE_TYPE).map((o) => (
                        <option key={o} value={o}>
                          {changeTypeLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-4">
                    <label htmlFor="environment" className="form-label">
                      Lingkungan
                    </label>
                    <select id="environment" value={form.environment} onChange={set("environment")} className="form-select">
                      {Object.keys(ENVIRONMENT).map((o) => (
                        <option key={o} value={o}>
                          {environmentLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Detail teknis" description="Semakin lengkap, semakin akurat tinjauan AI dan keputusan approver">
              <div className="d-flex flex-column gap-3">
                {TEXTAREAS.map(([key, label, required, hint]) => (
                  <div key={key}>
                    <label htmlFor={key} className="form-label">
                      {label} {required && <span className="text-danger">*</span>}
                    </label>
                    <textarea
                      id={key}
                      rows={3}
                      required={required}
                      aria-describedby={`${key}-hint`}
                      value={form[key]}
                      onChange={set(key)}
                      className="form-control"
                    />
                    <p id={`${key}-hint`} className="form-text mb-0">
                      {hint}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Cakupan" description="Pisahkan beberapa nilai dengan koma">
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="affected_devices" className="form-label">
                    Perangkat terdampak
                  </label>
                  <input
                    id="affected_devices"
                    value={form.affected_devices}
                    onChange={set("affected_devices")}
                    placeholder="core-sw-01, fw-edge-02"
                    className="form-control font-monospace"
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="affected_services" className="form-label">
                    Layanan terdampak
                  </label>
                  <input
                    id="affected_services"
                    value={form.affected_services}
                    onChange={set("affected_services")}
                    placeholder="VPN kantor pusat, e-mail"
                    className="form-control"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div className="d-flex flex-wrap justify-content-end gap-3 mt-4">
            <button type="button" onClick={() => router.push("/changes")} className="btn btn-secondary">
              Batal
            </button>
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? "Menyimpan…" : "Simpan sebagai Draft"}
            </button>
          </div>
        </form>
      </Page>
    </>
  );
}
