#!/bin/bash
set -e
# Script de automatización de despliegue para VetsTec_Serv_Web

echo "=================================================="
echo "    Iniciando despliegue automatizado VetsTec     "
echo "=================================================="

# 1. Verificar y crear el archivo .env si no existe
# Comprobar configuración del entorno
if [ ! -f .env ]; then
    echo "ERROR: Falta el archivo .env."
    echo "Configura las variables de VetStec antes del despliegue."
    exit 1
fi

# 2. Construir y levantar los contenedores con Docker Compose
echo "[2/2] Construyendo imágenes y levantando servicios..."
# Instalar dependencias y compilar React
echo "Preparando frontend de VetStec..."
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend run build
docker compose up --build -d

echo "=================================================="
echo "          ¡Despliegue completado con éxito!       "
echo "=================================================="
echo "👉 Frontend disponible en: http://localhost:8080"
echo "👉 Swagger UI (API Docs): http://localhost:3000/api-docs"
echo "=================================================="
