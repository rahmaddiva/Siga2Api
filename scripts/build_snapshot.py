#!/usr/bin/env python3
"""
build_snapshot.py — Bangun snapshot data laporan SIGA untuk satu kabupaten.

Mengambil laporan dari endpoint viewReport (HTML JasperReports), mem-parse tabelnya,
lalu menyimpan JSON statis yang dipakai oleh web Siga2Api.

Default: Kabupaten Tanah Laut (prov 22, kab 322), Kalimantan Selatan.

Output: public/data/<modul>/<reportName>.json + public/data/index.json

Catatan:
- Hanya laporan AGREGAT yang diambil. Laporan by-name (KRS Tabel3/Tabel5,
  Bumil/Pascasalin Individu) dilewati karena memuat data pribadi.
- Resumable: laporan yang sudah ada di cache tidak diambil ulang (kecuali --force).
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

GATEWAY = "https://siga-api-gateway.bkkbn.go.id"
CATALOG = GATEWAY + "/report-siga-ocp/getReportParameter"

# Laporan yang memuat data pribadi per-orang -> tidak pernah diambil.
PII_REPORTS = {
    ("STUNTING", "Tabel3"),      # rekap KRS berdasarkan nama & alamat
    ("STUNTING", "Tabel5"),      # formulir verval berdasarkan nama & alamat
    ("Bumil-Individu", None),
    ("Pascasalin-Individu", None),
}

# modul -> (service, daftar grup katalog, apakah pakai periode bulanan)
MODULES = {
    "yankb": {
        "label": "YAN KB",
        "service": "report-siga-yankb-ocp",
        "groups": ["yankbTahunan", "yankbBulanan"],
        "host": "gateway",
    },
    "dallap": {
        "label": "DALLAP",
        "service": "report-siga-dallap-ocp",
        "groups": ["dallapTahunan", "dallapBulanan", "dallapRekapBulanan"],
        "host": "gateway",
    },
    "krs": {
        "label": "Keluarga Berisiko Stunting",
        # Tabel3/4/5 (by-name & rekap wilayah) ada di pk23; tabulasi verval
        # (Tabel1/2/6) ada di report-siga-krs-ocp. Kategori juga berbeda.
        "service": None,
        "groups": ["verval", "vervalTabulasi"],
        "host": "pk23",
        "groupOverrides": {
            "verval": {"host": "pk23", "service": None, "category": "STUNTING2025"},
            "vervalTabulasi": {"host": "gateway", "service": "report-siga-krs-ocp",
                               "category": "Verval-Tabulasi"},
        },
    },
    "elsimil": {
        "label": "ELSIMIL",
        "service": "report-siga-elsimil-ocp",
        "groups": ["catinTahunan", "catinBulanan", "catinKomulatif",
                   "bumilTahunan", "bumilBulanan", "bumilKomulatif",
                   "pascasalinTahunan", "pascasalinBulanan", "pascasalinKomulatif",
                   "elsimilBadutaTahunan", "elsimilBadutaBulanan", "elsimilBadutaKumulatif",
                   "elsimilMbg"],
        "host": "gateway",
    },
}

BASE = {
    "gateway": GATEWAY,
    "pk23": "https://pk23-portal-gw.bkkbn.go.id/report",
}


# ---------------------------------------------------------------- HTTP

def fetch(url, token=None, retries=4, timeout=45):
    """GET dengan retry.

    Server SIGA kadang membalas `200` dengan body kosong (0 byte) untuk laporan
    yang sebenarnya ada — jadi body kosong diperlakukan sebagai kegagalan sementara.
    """
    last = None
    for i in range(retries):
        try:
            hdrs = {"Accept": "text/html,application/json"}
            if token:
                hdrs["Authorization"] = "Bearer " + token
            req = urllib.request.Request(url, headers=hdrs)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
            if body.strip():
                return body
            last = "body kosong"
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.0 + 1.5 * i)
    raise RuntimeError(f"gagal: {url} -> {last}")


# ---------------------------------------------------------------- parsing

ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'",
}


# Kata kunci yang menandai baris header tabel (bukan baris metadata/wilayah).
HEADER_HINT = ("KODE", "KECAMATAN", "KELURAHAN", "DESA", "JUMLAH", "URAIAN",
               "NAMA", "KELOMPOK", "SASARAN", "TOTAL", "JENIS", "NO")

# Alias label wilayah -> kunci baku. ELSIMIL memakai "KABUPATEN"/"PROVINSI",
# DALLAP memakai "Kab"/"Prov".
WILAYAH_ALIASES = {
    "prov": ("prov", "propinsi", "provinsi"),
    "kab": ("kab", "kabupaten"),
    "kec": ("kec", "kecamatan"),
    "desa": ("desa", "kelurahan", "kel"),
}
WILAYAH_KEY = {a: k for k, al in WILAYAH_ALIASES.items() for a in al}


def usable_period(t: str) -> str | None:
    """Kembalikan nilai periode, atau None bila hanya placeholder kosong.

    Template ELSIMIL kadang mencetak "TAHUN null" / "TAHUN :" tanpa nilai.
    `periodKey`/`periodLabel` dari harvest tetap jadi acuan sebenarnya.
    """
    v = t.strip()
    if re.search(r"\bnull\b", v, re.I):
        return None
    if ":" in v:
        return v if v.split(":", 1)[1].strip() else None
    return v if re.search(r"\d", v) else None


def cell_text(inner: str) -> str:
    txt = re.sub(r"<br\s*/?>", " ", inner)
    txt = re.sub(r"<[^>]+>", "", txt)
    for k, v in ENTITIES.items():
        txt = txt.replace(k, v)
    txt = txt.replace("\u00a0", " ")
    return re.sub(r"\s+", " ", txt).strip()


def parse_report(html: str) -> dict:
    """Parse satu halaman JasperReports menjadi {meta, columns, rows}.

    JasperReports memakai colspan/rowspan berat, jadi sel diekspansi dulu ke grid
    2D penuh agar setiap baris punya jumlah kolom yang sama.
    """
    trs = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)

    # --- 1. ekspansi colspan/rowspan ke grid
    grid: list[list[str]] = []
    occupied: dict[tuple[int, int], str] = {}
    # Rentang sel asli per baris: (kolom_awal, colspan, teks). Dipakai untuk
    # mewarisi label dari header induk (lihat bagian 4).
    spans: list[list[tuple[int, int, str]]] = []
    for ri, tr in enumerate(trs):
        cells = re.findall(r"<t[dh]([^>]*)>(.*?)</t[dh]>", tr, re.S)
        row: list[str] = []
        row_spans: list[tuple[int, int, str]] = []
        col = 0
        for attrs, inner in cells:
            cs_m = re.search(r'colspan\s*=\s*"?(\d+)', attrs)
            rs_m = re.search(r'rowspan\s*=\s*"?(\d+)', attrs)
            cs = int(cs_m.group(1)) if cs_m else 1
            rs = int(rs_m.group(1)) if rs_m else 1
            val = cell_text(inner)
            while (ri, col) in occupied:
                row.append(occupied.pop((ri, col)))
                col += 1
            row.append(val)
            row_spans.append((col, cs, val))
            for k in range(1, cs):
                row.append("")
            for dr in range(1, rs):
                for dc in range(cs):
                    occupied[(ri + dr, col + dc)] = val if dc == 0 else ""
            col += cs
        while (ri, col) in occupied:
            row.append(occupied.pop((ri, col)))
            col += 1
        grid.append(row)
        spans.append(row_spans)

    width = max((len(r) for r in grid), default=0)
    grid = [r + [""] * (width - len(r)) for r in grid]

    if not grid or width == 0:
        return {"title": None, "subtitle": None, "period": None,
                "wilayah": {}, "columns": [], "rows": [], "empty": True}

    # JasperReports menandai hasil kosong dengan teks khusus, bukan tabel kosong.
    flat_upper = " ".join(v for row in grid for v in row).upper()
    if "DATA TIDAK DITEMUKAN" in flat_upper:
        return {"title": None, "subtitle": None, "period": None,
                "wilayah": {}, "columns": [], "rows": [], "empty": True}

    def is_table_header_row(row: list[str]) -> bool:
        """Baris judul kolom tabel (bukan metadata), mis. NO/KODE/KECAMATAN."""
        toks = {v.strip().upper().rstrip(".") for v in row if v.strip()}
        return len(toks & set(HEADER_HINT)) >= 2

    def wilayah_pairs(vals: list[str]):
        """Ambil pasangan (kunci, nilai) wilayah dari sel-sel satu baris.

        Menangani dua bentuk cetak: satu sel ("Prov : X" / "Prov X") dan dua
        sel ("KABUPATEN", ": TANAH LAUT"). Placeholder `null` dan kata tingkat
        wilayah tanpa nama ("Tingkat : Kabupaten") diabaikan.
        """
        for i, v in enumerate(vals):
            # Pisah label dari nilainya: "Kab : X", "Kab: X", atau "Kab X".
            m = re.match(r"(?i)\s*(" + "|".join(WILAYAH_KEY) + r")\b\s*[:.]?\s*(.*)$", v)
            if not m:
                continue
            key = WILAYAH_KEY[m.group(1).lower()]
            val = m.group(2).strip(" .-")
            if not val and i + 1 < len(vals):
                nxt = vals[i + 1].lstrip()
                val = (nxt[1:] if nxt.startswith(":") else nxt).strip(" .-")
            if (val and len(val) <= 60 and re.search(r"[A-Za-z]{2}", val)
                    and val.lower() not in WILAYAH_KEY
                    and not re.search(r"\bnull\b", val, re.I)):
                yield key, val

    # --- 2. metadata dokumen
    title = subtitle = period = None
    wilayah: dict[str, str] = {}
    # Metadata dicetak sebelum tabel; berhenti di baris judul kolom pertama.
    for row in grid[:24]:
        vals = [v for v in row if v]
        if not vals:
            continue
        if is_table_header_row(row):
            break
        for key, val in wilayah_pairs(vals):
            wilayah.setdefault(key, val)
        if len(vals) == 1:
            t = vals[0]
            if t.upper().startswith("TABEL") and not title:
                title = t
            elif (title and not subtitle and len(t) > 3
                  and not t.upper().startswith("TAHUN")
                  and not re.fullmatch(r"null", t, re.I)):
                subtitle = t
            elif t.upper().startswith(("TAHUN", "PERIODE")):
                # Template ELSIMIL kadang mencetak "TAHUN null" / "TAHUN :".
                period = usable_period(t) or period

    # --- 3. blok header
    header_idx = None
    for i, row in enumerate(grid):
        vals = [v for v in row if v]
        if len(vals) < 3:
            continue
        if any(any(h in v.upper() for h in HEADER_HINT) for v in vals):
            header_idx = i
            break

    def is_index_row(row: list[str]) -> bool:
        """Baris penomoran kolom: (1) (2) (3) 3=4+12+13 — bukan header, bukan data."""
        vals = [v for v in row if v]
        if len(vals) < 3:
            return False
        return all(re.fullmatch(r"[\d\s.,=+\-∑Σ()*]*", v) and len(v) <= 14 for v in vals)

    def has_text(row: list[str]) -> bool:
        return any(re.search(r"[A-Za-z]{2,}", v) for v in row)

    if header_idx is None:
        body = [r for r in grid if any(r)]
        return {"title": title, "subtitle": subtitle, "period": period,
                "wilayah": wilayah, "columns": [], "rows": body,
                "empty": not any(any(x.strip() for x in r) for r in body)}

    def numeric_count(row: list[str]) -> int:
        return sum(1 for v in row if v and re.fullmatch(r"[\d.,\-]+", v))

    header_rows: list[list[str]] = []
    header_row_idx: list[int] = []
    index_rows: list[list[str]] = []
    data_start = None
    for i in range(header_idx, len(grid)):
        row = grid[i]
        if not any(v.strip() for v in row):
            continue
        if is_index_row(row):
            index_rows.append(row)
            continue
        if i > header_idx and numeric_count(row) >= 2:
            data_start = i
            break
        header_rows.append(row)
        header_row_idx.append(i)
        if len(header_rows) > 5:
            data_start = i + 1
            break

    # --- 4. nama kolom: gabung path header, pakai daun; beri prefiks bila duplikat
    paths: list[list[str]] = [[] for _ in range(width)]
    for row in header_rows:
        for c, v in enumerate(row):
            if v and v not in paths[c]:
                paths[c].append(v)

    leaves = [(p[-1] if p else "") for p in paths]
    counts: dict[str, int] = {}
    for lf in leaves:
        counts[lf] = counts.get(lf, 0) + 1

    columns: list[str] = []
    for p in paths:
        if not p:
            columns.append("")
            continue
        lf = p[-1]
        if counts[lf] > 1 and len(p) >= 2:
            columns.append(f"{p[-2]} / {lf}")
        else:
            columns.append(lf)

    # nomor kolom dari baris indeks (kalau ada), untuk referensi
    col_numbers = None
    if index_rows:
        cand = index_rows[-1]
        if sum(1 for v in cand if v) >= width * 0.6:
            col_numbers = cand

    # --- 5. baris data
    rows: list[list[str]] = []
    if data_start is not None:
        for row in grid[data_start:]:
            if not any(v.strip() for v in row):
                continue
            if is_index_row(row):
                continue
            # Baris footer JasperReports ("Sumber: ...", "Dicetak: ...") bukan data.
            filled = [v for v in row if v.strip()]
            if len(filled) <= 2 and re.match(
                r"^(sumber|dicetak|diprint|halaman|page|cetak)\b", filled[0].strip(), re.I
            ):
                continue
            rows.append(row)

    # Buang kolom yang seluruhnya kosong di ujung kanan/kiri (artefak layout).
    if rows and columns:
        keep = [i for i in range(len(columns))
                if any((r[i] if i < len(r) else "").strip() for r in rows)]
        if keep:
            lo, hi = keep[0], keep[-1]
            columns = columns[lo:hi + 1]
            rows = [(r[lo:hi + 1] if len(r) >= hi + 1 else r[lo:] + [""] * (hi + 1 - len(r))) for r in rows]
            if col_numbers:
                col_numbers = col_numbers[lo:hi + 1]
            # Rentang sel ikut digeser agar indeksnya tetap sejajar `columns`.
            spans = [[(start - lo, cs, txt) for start, cs, txt in row]
                     for row in spans]

    # --- 6. label kolom yang kosong
    # JasperReports kadang tidak mencetak sel anak untuk sebagian kolom. Untuk
    # kolom BERISI DATA, warisi nama grup induk terdekat; kolom kosong (spacer
    # layout) sengaja diberi "Kolom N" saja agar tidak meminjam nama tetangga.
    def index_label(col: int) -> str:
        if col_numbers and col < len(col_numbers):
            # Baris indeks ditulis "(1) (2) 3=Σ(4-12)"; ambil angkanya saja.
            num = col_numbers[col].strip().strip("()[] ")
            if num:
                return f"Kolom {num}"
        return f"Kolom {col + 1}"

    def parent_label(col: int) -> str:
        """Nama grup induk terdekat yang membentang di atas `col`.

        Level terdalam dilewati: sel lebar di level itu adalah tetangga
        (mis. "PERORANGAN" mencakup kolom di sebelahnya), bukan induk kolom ini.
        """
        for level in range(len(header_rows) - 2, -1, -1):
            for start, cs, txt in spans[header_row_idx[level]]:
                if txt and start <= col < start + cs:
                    return txt
        return ""

    filled: list[str] = []
    for i, lbl in enumerate(columns):
        if lbl:
            filled.append(lbl)
            continue
        has_data = any((r[i] if i < len(r) else "").strip() for r in rows)
        inherited = parent_label(i) if has_data else ""
        # Hindari label kembar: warisan grup sering sama dengan sel tetangga.
        if inherited and inherited not in filled:
            filled.append(inherited)
        else:
            filled.append(index_label(i))
    columns = filled

    return {
        "title": title, "subtitle": subtitle, "period": period,
        "wilayah": wilayah, "columns": columns, "colNumbers": col_numbers,
        "rows": rows, "empty": not rows,
    }


# ---------------------------------------------------------------- build

def build_catalog(token):
    raw = json.loads(fetch(CATALOG, token))
    return raw


MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
              "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]


def period_type_of(category: str) -> str:
    """Laporan 'Bulanan' memakai `periode`; sisanya memakai `tahun`."""
    return "monthly" if "bulanan" in category.lower() else "annual"


def period_label(key: str) -> str:
    if "-" in key:
        y, m = key.split("-")
        return f"{MONTH_ABBR[int(m) - 1]} {y}"
    return key


def enumerate_periods(args) -> tuple[list[str], list[str]]:
    """Kembalikan (keys_tahunan, keys_bulanan) yang akan dipanen."""
    annual = [] if args.skip_annual else [str(y) for y in args.years]
    monthly = [] if args.skip_monthly else [
        f"{y}-{m:02d}" for y in args.years for m in args.months]
    return annual, monthly


def report_url(module, report, args, group, period_type, period_key):
    svc = MODULES[module]
    ov = (svc.get("groupOverrides") or {}).get(group or "", {})
    host = ov.get("host", svc["host"])
    service = ov.get("service", svc["service"])
    category = ov.get("category", report["reportCategory"])
    filt = {"reportName": report["reportName"], "reportType": "html",
            "reportCategory": category}
    if period_type == "monthly":
        filt["periode"] = period_key
    else:
        filt["tahun"] = period_key
    filt["provinsiId"] = str(args.prov)
    if args.kab:
        filt["kabupatenId"] = str(args.kab)
    base = BASE[host]
    if service:
        base = f"{base}/{service}"
    url = base + "/viewReport?filterPencarian=" + urllib.parse.quote(
        json.dumps(filt, separators=(",", ":")))
    return url, filt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prov", type=int, default=22)
    ap.add_argument("--kab", type=int, default=322)
    ap.add_argument("--years", default="2026",
                    help="daftar tahun dipisah koma, mis. 2025,2026")
    ap.add_argument("--months", default="1-10",
                    help="bulan untuk laporan bulanan: '1-10' atau '1,2,3'")
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default=None, help="modul: yankb|dallap|krs|elsimil")
    ap.add_argument("--max", type=int, default=0, help="batasi jumlah job (0=semua)")
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--index-only", action="store_true",
                    help="susun ulang index.json dari file lokal")
    ap.add_argument("--skip-annual", action="store_true",
                    help="jangan panen laporan tahunan")
    ap.add_argument("--skip-monthly", action="store_true",
                    help="jangan panen laporan bulanan")
    args = ap.parse_args()
    args.years = [int(y) for y in str(args.years).split(",") if y.strip()]
    args.months = _parse_months(args.months)

    token = os.environ.get("TOKEN")
    if not token and not args.index_only:
        sys.exit("Set TOKEN=<jwt> lebih dulu.")

    if args.index_only:
        mods = [args.only] if args.only else list(MODULES)
        write_index(args, merge_index(args, collect_local(args), mods))
        return

    catalog = build_catalog(token)
    annual_keys, monthly_keys = enumerate_periods(args)

    jobs = []
    mods = [args.only] if args.only else list(MODULES)
    for mod in mods:
        cfg = MODULES[mod]
        os.makedirs(os.path.join(args.out, mod), exist_ok=True)
        for group in cfg["groups"]:
            for rep in catalog.get(group, []):
                cat = rep["reportCategory"]
                if (cat, rep["reportName"]) in PII_REPORTS:
                    print(f"  SKIP PII {mod}/{rep['reportName']}", file=sys.stderr)
                    continue
                if any(k == cat and v is None for k, v in PII_REPORTS):
                    print(f"  SKIP PII {mod}/{cat}", file=sys.stderr)
                    continue
                ptype = period_type_of(cat)
                keys = monthly_keys if ptype == "monthly" else annual_keys
                for key in keys:
                    jobs.append((mod, cfg, group, rep, ptype, key))

    if args.max:
        jobs = jobs[: args.max]

    def work(job):
        mod, cfg, group, rep, ptype, key = job
        cat = rep["reportCategory"]
        fname = f"{cat}__{rep['reportName']}__{key}".replace("/", "_")
        path = os.path.join(args.out, mod, fname + ".json")
        if os.path.exists(path) and not args.force:
            try:
                with open(path, encoding="utf-8") as f:
                    return ("cache", job, json.load(f), fname)
            except Exception:  # noqa: BLE001
                pass

        url, filt = report_url(mod, rep, args, group, ptype, key)
        base_meta = {
            "module": mod, "moduleLabel": cfg["label"], "group": group,
            "reportName": rep["reportName"], "reportCategory": filt["reportCategory"],
            "description": rep.get("reportDescription", ""),
            "periodType": ptype, "periodKey": key, "periodLabel": period_label(key),
            "filter": filt, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "SIGA BKKBN — snapshot statis",
        }
        try:
            html = fetch(url, token)
        except Exception as e:  # noqa: BLE001
            stub = {"title": rep["reportName"],
                    "subtitle": rep.get("reportDescription", ""),
                    "period": None, "wilayah": {}, "columns": [], "rows": [],
                    "empty": True, "error": f"{type(e).__name__}: {e}"[:200],
                    **base_meta}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(stub, f, ensure_ascii=False, separators=(",", ":"))
            return ("err", job, stub, fname)

        parsed = parse_report(html)
        parsed.update(base_meta)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, ensure_ascii=False, separators=(",", ":"))
        return ("ok", job, parsed, fname)

    by_id: dict[tuple, dict] = {}
    done = ok = err = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, j) for j in jobs]
        for fut in as_completed(futures):
            status, job, parsed, fname = fut.result()
            mod, cfg, group, rep, ptype, key = job
            done += 1
            if status == "err":
                err += 1
                print(f"  ERR  {mod}/{rep['reportName']}/{key}: "
                      f"{parsed.get('error', '')[:70]}", file=sys.stderr)
            elif status == "ok":
                ok += 1
                note = "kosong" if parsed["empty"] else f"{len(parsed['rows'])} baris"
                print(f"  OK   {mod}/{rep['reportCategory']}/{rep['reportName']}/{key}"
                      f" -> {note}", file=sys.stderr)
            ident = (mod, group, rep["reportName"], rep["reportCategory"], ptype)
            slot = by_id.setdefault(ident, {"mod": mod, "cfg": cfg, "group": group,
                                            "rep": rep, "ptype": ptype, "periods": []})
            slot["periods"].append({
                "key": key,
                "label": period_label(key),
                "file": f"{mod}/{fname}.json",
                "empty": parsed.get("empty", True),
                "error": parsed.get("error"),
                "rowCount": len(parsed.get("rows", [])),
                "colCount": len(parsed.get("columns", [])),
            })

    index = merge_index(args, [entry_from(slot) for slot in by_id.values()], mods)
    print(f"\n{done} job: {ok} ok, {err} error", file=sys.stderr)
    write_index(args, index)


def _parse_months(spec: str) -> list[int]:
    out: list[int] = []
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return sorted({m for m in out if 1 <= m <= 12})


def collect_local(args) -> list[dict]:
    """Susun index dari file yang sudah ada di disk (tanpa jaringan)."""
    by_id: dict[tuple, dict] = {}
    for mod in ([args.only] if args.only else list(MODULES)):
        cfg = MODULES[mod]
        d = os.path.join(args.out, mod)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if not fn.endswith(".json"):
                continue
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                parsed = json.load(f)
            ptype = parsed.get("periodType") or period_type_of(
                parsed.get("reportCategory", ""))
            ident = (mod, parsed.get("group", ""), parsed.get("reportName", ""),
                     parsed.get("reportCategory", ""), ptype)
            slot = by_id.setdefault(ident, {
                "mod": mod, "cfg": cfg, "group": parsed.get("group", ""),
                "rep": {"reportName": parsed.get("reportName", ""),
                        "reportCategory": parsed.get("reportCategory", ""),
                        "reportDescription": parsed.get("description", "")},
                "ptype": ptype, "periods": [],
            })
            key = parsed.get("periodKey", "")
            slot["periods"].append({
                "key": key,
                "label": parsed.get("periodLabel") or period_label(key),
                "file": f"{mod}/{fn[:-5]}.json",
                "empty": parsed.get("empty", True),
                "error": parsed.get("error"),
                "rowCount": len(parsed.get("rows", [])),
                "colCount": len(parsed.get("columns", [])),
            })
    return [entry_from(slot) for slot in by_id.values()]


def merge_index(args, index: list[dict], mods: list[str]) -> list[dict]:
    """Gabungkan entri baru ke index.json lama agar katalog tetap utuh.

    `--only` hanya membatasi modul yang DIPANEN, bukan isi index. Tanpa merge,
    hasil panen sebagian akan menimpa katalog dengan 47 laporan, bukan 300.
    """
    path = os.path.join(args.out, "index.json")
    try:
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
        old_reports = old["reports"]
        if not isinstance(old_reports, list):
            raise ValueError("reports bukan list")
    except (OSError, ValueError, KeyError, TypeError) as e:  # index hilang/rusak
        print(f"  index lama tidak terbaca ({e.__class__.__name__}), "
              f"memakai hasil panen saja", file=sys.stderr)
        return index

    # Entri segar selalu menang. Entri modul lain dipertahankan apa adanya;
    # saat --max membatasi job, laporan modul ini yang tidak ikut dipanen
    # juga dipertahankan agar tidak hilang.
    fresh = {(r["module"], r["group"], r["reportName"], r["reportCategory"])
             for r in index}
    drop_mods = set() if args.max else set(mods)
    kept = [r for r in old_reports
            if (r.get("module"), r.get("group"), r.get("reportName"),
                r.get("reportCategory")) not in fresh
            and r.get("module") not in drop_mods]
    if kept:
        print(f"  merge index: {len(kept)} laporan lama dipertahankan",
              file=sys.stderr)
    return index + kept


def write_index(args, index):
    index.sort(key=lambda r: (r["module"], r["group"], r["reportName"]))
    for r in index:
        r["periods"].sort(key=lambda p: p["key"], reverse=True)
    meta = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "wilayah": {"provinsi": "Kalimantan Selatan", "provinsiId": args.prov,
                    "kabupaten": "Tanah Laut", "kabupatenId": args.kab},
        "years": args.years,
        "months": args.months,
        "totalReports": len(index),
        "totalPeriods": sum(len(r["periods"]) for r in index),
        "modules": [{"id": m, "label": MODULES[m]["label"]} for m in MODULES],
        "reports": index,
    }
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"Selesai: {len(index)} laporan / {meta['totalPeriods']} periode "
          f"-> {args.out}/index.json", file=sys.stderr)


def entry_from(slot):
    rep = slot["rep"]
    periods = slot["periods"]
    filled = [p for p in periods if not p["empty"] and not p["error"]]
    return {
        "module": slot["mod"],
        "moduleLabel": slot["cfg"]["label"],
        "group": slot["group"],
        "reportName": rep["reportName"],
        "reportCategory": rep["reportCategory"],
        "description": rep.get("reportDescription", ""),
        "periodType": slot["ptype"],
        "periods": periods,
        "rowCount": max((p["rowCount"] for p in filled), default=0),
        "colCount": max((p["colCount"] for p in filled), default=0),
        "empty": not filled,
        "error": None if filled else next(
            (p["error"] for p in periods if p["error"]), None),
    }


if __name__ == "__main__":
    main()
