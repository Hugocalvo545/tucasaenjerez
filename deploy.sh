#!/bin/bash
# deploy.sh — Script de deploy para JLA Apartments
# Uso: bash deploy.sh
# Actualiza la versión del SW y despliega en Firebase Hosting

FECHA=$(date +%Y%m%d)

echo "Actualizando service workers a version v$FECHA..."

sed -i "s/jla-public-v[0-9]*/jla-public-v$FECHA/g" public/sw.js
echo "  OK public/sw.js"

sed -i "s/jla-intranet-v[0-9]*/jla-intranet-v$FECHA/g" public-admin/intranet/service-worker.js
echo "  OK public-admin/intranet/service-worker.js"

echo ""
echo "Desplegando en Firebase..."
firebase deploy --only hosting

echo ""
echo "Deploy completado. Version: v$FECHA"
