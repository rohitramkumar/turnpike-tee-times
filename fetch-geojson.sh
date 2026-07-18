#!/usr/bin/env bash
# fetch-geojson.sh
# Download NJ counties GeoJSON into data/nj-counties.geojson

set -e
mkdir -p data
URL="https://opendata.arcgis.com/datasets/58d0bbaef3b942efbfa8a311cf52c061_1.geojson"
OUT="data/nj-counties.geojson"

echo "Downloading NJ counties GeoJSON from $URL to $OUT"
curl -L "$URL" -o "$OUT"
echo "Done. Saved $OUT"
