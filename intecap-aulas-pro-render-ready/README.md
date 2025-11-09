# Intecap Aulas PRO v6 (Full API + Croquis)
- Login/Registro con JWT y roles (admin/tecnico/instructor).
- Dashboard con **croquis** de aulas (tarjetas posicionadas, color por aula, estado en vivo con Socket.IO).
- Reservar / liberar con validación de no solape.
- Ver recursos por aula (heredan color del aula origen; distingue prestados).
- Reportes de daño con foto (multer). Técnico marca reparado.
- Admin: CRUD de aulas + asignación de recursos.
- Historial y notificaciones internas.

## Ejecutar
```bash
npm install
copy .env.example .env   # o cp .env.example .env
npm start
# http://localhost:3000
# Admin inicial: admin@intecap.gt / Admin123!
```
