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

          <div className="space-y-6">
            <Card title="Ringkasan perubahan" description="Identitas dan klasifikasi CRF">
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="label">
                    Judul <span className="text-danger">*</span>
                  </label>
                  <input
                    id="title"
                    required
                    value={form.title}
                    onChange={set("title")}
                    placeholder="Contoh: Upgrade IOS core switch gedung A"
                    className="field"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <label htmlFor="category" className="label">
                      Kategori
                    </label>
                    <select id="category" value={form.category} onChange={set("category")} className="field">
                      {Object.keys(CATEGORY).map((o) => (
                        <option key={o} value={o}>
                          {categoryLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="change_type" className="label">
                      Tipe perubahan
                    </label>
                    <select id="change_type" value={form.change_type} onChange={set("change_type")} className="field">
                      {Object.keys(CHANGE_TYPE).map((o) => (
                        <option key={o} value={o}>
                          {changeTypeLabel(o)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="environment" className="label">
                      Lingkungan
                    </label>
                    <select id="environment" value={form.environment} onChange={set("environment")} className="field">
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
              <div className="space-y-4">
                {TEXTAREAS.map(([key, label, required, hint]) => (
                  <div key={key}>
                    <label htmlFor={key} className="label">
                      {label} {required && <span className="text-danger">*</span>}
                    </label>
                    <textarea
                      id={key}
                      rows={3}
                      required={required}
                      aria-describedby={`${key}-hint`}
                      value={form[key]}
                      onChange={set(key)}
                      className="field h-auto py-2"
                    />
                    <p id={`${key}-hint`} className="mt-1 text-meta text-foreground-muted">
                      {hint}
                    </p>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Cakupan" description="Pisahkan beberapa nilai dengan koma">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="affected_devices" className="label">
                    Perangkat terdampak
                  </label>
                  <input
                    id="affected_devices"
                    value={form.affected_devices}
                    onChange={set("affected_devices")}
                    placeholder="core-sw-01, fw-edge-02"
                    className="field font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="affected_services" className="label">
                    Layanan terdampak
                  </label>
                  <input
                    id="affected_services"
                    value={form.affected_services}
                    onChange={set("affected_services")}
                    placeholder="VPN kantor pusat, e-mail"
                    className="field"
                  />
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => router.push("/changes")} className="btn-secondary">
              Batal
            </button>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Menyimpan…" : "Simpan sebagai Draft"}
            </button>
          </div>
        </form>
      </Page>
    </>
  );
}