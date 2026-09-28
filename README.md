# Finplan

Planificación mensual de finanzas personales con Next.js, React, TypeScript y Supabase. Interfaz en español argentino, responsive, con modo oscuro y datos de demostración de septiembre de 2026.

## Ejecutar

```sh
npm install
npm run dev
```

Abrí http://localhost:3000. Sin configurar Supabase o sin iniciar sesión, el espacio local guarda los cambios en `localStorage`. Al iniciar sesión, la fuente principal pasa a ser la base de datos de tu cuenta.

## Configurar Supabase

1. Creá un proyecto Supabase.
2. Ejecutá las migraciones pendientes en orden, en SQL Editor o con Supabase CLI:
   - `supabase/migrations/202609280001_financial_plans.sql`
   - `supabase/migrations/202609280002_relational_finance.sql`
   - `supabase/migrations/202609280003_account_scoped_writes.sql`
3. Ejecutá solo las pendientes. Si ya aplicaste la primera y la segunda, ejecutá **solo la tercera**: actualiza la función de guardado con verificación de cuenta y elimina la firma anterior, sin modificar datos financieros.
4. Copiá `.env.example` a `.env.local` y completá URL y publishable key. Nunca uses una service role key en el cliente.
5. En Authentication / URL Configuration configurá Site URL con `http://localhost:3000` y agregá a Redirect URLs `http://localhost:3000/login` y `http://localhost:3000/auth/reset-password`. Agregá también esas rutas con tu dominio de producción.
6. Reiniciá Next. En `/login` podés ingresar con correo y contraseña o recibir un enlace mágico. La opción Olvidé mi contraseña envía un enlace para elegir una nueva. Desde Configuración también podés crear o cambiar tu contraseña si entraste mediante enlace mágico.

Con Supabase configurado, la app muestra el login cuando no hay sesión. Explorar la demo permite acceder explícitamente al espacio local, separado de la cuenta. Los enlaces mágicos permiten crear una cuenta en el primer acceso, según la configuración de registros de Supabase. La seguridad de los datos se aplica en la base mediante RLS y los RPC; el acceso visual del cliente no reemplaza esos controles.

Las migraciones están versionadas en este proyecto; ejecutarlas localmente en tests no las aplica al proyecto remoto.

## Modelo de datos

Los datos financieros se almacenan en filas y columnas tipadas, no en un documento JSONB.

| Tabla | Contenido |
| --- | --- |
| `categories` | Categorías de pagos, por usuario |
| `credit_cards` | Tarjetas referenciadas por pagos y cuotas |
| `payments` | Obligaciones, importes, moneda, vencimiento y estado inicial |
| `incomes` | Ingresos previstos, confirmados y cobrados |
| `recurrences` | Frecuencia de un pago o ingreso |
| `installment_plans` | Cantidad finita de cuotas mensuales de un pago |
| `monthly_overrides` | Cambios de monto, estado y otros campos para un mes concreto |
| `finance_accounts` | Versión de la planificación para detectar conflictos |
| `financial_plans` | Respaldo histórico de la primera versión, ahora solo lectura |

Cada tabla pertenece a un usuario de Supabase Auth. Las claves foráneas incluyen `user_id`, evitando referencias a categorías o pagos de otra persona. RLS protege las lecturas. Importes usan `numeric(16,2)`; estados, monedas, frecuencias y referencias tienen restricciones SQL. Las categorías y tarjetas usan su nombre como clave natural dentro de cada cuenta. Un cambio de nombre de categoría reasigna las referencias en una transacción.

Los recurrentes se calculan al consultar cada mes, sin cron. Su estado se reinicia por período; los ingresos futuros comienzan estimados. Un vencimiento del día 31 usa el último día en meses más cortos. Los cambios desde un mes en adelante crean una nueva versión de la obligación, preservando los meses anteriores.

## Guardado automático y conflictos

- La app carga la cuenta al iniciar sesión o recargar. Las cuentas nuevas empiezan vacías.
- Cada edición envía únicamente filas nuevas, modificadas o eliminadas mediante `finance_write`. La operación completa es una transacción.
- El RPC comprueba la identidad y la versión esperada, y bloquea la fila de control mientras guarda. Un dispositivo con una versión antigua recibe un conflicto, en lugar de sobrescribir otro guardado.
- Mientras guarda se bloquean nuevas ediciones. Si falla, la app conserva un borrador local separado por cuenta y permite reintentar o descargarlo. No cambia silenciosamente a guardado local.
- Si hay un conflicto, descargá los cambios pendientes y cargá la versión de tu cuenta. No hay fusión automática de ediciones concurrentes.
- Al cerrar sesión se vuelve al espacio local original. Los datos de la cuenta no se copian a ese espacio.
- No hay actualización en vivo entre dispositivos. Usá Actualizar desde mi cuenta o recargá; los intentos de escritura desactualizados siempre se rechazan.

Las escrituras directas desde el cliente están revocadas para que no puedan saltear el control de versión. Las funciones públicas `finance_read` y `finance_write` son `SECURITY DEFINER`, con `search_path` vacío, usuario derivado de `auth.uid()`, validación de cuenta esperada, lista fija de tablas y ejecución limitada a `authenticated`. La función interna de escritura no puede invocarse desde el cliente. JSON es el formato de transporte del RPC, no el almacenamiento financiero.

## Migración de datos anteriores

La segunda migración convierte todos los respaldos existentes en `financial_plans` a las tablas nuevas dentro de una transacción. Conserva identificadores, categorías, importes, estados, recurrencias, cuotas y excepciones mensuales. El JSON original queda intacto y solo lectura.

Si encuentra datos incompatibles, la migración falla y se revierte, sin omitir filas silenciosamente. Hacé un respaldo de la base antes de aplicarla en producción y probala primero en un proyecto de prueba con una copia de tus datos. Las pruebas incluidas cubren los datos generados por esta versión; no reemplazan esa revisión de tus datos reales.

Los datos guardados **solo en el navegador** no están disponibles para SQL. Para una cuenta vacía, Configuración ofrece Importar datos de este navegador con confirmación. No se importan ejemplos automáticamente ni se reemplaza una cuenta existente. Podés seguir exportando un JSON desde Tu información.

## Verificación

```sh
npm test
npm run lint
npm run build
```

Incluye cálculo, monedas independientes, historial, recurrencias, categorías, conversión relacional y ejecución real de ambas migraciones en PostgreSQL embebido (PGlite). Se prueban backfill, políticas de acceso, claves foráneas entre usuarios, rollback de transacciones y rechazo de versiones antiguas. El esquema Auth mínimo del test simula las identidades; no envía correos ni contacta un proyecto Supabase real.

Con `npm run dev` activo, `node scripts/smoke.cjs` prueba la interfaz local usando Edge headless. `node scripts/auth-smoke.cjs` prueba contraseña, enlace mágico, recuperación, cambio de contraseña, cierre de sesión y móvil. Intercepta todas las solicitudes de autenticación: no envía correos ni modifica usuarios reales.

Para probar la interfaz conectada, en otra terminal PowerShell:

```powershell
$env:FINPLAN_BUILD_DIR='.next-integration'
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='integration-test-public-key'
npm run dev -- --port 3001
```

Después ejecutá `npx tsx scripts/relational-smoke.ts`. Intercepta HTTP de Supabase y ejecuta los RPC reales contra PGlite. Verifica guardado por filas, recuperación de errores, conflictos, aislamiento del espacio local y cierre de sesión. Las credenciales de este bloque son ficticias, solo para la prueba interceptada.

## Alcance y próximos pasos

La estructura permite agregar consultas por mes, paginación, informes e índices sin convertir un documento por usuario. Por ahora la app todavía carga las filas completas de una cuenta para calcular la proyección en el navegador. Cuando crezca el historial, habrá que limitar lecturas por período; no se promete escala ilimitada sin ajustes.

La tarjeta Santander y sus fechas de cierre son datos de demostración, no una conexión bancaria. Evitá contabilizar la misma compra como resumen y cuota. No hay conciliación bancaria ni importación de Excel. ARS y USD se muestran por separado. Disponible hoy = ingresos cobrados menos pagos realizados; no incluye saldo inicial de cuenta.

Documentación: [Next.js](https://nextjs.org/docs/app/getting-started/installation), [funciones de Supabase](https://supabase.com/docs/guides/database/functions), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
