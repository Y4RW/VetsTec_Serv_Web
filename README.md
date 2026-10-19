# VetsTec
Repository for VetsTec Modular Software development.

# VetStec - Sistema de Gestión Veterinaria y Estética Canina

Este repositorio contiene la arquitectura de servicios e infraestructura contenedorizada para la plataforma VetStec[cite: 1].

## Arquitectura del Sistema
El sistema utiliza **Docker Compose** para orquestar los componentes principales[cite: 1]:
* **Nginx**: Proxy inverso accesible en el puerto `80`[cite: 1].
* **Backend**: API REST basada en Node.js y Express[cite: 1].
* **Base de Datos**: MySQL (`mysql:8.4`) con almacenamiento persistente[cite: 1].

## Prerrequisitos
* Docker Engine v20.10+[cite: 1]
* Docker Compose v2.0+[cite: 1]

## Instrucciones de Clonación e Instalación

1. **Clonar el repositorio:**[cite: 1]
   \`\`\`bash
   git clone <URL_DEL_REPOSITORIO>
   cd VetsTec_Serv_Web
   \`\`\`

2. **Configurar las variables de entorno:**[cite: 1]
   Copia el archivo de ejemplo y ajusta tus credenciales:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

3. **Desplegar la infraestructura con Docker Compose:**[cite: 1]
   \`\`\`bash
   docker compose up --build -d
   \`\`\`

4. **Verificar el estado de los servicios:**[cite: 1]
   \`\`\`bash
   docker ps
   \`\`\`

## Enlaces de Acceso
* **API REST / Backend:** `http://localhost:3000`
* **Documentación Interactiva (Swagger UI):** [http://localhost:3000/api-docs](http://localhost:3000/api-docs)[cite: 11]

## Variables de Entorno

| Variable | Descripción | Ejemplo / Valor |
| :--- | :--- | :--- |
| `PORT` | Puerto de escucha del servidor Node.js | `3000` |
| `DB_HOST` | Host o nombre del contenedor de la base de datos | `db` |
| `DB_USER` | Usuario de conexión a MySQL | `root` |
| `DB_PASSWORD` | Contraseña de acceso a MySQL | *[Tu contraseña]* |
| `DB_NAME` | Nombre de la base de datos | `vetstec` |