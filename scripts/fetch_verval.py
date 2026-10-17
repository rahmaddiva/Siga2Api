#!/usr/bin/env python3
"""
fetch_verval.py — pengambil data Verval KRS / Monitoring KRS / ELSIMIL CATIN.

Dua mode:

  --mask   (default) Hanya field non-PII yang dikeluarkan. Field PII tetap dibaca
           untuk menghitung agregat, tapi nilainya dibuang sebelum ditulis.
           Gunakan mode ini untuk analisis, dashboard, atau QA.

  --full   Mengeluarkan seluruh field termasuk PII. Hanya untuk pemilik sistem
           yang punya dasar hukum (tugas pokok & fungsi / DPA) atas data tersebut.
           Script akan meminta konfirmasi eksplisit dan menolak menulis ke stdout.

Contoh:
  TOKEN=xxx python fetch_verval.py --mode verval \
      --prov 22 --kab 322 --kec 6157 --desa 55467 --bulan 10 --tahun 2026 \
      --out data/verval_takisung.json

  TOKEN=xxx python fetch_verval.py --mode verval --prov 22 --kab 322 \
      --kec 6157 --desa 55467 --bulan 10 --tahun 2026 --mask --out out.json
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

GATEWAY = "https://siga-api-gateway.bkkbn.go.id"
VERVAL_CONFIG = "https://pk23-portal-gw.bkkbn.go.id/verval-config/verval/vervalConfig"

# Field yang tidak pernah dikeluarkan di mode --mask
PII_FIELDS = {
    "nama", "nik", "nik_istri", "no_kk", "kki", "id_frm", "nama_istri",
    "kode_ibu_kandung", "alamat", "alamat_wanita", "alamat_pria",
    "latitude", "longitude", "no_hp_wanita", "no_hp_pria",
    "foto_rumah", "foto_jamban", "foto_bantuan",
    "nama_wanita", "nama_wanita_rekap", "nik_wanita", "nik_wanita_rekap",
    "nama_pria", "nama_pria_rekap", "nik_pria", "nik_pria_rekap",
    "kki_rekap_wanita", "kki_rekap_pria",
    "tanggal_lahir", "tgl_lahir_wanita", "tgl_lahir_pria",
    "audit_trail", "id_catin",
}

# Field yang aman & berguna untuk analisis agregat
SAFE_FIELDS = {
    "id_provinsi", "id_kabupaten", "id_kecamatan", "id_kelurahan", "id_rw", "id_rt",
    "status_verval", "status_keluarga", "status_pus", "status_hamil",
    "sasaran_stunting", "resiko_stunting", "kesejahteraan_prioritas",
    "balita", "baduta", "usia", "usia_bulan", "usia_kehamilan",
    "terlalu_muda", "terlalu_tua", "terlalu_dekat", "terlalu_banyak",
    "pus_hamil", "pus_kb_modern", "kesertaan_kb_modern", "status_draft",
    "pendampingan_tpk_rujukan", "pendampingan_tpk_bansos", "pendampingan_tpk_kie",
    "pendampingan_tpk_elsimil", "pendampingan_tpk_eppgbm", "pendampingan_tpk_baas",
    "pendampingan_tpk_pmt", "pendampingan_tpk_tidak_ada",
    "bulan_rekap", "tahun_rekap", "sudah_diukur",
}


def get(url, token, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "Authorization": "Bearer " + token,
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"Gagal mengambil {url}: {last}")


def resolve_service(prov_id, token):
    """Verval KRS dipecah per provinsi: /modul-stunting-<service>/"""
    url = f"{VERVAL_CONFIG}/getVervalServiceByIdProvinsi?idProvinsi={prov_id}"
    data = get(url, token)
    svc = data.get("service")
    if not svc:
        raise RuntimeError(f"Tidak ada service verval untuk provinsi {prov_id}")
    return svc


def fetch_verval(args, token):
    svc = resolve_service(args.prov, token)
    base = f"{GATEWAY}/modul-stunting-{svc}/siga/stunting/getDataStatusVerval"
    rows, page = [], 1
    while True:
        q = {
            "bulan": args.bulan, "tahun": args.tahun,
            "page": page, "recordPerPage": args.per_page,
            "idProvinsi": args.prov, "idKabupaten": args.kab,
            "idKecamatan": args.kec, "idKelurahan": args.desa,
        }
        q = {k: v for k, v in q.items() if v not in (None, "", 0)}
        url = base + "?" + urllib.parse.urlencode(q)
        data = get(url, token)
        batch = data.get("data") or []
        rows.extend(batch)
        total = data.get("totalRecord", 0)
        print(f"  page {page}: {len(batch)} baris (total {total})", file=sys.stderr)
        if not batch or len(rows) >= total or len(rows) >= args.limit:
            meta = {
                "totalRecord": total,
                "totalStatusKeluarga": data.get("totalStatusKeluarga"),
                "service": svc,
            }
            break
        page += 1
    return rows, meta


def fetch_monitoring(args, token):
    base = f"{GATEWAY}/modul-stunting-sigabaru/siga/stunting/getMonitoringKrs"
    q = {"tahun": args.tahun, "periode": args.periode,
         "idProvinsi": args.prov, "idKabupaten": args.kab,
         "idKecamatan": args.kec, "idKelurahan": args.desa}
    q = {k: v for k, v in q.items() if v not in (None, "", 0)}
    data = get(base + "?" + urllib.parse.urlencode(q), token)
    rows = data.get("data") or []
    return rows, {"rows": len(rows)}


def mask_row(row):
    out = {}
    for k, v in row.items():
        if k in PII_FIELDS:
            continue
        if k in SAFE_FIELDS:
            out[k] = v
    return out


def summarize(rows):
    """Agregat yang biasanya memang dibutuhkan untuk analisis."""
    n = len(rows)
    def count(pred):
        return sum(1 for r in rows if pred(r))
    return {
        "jumlah_keluarga": n,
        "sudah_verval": count(lambda r: r.get("status_verval") is True),
        "belum_verval": count(lambda r: r.get("status_verval") is not True),
        "sasaran_stunting": count(lambda r: r.get("sasaran_stunting") == 1),
        "resiko_stunting": count(lambda r: (r.get("resiko_stunting") or 0) > 0),
        "punya_balita": count(lambda r: (r.get("balita") or 0) > 0),
        "punya_baduta": count(lambda r: (r.get("baduta") or 0) > 0),
        "pus_hamil": count(lambda r: (r.get("pus_hamil") or 0) > 0),
        "status_keluarga": _tally(rows, "status_keluarga"),
        "kesejahteraan_prioritas": _tally(rows, "kesejahteraan_prioritas"),
    }


def _tally(rows, field):
    out = {}
    for r in rows:
        k = r.get(field)
        if k is None:
            continue
        out[str(k)] = out.get(str(k), 0) + 1
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--mode", choices=["verval", "monitoring"], default="verval")
    p.add_argument("--prov", type=int, required=True)
    p.add_argument("--kab", type=int)
    p.add_argument("--kec", type=int)
    p.add_argument("--desa", type=int)
    p.add_argument("--bulan", type=int, default=10)
    p.add_argument("--tahun", type=int, default=2026)
    p.add_argument("--periode", type=int, default=2, help="semester untuk monitoring")
    p.add_argument("--per-page", type=int, default=100)
    p.add_argument("--limit", type=int, default=5000)
    p.add_argument("--out", required=True)
    p.add_argument("--full", action="store_true",
                   help="Keluarkan field PII juga. Hanya untuk pemilik data yang sah.")
    p.add_argument("--i-am-data-owner", action="store_true",
                   help="Konfirmasi eksplisit untuk --full")
    args = p.parse_args()

    token = os.environ.get("TOKEN")
    if not token:
        sys.exit("Set TOKEN=<jwt> lebih dulu (ambil dari sesi login Anda sendiri).")

    if args.full and not args.i_am_data_owner:
        sys.exit(
            "Mode --full memerlukan --i-am-data-owner.\n"
            "Hanya jalankan bila Anda pemilik/pengelola data dan punya dasar hukum\n"
            "untuk memproses data pribadi (UU PDP No. 27/2022)."
        )

    print(f"Mengambil data ({args.mode})…", file=sys.stderr)
    if args.mode == "verval":
        rows, meta = fetch_verval(args, token)
    else:
        rows, meta = fetch_monitoring(args, token)

    if args.full:
        payload = {"meta": meta, "rows": rows}
    else:
        payload = {
            "meta": {**meta, "mode": "masked",
                     "catatan": "Field PII dibuang. Lihat PII_FIELDS di script."},
            "ringkasan": summarize(rows),
            "rows": [mask_row(r) for r in rows],
        }

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"Tersimpan: {args.out} ({len(rows)} baris, mode={'full' if args.full else 'masked'})",
          file=sys.stderr)


if __name__ == "__main__":
    main()
