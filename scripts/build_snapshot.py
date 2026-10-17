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
    for ri, tr in enumerate(trs):
        cells = re.findall(r"<t[dh]([^>]*)>(.*?)</t[dh]>", tr, re.S)
        row: list[str] = []
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

    # --- 2. metadata dokumen
    title = subtitle = period = None
    wilayah: dict[str, str] = {}
    for row in grid[:16]:
        vals = [v for v in row if v]
        joined = " ".join(vals)
        for m in re.finditer(r"(Prov|Kab|Kec|Desa)\s*:\s*([^:]+?)(?=\s{2,}|$)", joined):
            wilayah[m.group(1).lower()] = m.group(2).strip()
        if len(vals) == 1:
            t = vals[0]
            if t.upper().startswith("TABEL") and not title:
                title = t
            elif title and not subtitle and len(t) > 3 and not t.upper().startswith("TAHUN"):
                subtitle = t
            elif t.upper().startswith(("TAHUN", "PERIODE")):
                period = t

    # --- 3. blok header
    HEADER_HINT = ("KODE", "KECAMATAN", "KELURAHAN", "DESA", "JUMLAH", "URAIAN",
                   "NAMA", "KELOMPOK", "SASARAN", "TOTAL", "JENIS", "NO")
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

    columns = []
    for i, p in enumerate(paths):
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
            rows.append(row)

    return {
        "title": title, "subtitle": subtitle, "period": period,
        "wilayah": wilayah, "columns": columns, "colNumbers": col_numbers,
        "rows": rows, "empty": not rows,
    }


# ---------------------------------------------------------------- build

def build_catalog(token):
    raw = json.loads(fetch(CATALOG, token))
    return raw


def report_url(module, report, args, group=None):
    svc = MODULES[module]
    ov = (svc.get("groupOverrides") or {}).get(group or "", {})
    host = ov.get("host", svc["host"])
    service = ov.get("service", svc["service"])
    category = ov.get("category", report["reportCategory"])
    filt = {"reportName": report["reportName"], "reportType": "html",
            "reportCategory": category}
    if "bulanan" in report["reportCategory"].lower():
        filt["periode"] = f"{args.tahun}-{args.bulan:02d}"
    else:
        filt["tahun"] = str(args.tahun)
    filt["provinsiId"] = str(args.prov)
    if args.kab:
        filt["kabupatenId"] = str(args.kab)
    # Service path wajib ikut: <base>/<service>/viewReport
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
    ap.add_argument("--tahun", type=int, default=2026)
    ap.add_argument("--bulan", type=int, default=10)
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default=None, help="modul: yankb|dallap|krs|elsimil")
    ap.add_argument("--max", type=int, default=0, help="batasi jumlah laporan (0=semua)")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--index-only", action="store_true", help="susun ulang index.json dari file lokal")
    args = ap.parse_args()

    token = os.environ.get("TOKEN")
    if not token and not args.index_only:
        sys.exit("Set TOKEN=<jwt> lebih dulu.")

    index = []

    # Mode cepat: susun ulang index.json dari file yang sudah ada (tanpa jaringan).
    if args.index_only:
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
                rep = {
                    "reportName": parsed.get("reportName", fn),
                    "reportCategory": parsed.get("reportCategory", ""),
                    "reportDescription": parsed.get("description", ""),
                }
                index.append(entry(mod, cfg, parsed.get("group", ""), rep,
                                   parsed, fn[:-5]))
        index.sort(key=lambda r: (r["module"], r["group"], r["reportName"]))
        write_index(args, index)
        return

    catalog = build_catalog(token)

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
                jobs.append((mod, cfg, group, rep))

    if args.max:
        jobs = jobs[: args.max]

    def work(job):
        mod, cfg, group, rep = job
        cat = rep["reportCategory"]
        fname = f"{cat}__{rep['reportName']}".replace("/", "_")
        path = os.path.join(args.out, mod, fname + ".json")
        if os.path.exists(path) and not args.force:
            try:
                with open(path, encoding="utf-8") as f:
                    d = json.load(f)
                return ("cache", mod, cfg, group, rep, d, fname)
            except Exception:  # noqa: BLE001
                pass
        url, filt = report_url(mod, rep, args, group)
        try:
            html = fetch(url, token)
        except Exception as e:  # noqa: BLE001
            stub = {
                "title": rep["reportName"], "subtitle": rep.get("reportDescription", ""),
                "period": None, "wilayah": {}, "columns": [], "rows": [],
                "empty": True, "error": f"{type(e).__name__}: {e}"[:200],
                "module": mod, "moduleLabel": cfg["label"], "group": group,
                "reportName": rep["reportName"], "reportCategory": cat,
                "description": rep.get("reportDescription", ""),
                "filter": filt, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "source": "SIGA BKKBN — snapshot statis",
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(stub, f, ensure_ascii=False, separators=(",", ":"))
            return ("err", mod, cfg, group, rep, stub, fname)
        parsed = parse_report(html)
        parsed.update({
            "module": mod, "moduleLabel": cfg["label"], "group": group,
            "reportName": rep["reportName"], "reportCategory": filt["reportCategory"],
            "description": rep.get("reportDescription", ""),
            "filter": filt, "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "source": "SIGA BKKBN — snapshot statis",
        })
        with open(path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, ensure_ascii=False, separators=(",", ":"))
        return ("ok", mod, cfg, group, rep, parsed, fname)

    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(work, j) for j in jobs]
        for fut in as_completed(futures):
            status, mod, cfg, group, rep, payload, fname = fut.result()
            done += 1
            parsed = payload
            if status == "err":
                print(f"  ERR  {mod}/{rep['reportName']}: {parsed.get('error','')}", file=sys.stderr)
                index.append(entry(mod, cfg, group, rep, parsed, fname))
                continue
            tag = "cache" if status == "cache" else "OK   "
            if status == "ok":
                note = "kosong" if parsed["empty"] else f"{len(parsed['rows'])} baris"
                print(f"  {tag} {mod}/{rep['reportCategory']}/{rep['reportName']} -> {note}",
                      file=sys.stderr)
            index.append(entry(mod, cfg, group, rep, parsed, fname))

    index.sort(key=lambda r: (r["module"], r["group"], r["reportName"]))
    write_index(args, index)


def write_index(args, index):
    meta = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "wilayah": {"provinsi": "Kalimantan Selatan", "provinsiId": args.prov,
                    "kabupaten": "Tanah Laut", "kabupatenId": args.kab},
        "tahun": args.tahun,
        "bulan": args.bulan,
        "totalReports": len(index),
        "modules": [{"id": m, "label": MODULES[m]["label"]} for m in MODULES],
        "reports": index,
    }
    os.makedirs(args.out, exist_ok=True)
    with open(os.path.join(args.out, "index.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f"\nSelesai: {len(index)} laporan -> {args.out}/index.json", file=sys.stderr)


def entry(mod, cfg, group, rep, parsed, fname):
    return {
        "module": mod,
        "moduleLabel": cfg["label"],
        "group": group,
        "reportName": rep["reportName"],
        "reportCategory": parsed.get("reportCategory") or rep["reportCategory"],
        "description": rep.get("reportDescription", ""),
        "file": f"{mod}/{fname}.json",
        "title": parsed.get("title"),
        "subtitle": parsed.get("subtitle"),
        "period": parsed.get("period"),
        "empty": parsed.get("empty", True),
        "error": parsed.get("error"),
        "rowCount": len(parsed.get("rows", [])),
        "colCount": len(parsed.get("columns", [])),
    }


if __name__ == "__main__":
    main()
