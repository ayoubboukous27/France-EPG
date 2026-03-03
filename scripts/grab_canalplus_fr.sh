#!/bin/bash
set -e

echo "=== Clone iptv-org/epg ==="
if [ ! -d "epg" ]; then
  git clone --depth 1 https://github.com/iptv-org/epg.git
fi

cd epg

echo "=== Install dependencies ==="
npm install

echo "=== Create Data folder ==="
mkdir -p ../Data

echo "=== Grab Canal+ France EPG ==="
TZ=Europe/Paris npm run grab --- \
  --site=canalplus.com \
  --channels=sites/canalplus.com/canalplus.com_fr.channels.xml \
  --days=7 \
  --output=../Data/guide_canalplus_fr.xml

echo "=== Done ==="
