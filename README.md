# ⚖️ Sistema Web para Estudio Jurídico

Sistema web integral para la gestión interna de un estudio jurídico, desarrollado con Node.js, Express y SQLite.

Incluye panel administrativo, gestión de clientes, casos, documentos, turnos y autenticación segura.

---

## 📌 Características

✔ Autenticación de administradores  
✔ Panel de control (Dashboard)  
✔ Gestión de clientes (CRUD)  
✔ Gestión de casos legales  
✔ Agenda de turnos  
✔ Gestión de documentos  
✔ Control de sesiones con cookies seguras  
✔ Base de datos SQLite  
✔ Interfaz web responsive  

---

## 🧱 Stack Tecnológico

### Backend
- Node.js
- Express.js
- SQLite (better-sqlite3)
- bcrypt
- express-session / cookies
- dotenv

### Frontend
- HTML
- CSS (Tailwind)
- JavaScript Vanilla

### Infraestructura
- Variables de entorno (.env)
- Deploy en VPS / Linux (producción)

---

## 📁 Estructura del Proyecto

estudio-juridico/<br>
│<br>
├─ server/<br>
│ ├─ app.js<br>
│ ├─ routes/<br>
│ ├─ middleware/<br>
│ ├─ db/<br>
│<br>
├─ public/<br>
│ ├─ admin/<br>
│ ├─ assets/<br>
│ ├─ js/<br>
│<br>
├─ data/<br>
│ └─ app.sqlite<br>
│<br>
├─ .env<br>
├─ package.json<br>
└─ README.md<br>


---

## ⚙️ Instalación

### 1️⃣ Clonar repositorio

```bash
git clone <url-del-repo>
cd estudio-juridico
npm install
Crear archivo .env:

PORT=3000
SESSION_SECRET=tu_clave_secreta
SESSION_DAYS=7
SESSION_COOKIE_NAME=sid
NODE_ENV=development

Iniciar servidor:
npm run dev
Servidor corriendo en:
http://localhost:3000
```
## 🔐 Acceso Administrativo

Ruta de login:
/admin/login

Panel:
/admin

## Endpoints principales
| Recurso    | Ruta              |
| ---------- | ----------------- |
| Login      | /api/admin/login  |
| Logout     | /api/admin/logout |
| Perfil     | /api/admin/me     |
| Clientes   | /api/clients      |
| Casos      | /api/cases        |
| Turnos     | /api/appointments |
| Documentos | /api/documents    |
| Abogados   | /api/lawyers      |

## Seguridad
- Cookies HttpOnly
- Hash de sesiones
- Middleware de autorización
- Roles
- Validación de datos
- Protección contra accesos no autorizados

## Estado del Proyecto
MVP Funcional<br>
✔ Autenticación<br>
✔ CRUD principal<br>
✔ Dashboard<br>
✔ Gestión básica<br>
⏳ IA (en desarrollo)<br>
⏳ RAG jurídico (futuro)<br>

## 📜 Licencia
### ⚠️ Licencia Propietaria – Uso Restringido

Copyright &copy; 2026 Ramiro Rahman Rintoul

Este software es propiedad intelectual del autor.

Está PROHIBIDO:

❌ Copiar <br>
❌ Redistribuir <br>
❌ Vender <br>
❌ Modificar <br>
❌ Usar comercialmente <br>
❌ Publicar <br>
❌ Reutilizar 

sin autorización expresa y por escrito del autor.

Solo está permitido:

✅ Uso con permiso del autor <br>
✅ Uso bajo contrato firmado <br>
✅ Uso autorizado por escrito 

<strong> Cualquier uso no autorizado será considerado una violación de derechos de autor. </strong> <br>

## 📩 Contacto

Para licencias, permisos o uso comercial:

📧 Email: [Mail Personal](rrahmanrintoul@gmail.com) <br>
🌐 GitHub: [Github Personal](https://github.com/GatoLocoYT)

