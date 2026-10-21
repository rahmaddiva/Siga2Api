#!/usr/bin/env bash
# Segarkan snapshot SIGA secara bulanan.
#
# Dipakai oleh cron / Task Scheduler pada awal bulan:
#
#   # Linux/macOS — tanggal 1 pukul 03:15
#   15 3 1 * *  cd /path/ke/Siga2Api && ./scripts/refresh.sh >> _re/logs/cron.log 2>&1
#
#   # Windows (PowerShell, Task Scheduler):
#   powershell -NoProfile -Command "cd C:\path\Siga2Api; bash scripts/refresh.sh"
#
# Yang dilakukan:
#   1. Panen ulang BULAN LALU + BULAN INI dengan --force, karena data bulan lalu
#      masih bisa disusulkan setelah bulan berganti.
#   2. Panen ulang laporan TAHUNAN tahun berjalan dengan --force, karena isinya
#      bertambah sepanjang tahun.
#   3. index.json digabung per periode, jadi periode lain tidak hilang.
#
# Token tidak diperlukan (endpoint laporan saat ini terbuka). Kalau nanti
# autentikasi ditegakkan, cukup ekspor TOKEN sebelum menjalankan skrip ini.
#
# Argumen tambahan diteruskan ke KEDUA panen, mis. `./scripts/refresh.sh --max 5
# --only dallap` untuk uji cepat.
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON="${PYTHON:-python}"
mkdir -p _re/logs

year="$(date +%Y)"
month="$(date +%m | sed 's/^0*//')"
prev="$((month - 1))"
prev_year="$year"
if [ "$prev" -lt 1 ]; then
  prev=12
  prev_year="$((year - 1))"
fi

stamp="$(date +%Y%m%d-%H%M)"
log="_re/logs/refresh-${stamp}.log"

echo "[$stamp] mulai: bulan $prev_year-$prev s.d. $year-$month" | tee -a "$log"

# Bulan lalu + bulan ini. --force diperlukan: periode ini sengaja diambil ulang
# walau cache sudah ada, supaya angka yang disusulkan ikut masuk.
# Januari membentang dua tahun (Desember tahun lalu + Januari tahun ini), jadi
# dipanggil terpisah — `--years` hanya menerima satu daftar tahun untuk `--months`.
if [ "$month" -eq 1 ]; then
  "$PYTHON" scripts/build_snapshot.py \
    --years "$prev_year" \
    --months 12 \
    --skip-annual \
    --force "$@" 2>&1 | tee -a "$log"
  "$PYTHON" scripts/build_snapshot.py \
    --years "$year" \
    --months 1 \
    --skip-annual \
    --force "$@" 2>&1 | tee -a "$log"
else
  "$PYTHON" scripts/build_snapshot.py \
    --years "$year" \
    --months "$prev,$month" \
    --skip-annual \
    --force "$@" 2>&1 | tee -a "$log"
fi

# Laporan tahunan tahun berjalan: isinya bertambah tiap bulan.
"$PYTHON" scripts/build_snapshot.py \
  --years "$year" \
  --skip-monthly \
  --force "$@" 2>&1 | tee -a "$log"

echo "[$stamp] selesai" | tee -a "$log"
