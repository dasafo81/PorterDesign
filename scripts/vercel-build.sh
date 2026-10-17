#!/bin/sh
# Build na Vercelu (pole buildCommand w vercel.json ma limit 256 znaków, dlatego kroki są tutaj).
# Wynik: landing pod "/" (dist/index.html), aplikacja pod "/app" (dist/app/index.html).
set -eu
rm -rf node_modules/.vite
npm run build
mkdir -p dist/app
mv dist/index.html dist/app/index.html
cp register.html privacy.html terms.html dpa.html manifest.json icon-192.png icon-512.png apple-touch-icon.png dist/
cp landing.html dist/index.html
