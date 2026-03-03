#!/bin/bash
set -e

echo "=== Clone iptv-org/epg ==="
if [ ! -d "epg" ]; then
  git clone --depth 1 https://github.com/iptv-org/epg.git
fi

cd epg

echo "=== Install dependencies ==="
npm install

echo "=== Grab France EPG (programme-tv.net) ==="
npm run grab --- \
  --site=programme-tv.net \
  --days=7 \
  --output=guide_france.xml

echo "=== Done ==="

cd ..

# نقل الملف النهائي إلى الجذر
mv epg/guide_france.xml ./epg_france.xml
