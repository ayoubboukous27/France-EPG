#!/bin/bash
set -e

echo "=== WebGrab+Plus EPG Script ==="

# مسارات
WG_ROOT="WebGrab+Plus/bin"
WEBGRAB_SRC="webgrab"

echo "[1] تجهيز WebGrab+Plus..."
mkdir -p $WG_ROOT/output

echo "[2] نسخ ملفات الإعداد..."
cp $WEBGRAB_SRC/WebGrab++.config.xml $WG_ROOT/
cp $WEBGRAB_SRC/channels/*.xml $WG_ROOT/
cp -r $WEBGRAB_SRC/siteini.pack $WG_ROOT/

echo "[3] تشغيل WebGrab+Plus..."
cd $WG_ROOT
mono WebGrab+Plus.exe

echo "[4] التحقق من ملف EPG..."
if [ -f "output/guide.xml" ]; then
  echo "✔ EPG generated successfully"
  ls -lh output/guide.xml
else
  echo "✖ EPG generation failed"
  exit 1
fi

echo "=== Done ==="
