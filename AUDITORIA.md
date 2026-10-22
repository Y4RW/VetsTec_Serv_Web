# Auditoría Inicial de Buenas Prácticas - Proyecto VetsTec

| # | Revisión / Criterio | Estado | Observaciones / Justificación técnica |
|---|---|---|---|
| 1 | Existe `.gitignore` que excluye `.env` y dependencias | Cumplido | El archivo `.gitignore` en la raíz excluye explícitamente `node_modules/` y `.env`[cite: 4]. |
| 2 | Existe un archivo `.env` y no hay contraseñas escritas en el código | Cumplido | Se utiliza `.env` en entorno local y está excluido del control de versiones[cite: 4]. |
| 3 | Existe `.env.example` sin valores reales | Falta | No se encuentra el archivo de plantilla `.env.example` en la raíz del repositorio[cite: 4]. |
| 4 | Los endpoints tienen nombres claros, en plural y consistentes | Cumplido | Las rutas están definidas en `server.js` y probadas mediante `test.http`[cite: 4]. |
| 5 | Las respuestas JSON tienen una estructura consistente | Cumplido | Las respuestas de la API mantienen un formato unificado en el backend. |
| 6 | Los endpoints que reciben datos validan la entrada | Incompleto | Falta integrar `express-validator` en todas las rutas POST/PUT/PATCH[cite: 5]. |
| 7 | Las respuestas usan códigos de estado HTTP correctos | Incompleto | Se requiere revisar y asignar estados explícitos (200, 201, 400, 404, 500) en todos los controladores[cite: 5]. |
| 8 | Existe manejo de errores centralizado | Incompleto | Falta implementar el middleware global para captura y formateo de errores[cite: 5]. |
| 9 | El servidor responde de forma controlada a una ruta inexistente (404) | Cumplido | El cliente frontend en React gestiona las rutas no encontradas[cite: 4]. |
| 10 | CORS permite solo los orígenes necesarios (sin uso de `*`) | Incompleto | La configuración de CORS requiere vincularse formalmente a la variable de entorno correspondiente[cite: 5]. |
| 11 | Hay cabeceras de seguridad básicas | Falta | Falta instalar e integrar el middleware `helmet` en el servidor Express[cite: 5]. |
| 12 | El HTML tiene `<head>` completo (charset, viewport, título, descripción) | Cumplido | El archivo `index.html` de Vite incluye la estructura y metadatos requeridos[cite: 4]. |
| 13 | Las fuentes están alojadas localmente | Falta | Es necesario eliminar los enlaces a Google Fonts y migrar las tipografías a archivos `.woff2` locales[cite: 5]. |
| 14 | Existe página 404 personalizada | Cumplido | El frontend cuenta con el componente `NotFoundPage.jsx` dentro de `/src/pages/`[cite: 4]. |
| 15 | Existe archivo `LICENSE` | Falta | El repositorio carece de un archivo de licencia de software en la raíz[cite: 4]. |
| 16 | Existe `README.md` con instrucciones de instalación | Cumplido | El archivo `README.md` está presente en la raíz del proyecto[cite: 4]. |
| 17 | Hay logs de las peticiones en consola o archivo | Falta | Falta integrar la librería `morgan` para el registro de peticiones en el backend[cite: 5]. |
| 18 | Las versiones de dependencias están fijadas | Cumplido | Se incluyen los archivos `package-lock.json` tanto en la raíz como en la carpeta `/frontend`[cite: 4]. |