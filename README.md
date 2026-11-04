# Habit League

PWA de hábitos para un grupo de amigos: check diario, XP, rachas y ranking del grupo. Ver [docs/PRODUCT.md](docs/PRODUCT.md).

## Puesta en marcha

### 1. Supabase (plan gratuito)
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → pegá todo [supabase/schema.sql](supabase/schema.sql) → *Run*. Después, cada una en una consulta nueva y en este orden: [002](supabase/migrations/002_quiz_personas_puntos.sql), [003](supabase/migrations/003_grupo_objetivos_fotos.sql), [004](supabase/migrations/004_liga_juicio_cofre.sql) y [005](supabase/migrations/005_vicios.sql) → *Run*. Si después re-ejecutás una, re-ejecutá también las siguientes. La 003 también crea el bucket privado de fotos `evidencias` en Storage.
3. **Authentication → Sign In / Providers → Email**: para un grupo de amigos conviene **desactivar "Confirm email"**.
   El SMTP integrado de Supabase solo manda unos pocos correos por hora; con la confirmación activada,
   varios amigos registrándose a la vez pueden quedarse sin correo. (Alternativa: configurar un SMTP propio.)
4. **Authentication → URL Configuration**: pon en *Site URL* la URL donde publiques la app
   (y `http://localhost:5173` en *Redirect URLs* para desarrollo).
5. **Project Settings → API**: copia la *Project URL* y la clave *anon / publishable*.

### 2. App
```bash
cp .env.example .env.local   # y rellena las dos variables
npm install
npm run dev                  # http://localhost:5173
```
Para probar en el móvil en la misma red: `npm run dev -- --host` y abre la IP que muestra.
(El service worker y la instalación necesitan HTTPS fuera de localhost: pruébalo ya publicado.)

### 3. Instalar en el teléfono
- **iPhone**: abrir la URL en Safari → Compartir → *Añadir a pantalla de inicio*.
- **Android**: Chrome → menú → *Instalar aplicación* (la app también muestra un botón).

## Administración

### Alguien se olvidó la contraseña
Nadie puede ver una contraseña (Supabase guarda solo un hash). Se pone una nueva desde **Supabase → SQL Editor**
(cambiá el email y la clave temporal; la persona después la cambia en Perfil → Cambiar contraseña):

```sql
update auth.users
set encrypted_password = extensions.crypt('ClaveTemporal123', extensions.gen_salt('bf')),
    updated_at = now()
where email = 'persona@ejemplo.com';
```

Debe devolver `UPDATE 1`. Si devuelve `UPDATE 0`, el email no coincide (mirá en Authentication → Users).
Fuente del método: [discusión de Supabase #25977](https://github.com/orgs/supabase/discussions/25977).

## Comandos
| | |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Type-check + build de producción en `dist/` |
| `npm test` | Tests del SQL (RLS, rachas, ranking, zonas horarias) sobre PGlite, sin Supabase |
| `npm run icons` | Regenera los PNG de los iconos |
| `npm run catalog` | Regenera los datos de las migraciones 003, 004 y 005 desde `content/` |

## Hosting: GitHub Pages (gratis)
La app se publica sola en `https://<usuario>.github.io/habit-league/` con cada push a `main`
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): instala, corre los tests, compila y publica.

Con GitHub Free el repositorio tiene que ser **público** (el código queda visible; no hay claves en él
y los datos están protegidos por RLS en Supabase).

Configuración única en GitHub:
1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → New repository secret**:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la anon/publishable, **nunca** la service_role).
3. **Actions → Deploy a GitHub Pages → Run workflow** (o haz cualquier push).
4. En Supabase → Authentication → URL Configuration: *Site URL* = `https://<usuario>.github.io/habit-league/`.

Si el repo se llama distinto, la ruta se adapta sola (usa el nombre del repo).
