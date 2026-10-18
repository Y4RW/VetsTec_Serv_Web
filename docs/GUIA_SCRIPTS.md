# Guía de scripts auxiliares de VetStec

Ejecuta los comandos **desde la raíz de PROYECTO MANDUJAS** para que dotenv cargue el archivo .env que está allí.

## Diagnóstico (solo lectura de la base de datos)

| Comando | Función |
|---|---|
| `npm run inspect:db` | Lista tablas y columnas |
| `npm run inspect:checks` | Revisa restricciones CHECK |
| `npm run inspect:relations` | Revisa datos/relaciones de negocios |
| `npm run inspect:registro -- 7` | Revisa un negocio por ID |
| `npm run inspect:citas` | Solicitudes públicas recientes |
| `npm run inspect:contacto` | Mensajes recibidos |

## Pruebas de integraciones (pueden conectar con servicios externos)

| Comando | Función |
|---|---|
| `npm run test:cp -- 09000` | Prueba consulta de código postal |
| `npm run test:email -- destino@ejemplo.com` | Envía correo real de prueba |
| `npm run test:storage -- /ruta/imagen.png` | Sube archivo real a Storage |

## Scripts que modifican la BD: NO ejecutar como pruebas casuales

- `npm run migrate:public`: migración del módulo público.
- `npm run migrate:auth`: migración de usuarios y verificación.
- `npm run seed:public`: crea datos de prueba.

Los archivos de migración se conservan porque son parte del historial técnico del esquema.

## Qué quedó sin mover

- `server.js`: punto de entrada real del backend.
- `routes/`: rutas usadas en ejecución.
- `frontend/`: aplicación React y sus componentes.
- `.env` y `.git/`: no se modifican.

## Respaldo

Antes de organizar, el asistente guarda copias de los archivos que mueve y de los metadatos que edita en `.vetstec-respaldos/`, que se excluye de Git.
