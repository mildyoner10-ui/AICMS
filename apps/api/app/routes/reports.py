from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.services.audit_service import get_dashboard_summary

router = APIRouter(prefix="/reports", tags=["reports"])


def _enum(v):
    return v.value if hasattr(v, "value") else v


STATUS_LABELS = {
    "DRAFT": "Draf", "SUBMITTED": "Diajukan", "DOCUMENT_VALIDATION": "Validasi Dokumen",
    "AI_REVIEW": "Tinjauan AI", "REVIEW_FAILED": "Tinjauan Gagal",
    "PENDING_APPROVAL": "Menunggu Persetujuan", "REVISION_REQUIRED": "Perlu Revisi",
    "REJECTED": "Ditolak", "APPROVED": "Disetujui", "SCHEDULED": "Terjadwal",
    "IN_PROGRESS": "Sedang Dieksekusi", "VALIDATION": "Validasi Pasca-Eksekusi",
    "COMPLETED": "Selesai", "CLOSED": "Ditutup", "CANCELLED": "Dibatalkan",
    "STALE": "Kedaluwarsa",
}

CAT_LABELS = {
    "NETWORK": "Jaringan", "SERVER": "Server", "APPLICATION": "Aplikasi",
    "DATABASE": "Basis Data", "SECURITY": "Keamanan", "INFRASTRUCTURE": "Infrastruktur",
    "HEAD_OFFICE": "Kantor Pusat", "CHANNEL": "Channel",
    "BRANCH_OFFICE": "Kantor Cabang", "OTHER": "Lainnya",
}


def _fetch_filter(session, status, category, change_type, environment, search, from_date, to_date):
    conditions = ["deleted_at IS NULL"]
    params = {}
    if status:
        conditions.append("status = :status")
        params["status"] = status
    if category:
        conditions.append("category = :category")
        params["category"] = category
    if change_type:
        conditions.append("change_type = :change_type")
        params["change_type"] = change_type
    if environment:
        conditions.append("environment = :environment")
        params["environment"] = environment
    if search:
        conditions.append("(change_number ILIKE :q OR title ILIKE :q)")
        params["q"] = f"%{search}%"
    if from_date:
        conditions.append("created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        conditions.append("created_at <= :to_date")
        params["to_date"] = f"{to_date} 23:59:59"

    where = " AND ".join(conditions)
    return where, params


async def _get_data(session, where, params):
    total = (await session.execute(
        text(f"SELECT count(*) FROM changes WHERE {where}"), params
    )).scalar()

    r = await session.execute(
        text(f"SELECT status, count(*) FROM changes WHERE {where} GROUP BY status"), params
    )
    by_status = {row[0]: int(row[1]) for row in r.fetchall()}

    r = await session.execute(
        text(f"SELECT category, count(*) FROM changes WHERE {where} GROUP BY category"), params
    )
    by_category = {row[0]: int(row[1]) for row in r.fetchall()}

    r = await session.execute(
        text(f"SELECT change_type, count(*) FROM changes WHERE {where} GROUP BY change_type"), params
    )
    by_type = {row[0]: int(row[1]) for row in r.fetchall()}

    r = await session.execute(
        text(f"SELECT environment, count(*) FROM changes WHERE {where} GROUP BY environment"), params
    )
    by_env = {row[0] or "Tidak diatur": int(row[1]) for row in r.fetchall()}

    r = await session.execute(
        text(
            f"""SELECT c.change_number, c.title, c.status,
                      (SELECT ra.risk_level FROM risk_assessments ra
                       WHERE ra.change_id = c.id ORDER BY ra.calculated_at DESC LIMIT 1) as risk_level,
                      c.category, c.change_type, c.environment,
                      u.display_name as requester_name, c.created_at, c.updated_at,
                      c.implementation_start, c.implementation_end
               FROM changes c LEFT JOIN users u ON u.id = c.requester_id
               WHERE {where} ORDER BY c.created_at DESC"""
        ), params
    )
    items = [{
        "change_number": row[0], "title": row[1], "status": row[2],
        "risk_level": row[3], "category": row[4], "change_type": row[5],
        "environment": row[6], "requester_name": row[7],
        "created_at": row[8].isoformat() if row[8] else None,
        "updated_at": row[9].isoformat() if row[9] else None,
        "implementation_start": row[10].isoformat() if row[10] else None,
        "implementation_end": row[11].isoformat() if row[11] else None,
    } for row in r.fetchall()]

    r = await session.execute(
        text(
            "SELECT t.occurred_at - (SELECT min(t2.occurred_at) FROM change_status_transitions t2 "
            "WHERE t2.change_id = t.change_id AND t2.to_status = 'SUBMITTED') AS delta "
            "FROM change_status_transitions t "
            "WHERE t.to_status = 'APPROVED' AND t.occurred_at IS NOT NULL"
        )
    )
    durations = [
        row[0].total_seconds() / 3600 for row in r.fetchall() if row[0] is not None
    ]
    avg_hours = round(sum(durations) / len(durations), 1) if durations else None

    return {
        "total": total, "by_status": by_status, "by_category": by_category,
        "by_type": by_type, "by_environment": by_env, "items": items,
        "approval_avg_hours": avg_hours,
    }


@router.get("/summary")
async def get_report_summary(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Get full summary data for reporting."""
    where, params = _fetch_filter(session, status, category, change_type, environment, search, from_date, to_date)
    data = await _get_data(session, where, params)
    data["period"] = {"from": from_date, "to": to_date}
    return data


@router.get("/csv")
async def export_report_csv(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Export filtered changes as CSV."""
    import csv
    import io

    where, params = _fetch_filter(session, status, category, change_type, environment, search, from_date, to_date)
    data = await _get_data(session, where, params)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "No. CRF", "Judul", "Status", "Risiko", "Kategori", "Tipe",
        "Lingkungan", "Pemohon", "Tgl Dibuat",
    ])
    for it in data["items"]:
        writer.writerow([
            it.get("change_number", ""),
            it.get("title", ""),
            STATUS_LABELS.get(it.get("status", ""), it.get("status", "")),
            it.get("risk_level") or "",
            CAT_LABELS.get(it.get("category", ""), it.get("category", "")),
            it.get("change_type") or "",
            it.get("environment") or "",
            it.get("requester_name") or "",
            (it.get("created_at") or "")[:19].replace("T", " "),
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=\"laporan-perubahan.csv\""},
    )


@router.get("/pdf")
async def generate_report_pdf(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Generate a full report as PDF using ReportLab."""
    where, params = _fetch_filter(session, status, category, change_type, environment, search, from_date, to_date)
    summary = await _get_data(session, where, params)

    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph, PageBreak, KeepTogether
    )
    from reportlab.lib.units import cm, mm

    TEAL = colors.HexColor("#1e8c86")
    TEAL_LIGHT = colors.HexColor("#2ba8a2")
    GOLD = colors.HexColor("#ffd23f")
    CREAM = colors.HexColor("#fff8e7")
    BORDER = colors.HexColor("#c8dce0")
    BG_ALTERNATE = colors.HexColor("#f8f9fa")

    doc = SimpleDocTemplate(
        "/tmp/report.pdf",
        pagesize=landscape(A4),
        leftMargin=2*cm, rightMargin=2*cm, topMargin=2*cm, bottomMargin=1*cm,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("CustomTitle", parent=styles["Title"],
        fontSize=18, leading=22, textColor=TEAL, spaceAfter=6)
    meta_style = ParagraphStyle("Meta", parent=styles["Normal"],
        fontSize=8, leading=10, textColor=colors.HexColor("#5a7a8a"))
    h2_style = ParagraphStyle("H2", parent=styles["Heading2"],
        fontSize=11, textColor=TEAL, spaceBefore=12, spaceAfter=4,
        borderPadding=[0, 0, 2, 0], borderWidth=0, borderColor=TEAL_LIGHT,
        borderDashes=4)

    story = []

    # Title
    story.append(Paragraph("Laporan Sistem Manajemen Perubahan (AICMS)", title_style))
    from datetime import datetime
    story.append(Paragraph(
        f"Dicetak: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')} WIB &nbsp;&nbsp;|&nbsp;&nbsp; "
        f"Periode: {from_date or 'Awal waktu'} — {to_date or 'Sekarang'}",
        meta_style
    ))
    story.append(Spacer(1, 8))

    # KPI boxes
    total = summary.get("total", 0)
    kpi_data = [
        ["Total", str(total)],
        ["Selesai", str(summary.get("by_status", {}).get("COMPLETED", 0))],
        ["Disetujui", str(summary.get("by_status", {}).get("APPROVED", 0))],
        ["Aktif", str(
            summary.get("by_status", {}).get("SCHEDULED", 0)
            + summary.get("by_status", {}).get("IN_PROGRESS", 0)
        )],
    ]
    if summary.get("approval_avg_hours") is not None:
        kpi_data.append(["Rata-rata Persetujuan (jam)", str(summary["approval_avg_hours"])])

    kpi_table = Table(kpi_data, colWidths=[80] * len(kpi_data[0]))
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CREAM),
        ("BACKGROUND", (0, 1), (-1, -1), TEAL_LIGHT),
        ("TEXTCOLOR", (0, 1), (-1, -1), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 12))

    # Distribution tables
    def dist_table(title, data):
        rows = [[title, "Jumlah", "Persentase"]]
        for k, v in sorted(data.items(), key=lambda x: -x[1]):
            pct_val = f"{v/total*100:.1f}%" if total else "0.0%"
            rows.append([str(k), str(v), pct_val])
        t = Table(rows, colWidths=[130, 60, 60])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_ALTERNATE]),
            ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (1, 0), (2, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return Paragraph(title, h2_style), t

    for label, key in [("Distribusi Status", "by_status"), ("Distribusi Kategori", "by_category"),
                        ("Distribusi Lingkungan", "by_environment"), ("Distribusi Tipe", "by_type")]:
        story.extend(dist_table(label, summary.get(key, {})))
        story.append(Spacer(1, 6))

    # Detail table
    story.append(Paragraph("Daftar Lengkap Perubahan", h2_style))
    detail_header = ["No. CRF", "Judul", "Status", "Risiko", "Kategori", "Tipe", "Lingkungan", "Pemohon", "Tgl"]
    detail_rows = [detail_header]
    for item in summary.get("items", [])[:100]:
        cat = CAT_LABELS.get(item.get("category", ""), item.get("category", ""))
        st = STATUS_LABELS.get(item.get("status", ""), item.get("status", ""))
        title = (item.get("title", "") or "")
        if len(title) > 25:
            title = title[:25] + "…"
        detail_rows.append([
            item.get("change_number", ""),
            title,
            st,
            item.get("risk_level") or "-",
            cat,
            item.get("change_type") or "-",
            item.get("environment") or "-",
            item.get("requester_name") or "-",
            (item.get("created_at") or "")[:10],
        ])

    col_w = [55, 120, 65, 45, 60, 45, 50, 65, 45]
    dt = Table(detail_rows, colWidths=col_w[:len(detail_rows[0])])
    dt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG_ALTERNATE]),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("ALIGN", (0, 8), (0, -1), "CENTER"),
        ("ALIGN", (7, 0), (7, -1), "LEFT"),
    ]))
    story.append(dt)
    if len(summary.get("items", [])) > 100:
        story.append(Spacer(1, 4))
        story.append(Paragraph(
            f"Menampilkan 100 dari {summary['total']} perubahan (paling baru).",
            ParagraphStyle("Note", fontSize=7, textColor=colors.HexColor("#999"))
        ))

    # Footer
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "AICMS — AI Change Management System &nbsp;|&nbsp; Laporan ini dibuat otomatis oleh sistem",
        ParagraphStyle("Footer", fontSize=7, textColor=colors.HexColor("#999"), alignment=2)
    ))

    doc.build(story)

    import io
    with open("/tmp/report.pdf", "rb") as f:
        pdf_bytes = f.read()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="laporan-perubahan.pdf"'},
    )
