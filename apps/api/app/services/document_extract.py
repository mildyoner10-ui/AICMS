"""Document text extraction, secret redaction, and untrusted-content screening.

Uploaded content is untrusted data: it is never executed, and any instruction-
looking text is flagged, not followed (markdown/05_AI_REVIEW_FRAMEWORK.md §9).
"""

import io
import re

# Extension -> how we can read it. Anything else is NOT_ASSESSED, never guessed.
TEXTUAL = {".txt", ".cfg", ".yaml", ".yml", ".json", ".conf", ".ini", ".xml", ".csv", ".log"}
MAX_CHARS = 200_000  # keeps prompts bounded; evidence snippets stay exact

_SECRET_PATTERNS = [
    # `:`/`=` for key-value files, bare whitespace for device CLI (`password X`).
    (re.compile(r"(?i)\b(password|passwd|pwd|secret|token|api[_-]?key|community)\b\s*[:=]?\s+\S+"), r"\1: [REDACTED]"),
    (re.compile(r"(?i)\bsnmp-server community\s+\S+"), "snmp-server community [REDACTED]"),
    (re.compile(r"(?i)\b(enable secret|enable password)\s+\S+"), r"\1 [REDACTED]"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"), "[REDACTED PRIVATE KEY]"),
    (re.compile(r"(?i)\b(bearer)\s+[A-Za-z0-9._\-]{12,}"), r"\1 [REDACTED]"),
]

_INJECTION_PATTERNS = [
    re.compile(r"(?i)ignore (all|any|the) (previous|prior|above) instructions"),
    re.compile(r"(?i)disregard (the )?(system|previous) (prompt|instructions)"),
    re.compile(r"(?i)you are now|act as (an? )?(admin|approver|root)"),
    re.compile(r"(?i)(auto[- ]?approve|mark (this|it) as (pass|approved))"),
    re.compile(r"(?i)bypass (the )?(approval|review|policy|control)"),
]


class ExtractionError(ValueError):
    """Raised when bytes cannot be read as text for the given type."""


def redact(text: str) -> str:
    """Strip credential-looking values before anything is sent to AI or logged."""
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def injection_hits(text: str, limit: int = 5) -> list[str]:
    """Lines that look like instructions aimed at the reviewer. Flagged, never obeyed."""
    hits = []
    for line in text.splitlines():
        if any(p.search(line) for p in _INJECTION_PATTERNS):
            hits.append(line.strip()[:200])
            if len(hits) >= limit:
                break
    return hits


def extract_text(filename: str, data: bytes) -> str:
    """Best-effort text for PDF/DOCX/XLSX/plain text. Raises ExtractionError otherwise."""
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""

    if ext in TEXTUAL:
        return data.decode("utf-8", errors="replace")[:MAX_CHARS]

    if ext == ".pdf":
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages]
        return "\n".join(pages)[:MAX_CHARS]

    if ext == ".docx":
        import docx

        document = docx.Document(io.BytesIO(data))
        return "\n".join(p.text for p in document.paragraphs)[:MAX_CHARS]

    if ext == ".xlsx":
        import openpyxl

        workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = []
        for sheet in workbook.worksheets:
            for row in sheet.iter_rows(values_only=True):
                cells = [str(c) for c in row if c is not None]
                if cells:
                    rows.append(" | ".join(cells))
        return "\n".join(rows)[:MAX_CHARS]

    raise ExtractionError(f"Text extraction not supported for {ext or 'unknown type'}")


def summarize(filename: str, text: str) -> dict:
    """Text handed to the reviewer: redacted, screened, with provenance."""
    redacted = redact(text)
    return {
        "filename": filename,
        "text": redacted,
        "injection_candidates": injection_hits(text),
        "truncated": len(redacted) >= MAX_CHARS,
    }
