# --- ETAPA 1: Compilación del Frontend (React + Vite) ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- ETAPA 2: Servidor de Producción (Express + Frontend compilado) ---
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copiar código del backend (ajusta si tus rutas/controladores están en carpetas específicas)
COPY . .

# Traer el frontend ya compilado desde la Etapa 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Asegurar carpeta para evidencias/imágenes subidas con multer
RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
