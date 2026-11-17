
# Bono Dorado – aplicación de actualización de datos

Proyecto base: React + Vite (Vercel) y Node.js + Express (Render) + PostgreSQL/Neon.

## Qué hace
- Busca un registro en la hoja `ORDENADO` por documento o pasaporte.
- Si no existe, muestra: **NO SE ENCUENTRA EN LA BASE DE DATOS**.
- Si existe, muestra sus datos editables. El número de documento queda bloqueado.
- Añade la pregunta sobre no tener cuenta de ahorros/no poder recibir consignaciones.
- Si responde Sí, exige un PDF/JPG/PNG de autorización y los datos de la persona autorizada.
- Guarda los cambios y el archivo de autorización en PostgreSQL (`BYTEA`).

## Estructura
- `backend/`: API y script de importación del Excel.
- `frontend/`: interfaz React.
- `database/schema.sql`: estructura de PostgreSQL.

## 1. Crear la base de datos en Neon
1. Crea un proyecto en Neon y copia la cadena de conexión.
2. Ejecuta el contenido de `database/schema.sql` en el SQL Editor de Neon.
3. Conserva la cadena como secreto; no la publiques ni la pongas en el frontend.

## 2. Importar el Excel
Desde la carpeta `backend`:
```bash
npm install
```
Copia `BONO DORADO_SUSAN VALDERRAMA.xlsx` dentro de `backend/` (no lo subas a GitHub).
Crea `backend/.env` usando `.env.example` y configura `DATABASE_URL`.
Luego:
```bash
npm run import:excel
```
El importador lee solo la hoja `ORDENADO`, ignora filas de totales/resumen y evita duplicar registros por documento. Si lo ejecutas de nuevo, actualiza los datos de la fila existente.

## 3. Ejecutar localmente
Backend:
```bash
cd backend
npm install
npm run dev
```
Frontend (otra terminal):
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
En Windows PowerShell, si `cp` no funciona:
```powershell
Copy-Item .env.example .env
```
La interfaz abre en `http://localhost:5173`.

## 4. Desplegar
### Render (backend)
- Crea un **Web Service** desde el repositorio, Root Directory: `backend`.
- Build Command: `npm install`
- Start Command: `npm start`
- Variables: `DATABASE_URL` (Neon), `FRONTEND_ORIGIN` (URL pública de Vercel), `NODE_ENV=production`.
- No subas el archivo Excel ni `.env` al repositorio.

### Vercel (frontend)
- Importa el mismo repositorio, Root Directory: `frontend`.
- Build Command: `npm run build`
- Output Directory: `dist`
- Variable: `VITE_API_URL=https://TU-API.onrender.com/api`
- Agrega `vercel.json` (ya incluido) para que React Router funcione si luego agregas rutas.

## 5. Campos importados desde Excel
La hoja `ORDENADO` tiene campos de nombres, apellidos, documento, pasaporte, teléfono, correo, Telegram, comprobante/hash, ciudad/departamento, aeropuerto, país, enlace del pasaporte, cuenta bancaria, banco, tipo de cuenta, cantidad de bonos, valor consignado y líder. La columna vacía `Unnamed: 19` y las hojas de consignaciones no se importan.

## IMPORTANTE: seguridad antes de publicar
El archivo original contiene datos personales y bancarios. Esta versión es una **base funcional inicial**, no debe publicarse para uso real sin una capa de verificación de identidad. Saber un número de documento o pasaporte no demuestra que quien consulta sea su titular. Antes de habilitarla públicamente, implementa un código OTP enviado al correo/teléfono registrado, limita intentos, configura HTTPS y restringe el acceso administrativo. No compartas el Excel, credenciales ni la URL privada de la base de datos. Revisa también la autorización de tratamiento de datos personales y el manejo de documentos adjuntos conforme a la normativa aplicable en Colombia.

El archivo de autorización se limita a 5 MB por carga y se guarda dentro de la base de datos. Para volúmenes mayores conviene usar almacenamiento privado de objetos con URLs firmadas.
