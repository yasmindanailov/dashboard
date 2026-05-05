/**
 * ═══════════════════════════════════════════════════════════════
 * AELIUM PBAC — Centralized Permissions Definition
 * ═══════════════════════════════════════════════════════════════
 *
 * Fuente de verdad para permisos por rol.
 * Derivado de:
 *   - DECISIONS.md §14 (roles y permisos)
 *   - DECISIONS.md §35 (partner dashboard)
 *   - PARTNER_DECISIONS.md (partner access scope)
 *   - ROADMAP.md Sprint 5 (permissions matrix)
 *
 * Convenciones:
 *   - 'manage' = full CRUD (create, read, update, delete)
 *   - 'own'    = only resources belonging to the user (filtered by user_id)
 *   - 'partner_scoped' = only resources of the partner's clients
 *   - Cada subject corresponde a un módulo/recurso del sistema
 *
 * IMPORTANTE:
 *   Este archivo se importa tanto en el backend (ability factory)
 *   como una versión reducida se replica en el frontend (sidebar filtering).
 *   Si se modifica aquí, actualizar también frontend/app/lib/permissions.ts.
 */

// ─── Actions ────────────────────────────────────────────────────

export enum Action {
  Manage = 'manage', // Full CRUD (superadmin shortcut)
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  List = 'list',
}

// ─── Subjects ───────────────────────────────────────────────────
//
// Cada subject corresponde a un módulo/recurso.
// Usamos strings en lugar del modelo Prisma directamente para
// desacoplar la capa de permisos del ORM.

export enum Subject {
  // Core
  All = 'all', // Wildcard — matches everything
  Dashboard = 'Dashboard',
  Profile = 'Profile', // "Mi perfil" — datos propios del usuario

  // CRM
  Client = 'Client',
  BillingProfile = 'BillingProfile',
  ClientNote = 'ClientNote',

  // Products
  Product = 'Product',
  ProductCategory = 'ProductCategory',

  // Billing
  Invoice = 'Invoice',
  Payment = 'Payment',

  // Support
  Conversation = 'Conversation',
  Message = 'Message',

  // Tasks — Sprint 16 Fase 16.B (ADR-079).
  // El sistema de tags se eliminó: el `source_system` da la categoría implícita.
  // `Subject.Task` permanece con permisos refinados §3.10:
  //   - superadmin: Manage (todas, incl. reasignar entre agentes).
  //   - agent_full: Read+Update sobre own + cola pública.
  //   - agent_billing/agent_support: Read+Update sobre own.
  //   - client/partner: sin acceso.
  Task = 'Task',
  Maintenance = 'Maintenance',

  // Audit & Notifications
  AuditLog = 'AuditLog',
  Notification = 'Notification',
  // ADR-067 — Plantillas de notificaciones (solo superadmin puede gestionarlas).
  // El control vivía con `AdminOnlyGuard` puro hasta Sprint 9.6; ahora se delega
  // a CASL para granularidad declarativa coherente con el resto de Subjects.
  NotificationTemplate = 'NotificationTemplate',

  // Infrastructure
  Server = 'Server',
  DockerTemplate = 'DockerTemplate',

  // Settings
  Setting = 'Setting',
  Agent = 'Agent', // Gestión de agentes (crear, editar)
  // Sprint 15A (ADR-080) — Plugin Framework. Habilitar/deshabilitar plugins
  // de provisioning + editar config + secretos cifrados. Admin-puro: el
  // patrón es idéntico a `NotificationTemplate` / `Job` (ADR-067) — solo
  // superadmin puede gestionarlos porque editar la config de un plugin
  // implica acceso a credenciales del proveedor (Stripe API key, Enhance
  // CP api_key, etc.).
  Plugin = 'Plugin',

  // Promotions & Discounts
  Promotion = 'Promotion',
  DiscountCode = 'DiscountCode',

  // Partner module
  Partner = 'Partner', // Gestión de partners (admin view)
  PartnerClient = 'PartnerClient', // Clientes del partner (partner view)
  PartnerCommission = 'PartnerCommission',
  PartnerPayout = 'PartnerPayout',
  PartnerTicket = 'PartnerTicket',
  PartnerNote = 'PartnerNote',
  PartnerNotification = 'PartnerNotification',
  PartnerLink = 'PartnerLink', // Vinculación cuenta partner-cliente
  PartnerUnlink = 'PartnerUnlink', // Solicitudes de desvinculación

  // Referrals
  Referral = 'Referral',

  // Knowledge Base
  KnowledgeBase = 'KnowledgeBase',

  // Error Log
  ErrorLog = 'ErrorLog',

  // ADR-067 — Operaciones de plataforma sobre BullMQ jobs (DLQ + retry).
  // Solo superadmin puede gestionarlos: reintentar un job re-ejecuta side
  // effects (emails, PDFs, integraciones) con impacto operacional.
  Job = 'Job',

  // Service (instancias contratadas)
  Service = 'Service',

  // Support Inside
  SupportInside = 'SupportInside',
}

// ─── Permission Rule ────────────────────────────────────────────

export interface PermissionRule {
  action: Action | Action[];
  subject: Subject;
  /** If true, filter by user's own resources (user_id = req.user.id) */
  conditions?: Record<string, any>;
  /** If true, some fields are excluded from the result */
  fields?: string[];
  /** If true, the permission is inverted (cannot) */
  inverted?: boolean;
  /** Human-readable reason for the restriction */
  reason?: string;
}

// ─── Permissions by Role ────────────────────────────────────────
//
// Definido como función para poder inyectar el user_id en las conditions.
// El argumento `userId` se usa para filtrar recursos propios.
// El argumento `partnerId` se usa para filtrar clientes del partner.

export type RolePermissions = (
  userId: string,
  partnerId?: string,
) => PermissionRule[];

export const ROLE_PERMISSIONS: Record<string, RolePermissions> = {
  /* ═══════════════════════════════════════
     SUPERADMIN — acceso total
     ═══════════════════════════════════════ */
  superadmin: () => [{ action: Action.Manage, subject: Subject.All }],

  /* ═══════════════════════════════════════
     AGENT_FULL — todo excepto settings y gestión de agentes
     ═══════════════════════════════════════ */
  agent_full: () => [
    { action: Action.Manage, subject: Subject.Dashboard },
    { action: Action.Manage, subject: Subject.Profile },
    { action: Action.Manage, subject: Subject.Client },
    { action: Action.Manage, subject: Subject.BillingProfile },
    { action: Action.Manage, subject: Subject.ClientNote },
    { action: Action.Manage, subject: Subject.Product },
    { action: Action.Manage, subject: Subject.ProductCategory },
    { action: Action.Manage, subject: Subject.Invoice },
    { action: Action.Manage, subject: Subject.Payment },
    { action: Action.Manage, subject: Subject.Conversation },
    { action: Action.Manage, subject: Subject.Message },
    { action: Action.Manage, subject: Subject.Task },
    { action: Action.Manage, subject: Subject.Maintenance },
    { action: Action.Manage, subject: Subject.Service },
    { action: Action.Manage, subject: Subject.SupportInside },
    { action: [Action.Read, Action.List], subject: Subject.AuditLog },
    { action: Action.Manage, subject: Subject.Notification },
    { action: Action.Manage, subject: Subject.Promotion },
    { action: Action.Manage, subject: Subject.DiscountCode },
    { action: Action.Manage, subject: Subject.KnowledgeBase },
    { action: [Action.Read, Action.List], subject: Subject.ErrorLog },
    { action: [Action.Read, Action.List], subject: Subject.Server },
    { action: [Action.Read, Action.List], subject: Subject.Partner },
    { action: Action.Manage, subject: Subject.Referral },
    // Sprint 8 Fase A — lectura de agentes para selector de asignación de tareas.
    // El bloqueo de escritura (Create/Update/Delete) queda más abajo en
    // forma explícita; NO se usa `Manage` como wildcard porque CASL trata
    // `manage` como superset absoluto y anularía este `Read/List`.
    { action: [Action.Read, Action.List], subject: Subject.Agent },
    // Cannot manage settings nor agents
    {
      action: Action.Manage,
      subject: Subject.Setting,
      inverted: true,
      reason: 'Solo el superadmin puede gestionar settings.',
    },
    {
      // Bloqueamos solo escritura sobre agentes — la lectura queda
      // permitida arriba para alimentar selectores de asignación de
      // tareas (Sprint 8 Fase A.3). Cualquier acción admin de creación/
      // edición/eliminación de cuentas staff queda exclusiva del
      // superadmin (ADR-067 §granularidad por rol staff).
      action: [Action.Create, Action.Update, Action.Delete],
      subject: Subject.Agent,
      inverted: true,
      reason: 'Solo el superadmin puede crear, editar o eliminar agentes.',
    },
    {
      // Sprint 15A (ADR-080) — Plugin Framework admin-puro. Mismo patrón
      // canónico que NotificationTemplate / Job: editar la config de un
      // plugin implica acceso a credenciales del proveedor (api keys
      // cifradas), por lo que queda exclusivo del superadmin.
      action: Action.Manage,
      subject: Subject.Plugin,
      inverted: true,
      reason:
        'Solo el superadmin puede gestionar plugins (ADR-080) — los plugins manejan credenciales sensibles del proveedor.',
    },
  ],

  /* ═══════════════════════════════════════
     AGENT_BILLING — clientes + facturación + tareas
     Sin acceso a: productos, soporte, settings, infra
     ═══════════════════════════════════════ */
  agent_billing: () => [
    { action: Action.Manage, subject: Subject.Dashboard },
    { action: Action.Manage, subject: Subject.Profile },
    { action: Action.Manage, subject: Subject.Client },
    { action: Action.Manage, subject: Subject.BillingProfile },
    { action: Action.Manage, subject: Subject.ClientNote },
    { action: Action.Manage, subject: Subject.Invoice },
    { action: Action.Manage, subject: Subject.Payment },
    { action: Action.Manage, subject: Subject.Task },
    { action: Action.Manage, subject: Subject.Maintenance },
    { action: [Action.Read, Action.List], subject: Subject.Service },
    // Sprint 8 Fase A — lectura de agentes para selector de asignación de tareas.
    { action: [Action.Read, Action.List], subject: Subject.Agent },
    // Sus PROPIAS notificaciones — patrón coherente con client + partner
    // (Sprint 9.5 + ADR-042). Ownership la enforza el controller server-side.
    {
      action: [Action.Read, Action.List, Action.Update],
      subject: Subject.Notification,
    },
  ],

  /* ═══════════════════════════════════════
     AGENT_SUPPORT — lectura de clientes + soporte + tareas
     Sin acceso a: productos, facturación, settings, infra
     ═══════════════════════════════════════ */
  agent_support: () => [
    { action: Action.Manage, subject: Subject.Dashboard },
    { action: Action.Manage, subject: Subject.Profile },
    { action: [Action.Read, Action.List], subject: Subject.Client },
    { action: [Action.Read, Action.List], subject: Subject.BillingProfile },
    { action: [Action.Create, Action.Read], subject: Subject.ClientNote },
    { action: Action.Manage, subject: Subject.Conversation },
    { action: Action.Manage, subject: Subject.Message },
    { action: Action.Manage, subject: Subject.Task },
    { action: Action.Manage, subject: Subject.Maintenance },
    { action: [Action.Read, Action.List], subject: Subject.Service },
    { action: [Action.Read, Action.List], subject: Subject.KnowledgeBase },
    // Sprint 8 Fase A — lectura de agentes para selector de asignación de tareas.
    { action: [Action.Read, Action.List], subject: Subject.Agent },
    // Sus PROPIAS notificaciones — patrón coherente con client + partner
    // (Sprint 9.5 + ADR-042). Ownership la enforza el controller server-side.
    {
      action: [Action.Read, Action.List, Action.Update],
      subject: Subject.Notification,
    },
  ],

  /* ═══════════════════════════════════════
     CLIENT — solo sus propios recursos
     Referencia: DECISIONS.md §13, §14, §15
     ═══════════════════════════════════════ */
  // userId no usado actualmente — parámetro mantenido por simetría con otros
  // roles (partner, agent_billing) que sí lo usan en sus condiciones.
  client: (_userId: string) => [
    { action: Action.Manage, subject: Subject.Dashboard },
    { action: Action.Manage, subject: Subject.Profile },
    // Billing profiles — guard allows, controller enforces user_id ownership
    { action: Action.Manage, subject: Subject.BillingProfile },
    // Catálogo de productos (solo lectura — DECISIONS.md §32: "Ve el catálogo dentro del dashboard")
    { action: [Action.Read, Action.List], subject: Subject.Product },
    // Facturas — Read/List (controller filters by user_id from JWT), Create (checkout)
    {
      action: [Action.Read, Action.List, Action.Create],
      subject: Subject.Invoice,
    },
    // Servicios — lectura + pausar + cancelar (controller filters by user_id)
    {
      action: [Action.Read, Action.List, Action.Update],
      subject: Subject.Service,
    },
    // Soporte: crear, ver y actuar sobre conversaciones propias.
    // `Action.Update` cubre el endpoint Sprint 16 (ADR-079 amendment) de
    // confirmar resolución (`PATCH /support/conversations/:id/confirm-resolution`).
    // Ownership: el service `SupportMessageService.confirmResolutionByClient`
    // valida `conversation.user_id === clientId` antes de mutar — patrón
    // idéntico al de Service / SupportInside / Notification del cliente.
    {
      action: [Action.Create, Action.Read, Action.List, Action.Update],
      subject: Subject.Conversation,
    },
    { action: [Action.Create, Action.Read], subject: Subject.Message },
    // Notificaciones (controller filters by user_id)
    {
      action: [Action.Read, Action.List, Action.Update],
      subject: Subject.Notification,
    },
    // Portal de transparencia
    { action: [Action.Read, Action.List], subject: Subject.AuditLog },
    // Support Inside — Sprint 8 Fase D (ADR-061): el cliente puede leer
    // su estado y gestionar (subscribe / cancel / addSlot / releaseSlot)
    // su propia suscripción. Ownership la enforza cada handler con
    // req.user.id (los services validan client_id antes de mutar).
    {
      action: [Action.Read, Action.List, Action.Update],
      subject: Subject.SupportInside,
    },
    // Referidos
    { action: [Action.Read, Action.List], subject: Subject.Referral },
  ],

  /* ═══════════════════════════════════════
     PARTNER_PENDING — registrado, pendiente de aprobación
     Solo puede ver su perfil y el estado de su solicitud.
     Referencia: PARTNER_DECISIONS.md §3
     ═══════════════════════════════════════ */
  partner_pending: () => [
    { action: Action.Manage, subject: Subject.Dashboard },
    { action: Action.Manage, subject: Subject.Profile },
  ],

  /* ═══════════════════════════════════════
     PARTNER — aprobado, acceso a su dashboard
     Referencia: PARTNER_DECISIONS.md §4, §5, §6, §7
     DECISIONS.md §35
     ═══════════════════════════════════════

     Reglas clave:
     1. VE a sus clientes en lectura (no puede modificar datos del cliente)
     2. VE los servicios de sus clientes (lectura)
     3. VE las facturas de sus clientes (lectura)
     4. VE las conversaciones de soporte de sus clientes (lectura, no participa)
     5. CREA notas inmutables sobre sus clientes (solo INSERT, nunca UPDATE/DELETE)
     6. CREA tickets bidireccionales a sus clientes
     7. CREA notificaciones unidireccionales a sus clientes
     8. VE y gestiona sus propias comisiones y liquidaciones
     9. GESTIONA su enlace de referido y estadísticas
     10. GESTIONA su perfil de partner (método payout, datos agencia)
     11. PUEDE solicitar desvinculación de un cliente
     12. PUEDE vincular su cuenta de cliente (si tiene una)
     ═══════════════════════════════════════ */
  partner: (userId: string, partnerId?: string) => {
    const partnerCondition = partnerId ? { partner_id: partnerId } : {};

    return [
      { action: Action.Manage, subject: Subject.Dashboard },
      { action: Action.Manage, subject: Subject.Profile },

      // ── Clientes del partner (lectura) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.PartnerClient,
        conditions: partnerCondition,
      },

      // ── Servicios de sus clientes (lectura) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.Service,
        conditions: partnerCondition,
      },

      // ── Facturas de sus clientes (lectura) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.Invoice,
        conditions: partnerCondition,
      },

      // ── Soporte de sus clientes (lectura, no participa) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.Conversation,
        conditions: partnerCondition,
      },

      // ── Notas inmutables sobre sus clientes (solo crear y leer) ──
      {
        action: [Action.Create, Action.Read, Action.List],
        subject: Subject.PartnerNote,
        conditions: partnerCondition,
      },

      // ── Tickets bidireccionales a sus clientes ──
      {
        action: Action.Manage,
        subject: Subject.PartnerTicket,
        conditions: partnerCondition,
      },

      // ── Notificaciones unidireccionales a sus clientes ──
      {
        action: [Action.Create, Action.Read, Action.List],
        subject: Subject.PartnerNotification,
        conditions: partnerCondition,
      },

      // ── Comisiones (lectura) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.PartnerCommission,
        conditions: partnerCondition,
      },

      // ── Liquidaciones (lectura) ──
      {
        action: [Action.Read, Action.List],
        subject: Subject.PartnerPayout,
        conditions: partnerCondition,
      },

      // ── Enlace de referido del partner ──
      {
        action: [Action.Read, Action.Update],
        subject: Subject.Partner,
        conditions: { user_id: userId },
      },

      // ── Vinculación de cuenta partner-cliente ──
      {
        action: [Action.Create, Action.Read],
        subject: Subject.PartnerLink,
        conditions: partnerCondition,
      },

      // ── Solicitudes de desvinculación ──
      {
        action: [Action.Create, Action.Read, Action.List],
        subject: Subject.PartnerUnlink,
        conditions: partnerCondition,
      },

      // ── Notificaciones propias ──
      {
        action: [Action.Read, Action.List, Action.Update],
        subject: Subject.Notification,
        conditions: { user_id: userId },
      },

      // ── NO puede: modificar datos de clientes, acceder a settings, productos, etc. ──
      {
        action: Action.Manage,
        subject: Subject.Client,
        inverted: true,
        reason: 'El partner no puede modificar datos de clientes directamente.',
      },
      {
        action: Action.Manage,
        subject: Subject.Product,
        inverted: true,
        reason: 'El partner no tiene acceso al catálogo de productos.',
      },
      {
        action: Action.Manage,
        subject: Subject.Setting,
        inverted: true,
        reason: 'El partner no puede gestionar settings.',
      },
    ];
  },
};

// ─── Frontend permissions (simplified for sidebar filtering) ────
//
// This is the subset needed by the frontend to show/hide nav items.
// It maps role → array of Subject strings the role can see.
//
// Exported separately for easy import in the frontend.

export const SIDEBAR_PERMISSIONS: Record<string, Subject[]> = {
  superadmin: [
    Subject.Dashboard,
    Subject.Client,
    Subject.Product,
    Subject.Invoice,
    Subject.Conversation,
    Subject.Task,
    Subject.AuditLog,
    Subject.Server,
    Subject.Setting,
    Subject.Promotion,
    Subject.KnowledgeBase,
    Subject.ErrorLog,
    // ADR-067 — items admin-puro plataforma (solo superadmin).
    Subject.NotificationTemplate,
    Subject.Job,
    // ADR-080 — Plugin Framework admin-puro (manejan credenciales del proveedor).
    Subject.Plugin,
    Subject.Partner,
    Subject.Referral,
  ],
  agent_full: [
    Subject.Dashboard,
    Subject.Client,
    Subject.Product,
    Subject.Invoice,
    Subject.Conversation,
    Subject.Task,
    Subject.AuditLog,
    Subject.Promotion,
    Subject.KnowledgeBase,
    Subject.ErrorLog,
    Subject.Partner,
  ],
  agent_billing: [
    Subject.Dashboard,
    Subject.Client,
    Subject.Invoice,
    Subject.Task,
  ],
  agent_support: [
    Subject.Dashboard,
    Subject.Client,
    Subject.Conversation,
    Subject.Task,
    Subject.KnowledgeBase,
  ],
  client: [
    Subject.Dashboard,
    Subject.Service,
    Subject.Invoice,
    Subject.Conversation,
    Subject.SupportInside,
    Subject.Referral,
  ],
  partner_pending: [Subject.Dashboard],
  partner: [
    Subject.Dashboard,
    Subject.PartnerClient,
    Subject.PartnerCommission,
    Subject.PartnerPayout,
    Subject.PartnerTicket,
    Subject.Partner,
  ],
};
