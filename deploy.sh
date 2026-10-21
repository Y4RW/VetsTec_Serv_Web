#!/bin/bash
# Script de automatización de despliegue para VetsTec_Serv_Web

echo "=================================================="
echo "    Iniciando despliegue automatizado VetsTec     "
echo "=================================================="

# 1. Verificar y crear el archivo .env si no existe
if [ ! -f .env ]; then
    echo "[1/2] Creando archivo .env a partir de .env.example..."
    cp .env.example .env
    echo "¡Archivo .env generado con éxito!"
else
    echo "[1/2] El archivo .env ya existe, omitiendo copia."
fi

# 2. Construir y levantar los contenedores con Docker Compose
echo "[2/2] Construyendo imágenes y levantando servicios..."
docker compose up --build -d

echo "=================================================="
echo "          ¡Despliegue completado con éxito!       "
echo "=================================================="
echo "👉 Frontend disponible en: http://localhost:8080"
echo "👉 Swagger UI (API Docs): http://localhost:3000/api-docs"
echo "=================================================="
