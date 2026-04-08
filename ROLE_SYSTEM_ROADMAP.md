# Role System Roadmap (Step by Step)

Fecha: 2026-03-07
Ultima actualizacion: 2026-04-07

Este roadmap divide la implementacion en entregas pequenas para evitar una sola tarea pesada.

## Paso 1 (hecho en archivos): Fundacion de datos
- Migracion base creada: `supabase/sql/004_roles_and_organizations_foundation.sql`
- Incluye:
  - Roles en `profiles`: `general_user`, `event_organizer`, `admin`, `superadmin`.
  - Proteccion para no eliminar/degradar el ultimo `superadmin`.
  - Capabilidades por administrador (`admin_capabilities`).
  - Parametros globales (`app_settings`).
  - Tipos de organizacion configurables (`organization_types`).
  - Horarios de administradores (`admin_availability`).
  - Solicitudes de creacion de organizacion (`organization_creation_requests`).
  - Organizaciones aprobadas (`organizations`).
  - Cuenta de login de organizacion y OTP (`organization_accounts`, `organization_one_time_codes`).
  - Regla inicial para organizadores de eventos: no unirse a planes de otros organizadores.

## Paso 2: Integrar roles al flujo actual (implementado)
- Objetivo:
  - Onboarding debe guardar el rol.
  - Dashboard debe mostrar opciones por rol.
- Entregables:
  - Guards de navegacion por rol en rutas clave.
  - Restricciones activas:
    - `general_user` no puede crear planes.
    - `event_organizer` puede crear planes, pero no unirse a planes de otros organizadores.
  - UI adaptada por rol en dashboard y feed de planes.
  - Pendiente del paso 2:
    - Selector/control de rol inicial para pruebas internas.

## Paso 3: Flujo de solicitudes de organizacion (usuario general) (baseline implementado)
- Objetivo:
  - Formulario para solicitar creacion de organizacion.
- Entregables:
  - Pantalla de solicitud con:
    - contacto
    - nombre de organizacion
    - tipo (Club/Capitulo/Federacion/Otro)
    - seleccion de admin
    - horario de reunion (30 min base)
    - plataforma y link
  - Validacion condicional:
    - Si no hay admins con horarios, la solicitud queda pendiente de asignacion.
    - Si hay horarios activos, valida administrador + slot/plataforma.

## Paso 4: Panel administrador (review)
- Objetivo:
  - Ver y aprobar/rechazar solicitudes.
- Entregables:
  - Lista de solicitudes con detalle completo.
  - Advertencias de aprobacion segun fecha de reunion.
  - Configuracion de tipos de organizacion.
  - Configuracion de horarios y link por defecto del admin.

## Paso 5: Gobernanza de administradores
- Objetivo:
  - Gestionar promociones/degradaciones con reglas de antiguedad.
- Entregables:
  - Promover usuario general -> admin.
  - Restricciones de antiguedad entre admins.
  - Permisos por admin para gestionar roles.

## Paso 6: Superadmin y login de organizacion
- Objetivo:
  - Completar gobernanza total y entrada separada para organizaciones.
- Entregables:
  - Login separado de superadmin.
  - Superadmin puede desactivar gestion de roles admin (global/individual).
  - Flujo OTP para cuentas de organizaciones aprobadas.
  - Primera entrada de organizacion con creacion de password.

## Estado real al 2026-04-07
- Paso 1: completado.
- Paso 2: completado.
- Paso 3: completado (baseline + operacion).
- Paso 4: completado.
- Paso 5: completado.
- Paso 6: mayormente completado (login superadmin, OTP, primer acceso con password, dashboard y navegacion).

## Pendientes de cierre MVP (fuera del sistema de roles)
- Responsive completo en todas las pantallas clave.
- PWA instalable + fallback offline basico.
- Analitica base para embudo de activacion.
- Checklist de release + smoke tests post deploy.

## Sprint operativo recomendado (7 dias)
Dia 1
- Actualizar documentos de estado y congelar alcance de la semana.
- Definir lista final P0/P1 con criterio de aceptacion por item.

Dia 2
- Cerrar responsive de pantallas criticas (login, onboarding, dashboard, planes, chat, admin).

Dia 3
- Completar PWA (manifest, iconos, instalacion, service worker basico).

Dia 4
- Instrumentar eventos base (signup_completed, onboarding_completed, plan_created, plan_joined, message_sent).

Dia 5
- Hardening de flujos admin/superadmin/organizacion (solicitud, aprobacion, OTP, acceso, roles, auditoria).

Dia 6
- QA integral + correcciones de bugs bloqueantes.

Dia 7
- Release a produccion + smoke test + reporte de salida.

## Checklist de ejecucion por sprint
- Ejecutar en Supabase SQL Editor:
  - `supabase/sql/004_roles_and_organizations_foundation.sql`
- Ejecutar sincronizacion de correo en `profiles` si aplica:
  - `supabase/sql/008_sync_email_auth_users_profiles.sql`
- Confirmar que no rompe lo existente:
  - Login
  - Onboarding
  - Planes (crear/unirse/chat)
- Flujos de organizaciones (solicitud, aprobacion, OTP, password)
- Flujos de admin/superadmin (roles, availability, requests, audit)
