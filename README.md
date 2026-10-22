# VetsTec
Repository for VetsTec Modular Software development.

# VetStec - Sistema de Gestión Veterinaria y Estética Canina

Este repositorio contiene la arquitectura de servicios e infraestructura contenedorizada para la plataforma VetStec.

## Arquitectura del Sistema

VetStec utiliza las siguientes tecnologías:

- Frontend: React con Vite.
- Backend: Node.js con Express.
- Base de datos: PostgreSQL mediante Supabase.
- Autenticación: sesiones, roles y permisos.
- Documentación API: OpenAPI y Swagger UI.

## Infraestructura Docker

Docker Compose configura dos servicios:

- Backend: Node.js y Express, publicado en el puerto 3000.
- Frontend: Nginx, publicado en el puerto 8080.

La base de datos es PostgreSQL mediante Supabase y se configura
mediante las variables de entorno del backend. Compose no incluye
un servicio de MySQL.

El script `deploy.sh` instala las dependencias del frontend,
genera la compilación de Vite en `frontend/dist` y levanta
los servicios con Docker Compose.

Nginx sirve esa compilación, redirige `/api/` al backend y
permite acceder directamente a las rutas de React.

La configuración de Compose y la sintaxis de `deploy.sh` fueron
comprobadas. El despliegue completo y su funcionamiento integrado
siguen pendientes de validar.

## Prerrequisitos

- Docker Engine y Docker Compose v2.
- Node.js y npm en el equipo que ejecutará `deploy.sh`,
  porque el frontend se compila antes de levantar los contenedores.
- Acceso al proyecto de Supabase y su configuración.
- Configuración de correo y códigos postales para utilizar esas funciones.

## Instrucciones de instalación

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Y4RW/VetsTec_Serv_Web.git
   cd VetsTec_Serv_Web
   ```

2. Preparar las variables de entorno.

   Si todavía no existe `.env`, crear una copia de `.env.example`.
   Completar los valores con la configuración del entorno.
   Conservar el `.env` existente si ya está configurado.

   Los valores de ejemplo corresponden al desarrollo local.
   Ajustar `NODE_ENV` y `FRONTEND_URL` al entorno de destino.

3. Procedimiento de despliegue pendiente de validar:

   ```bash
   bash deploy.sh
   ```

   Este script compila el frontend antes de ejecutar Docker Compose.

4. Consultar el estado y los registros de los servicios:

   ```bash
   docker compose ps
   docker compose logs --tail=100 backend frontend
   ```

## Enlaces del despliegue local con Docker

- Frontend: http://localhost:8080
- Backend: http://localhost:3000
- Swagger UI: http://localhost:3000/api-docs

Estos enlaces corresponden a los puertos configurados.
Su funcionamiento completo sigue pendiente de validar.

## Variables de entorno

Las siguientes variables se consultan directamente en el código
JavaScript revisado. Su necesidad depende de la función y del
entorno utilizado.

| Variable | Finalidad |
| --- | --- |
| `PORT` | Puerto del servidor backend. |
| `NODE_ENV` | Entorno de ejecución. |
| `FRONTEND_URL` | Dirección del frontend utilizada por el backend. |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. |
| `SUPABASE_URL` | Dirección del proyecto de Supabase. |
| `SUPABASE_PUBLISHABLE_KEY` | Clave publicable de Supabase, conservada de la plantilla anterior. |
| `SUPABASE_SECRET_KEY` | Clave privada utilizada por el backend. |
| `EMAIL_USER` | Cuenta utilizada para enviar correo. |
| `EMAIL_APP_PASSWORD` | Credencial de aplicación para el envío de correo. |
| `CODIGOS_POSTALES_API_KEY` | Clave del servicio de códigos postales. |


`.env.example` contiene únicamente una plantilla.
Las credenciales reales deben configurarse en `.env`.

## Prerrequisitos
* Docker Engine v20.10+
* Docker Compose v2.0+

## Instrucciones de Clonación e Instalación

1. **Clonar el repositorio:**
   \`\`\`bash
   git clone <URL_DEL_REPOSITORIO>
   cd VetsTec_Serv_Web
   \`\`\`

2. **Configurar las variables de entorno:**
   Copia el archivo de ejemplo y ajusta tus credenciales:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. **Desplegar la infraestructura con Docker Compose:**
   \`\`\`bash
   docker compose up --build -d
   \`\`\`

4. **Verificar el estado de los servicios:**
   \`\`\`bash
   docker ps
   \`\`\`

## Enlaces de Acceso
* **API REST / Backend:** `http://localhost:3000`
* **Documentación Interactiva (Swagger UI):** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)

## Variables de Entorno

| Variable | Descripción | Ejemplo / Valor |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha del servidor Node.js | `3000` |
| `DB_HOST` | Host o nombre del contenedor de la base de datos | `db` |
| `DB_USER` | Usuario de conexión a MySQL | `root` |
| `DB_PASSWORD` | Contraseña de acceso a MySQL | *[Tu contraseña]* |
| `DB_NAME` | Nombre de la base de datos | `vetstec` |