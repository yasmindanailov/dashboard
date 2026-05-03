/**
 * mockup/scripts.js — Aelium Dashboard mockup
 *
 * Renderiza la nav lateral compartida y resuelve accionadores básicos
 * (toggles con [data-toggle], etc.). Se carga desde toda página de la
 * maqueta. La estructura de la nav vive aquí — al añadir páginas, editar
 * NAV abajo.
 */

(function () {
  'use strict';

  const NAV = [
    { section: 'Inicio', items: [
      { href: 'index.html',                         label: 'Bienvenida' },
      { href: 'firma-visual.html',                  label: 'Firma visual' },
    ]},
    { section: 'Fase 2 · Componentes base', items: [
      { section: 'Formularios' },
      { href: 'components/button.html',             label: 'Button' },
      { href: 'components/input.html',              label: 'Input' },
      { href: 'components/select.html',             label: 'Select' },
      { href: 'components/textarea.html',           label: 'Textarea' },
      { href: 'components/search-input.html',       label: 'SearchInput' },
      { href: 'components/dropdown.html',           label: 'Dropdown' },
      { section: 'Feedback' },
      { href: 'components/badge.html',              label: 'Badge' },
      { href: 'components/status-dot.html',         label: 'StatusDot' },
      { href: 'components/toast.html',              label: 'Toast' },
      { href: 'components/alert-banner.html',       label: 'AlertBanner' },
      { href: 'components/tooltip.html',            label: 'Tooltip' },
      { href: 'components/help-tip.html',           label: 'HelpTip' },
      { href: 'components/skeleton.html',           label: 'Skeleton' },
      { section: 'Data' },
      { href: 'components/table.html',              label: 'Table' },
      { href: 'components/pagination.html',         label: 'Pagination' },
      { href: 'components/stats-card.html',         label: 'StatsCard' },
      { href: 'components/stats-card-iteraciones.html', label: 'StatsCard · iteraciones' },
      { href: 'components/bulk-action-bar.html',    label: 'BulkActionBar' },
      { href: 'components/filter-bar.html',         label: 'FilterBar' },
      { section: 'Navegación' },
      { href: 'components/tabs.html',               label: 'Tabs · StatusTabs' },
      { href: 'components/tabs-variantes.html',     label: 'Tabs · variantes' },
      { href: 'components/breadcrumb.html',         label: 'Breadcrumb' },
      { href: 'components/command-palette.html',    label: 'CommandPalette' },
      { href: 'components/notification-bell.html',  label: 'NotificationBell' },
      { href: 'components/portal-badge.html',       label: 'PortalBadge' },
      { section: 'Contenedores' },
      { href: 'components/card.html',               label: 'Card · 5 variantes' },
      { href: 'components/modal.html',              label: 'Modal · 5 variantes' },
      { href: 'components/avatar.html',             label: 'Avatar' },
      { href: 'components/empty-state.html',        label: 'EmptyState · 4 variantes' },
    ]},
    { section: 'Fase 3 · Patrones', items: [
      { href: 'patterns/list-page.html',            label: 'ListPage',      pending: true },
      { href: 'patterns/detail-page.html',          label: 'DetailPage',    pending: true },
      { href: 'patterns/form-page.html',            label: 'FormPage',      pending: true },
    ]},
    { section: 'Fase 4 · Shells', items: [
      { href: 'shells/auth.html',                   label: 'AuthShell',     pending: true },
      { href: 'shells/client.html',                 label: 'ClientShell',   pending: true },
      { href: 'shells/admin.html',                  label: 'AdminShell',    pending: true },
      { href: 'shells/partner.html',                label: 'PartnerShell',  pending: true },
    ]},
    { section: 'Páginas de muestra', items: [
      { href: 'pages/sample-form.html',             label: 'Formulario · ticket de soporte' },
      { href: 'pages/admin-clientes.html',          label: 'Admin · Listado de clientes' },
      { href: 'pages/admin-cliente-detalle.html',   label: 'Admin · Detalle de cliente' },
      { href: 'pages/cliente-overview.html',        label: 'Cliente · Bienvenida (Overview)' },
    ]},
    { section: 'Fases 5–9 · Páginas (futuro)', items: [
      { href: 'pages/dashboard-cliente.html',       label: 'Cliente · Overview', pending: true },
      { href: 'pages/admin-overview.html',          label: 'Admin · Overview',   pending: true },
      // crece con cada fase
    ]},
  ];

  /**
   * Calcula la profundidad de la página actual respecto a mockup/.
   * index.html → 0   ·   components/x.html → 1   ·   etc.
   */
  function depth() {
    const path = window.location.pathname;
    // count segments after the last "mockup/" occurrence
    const idx = path.lastIndexOf('/mockup/');
    if (idx === -1) return 0;
    const after = path.slice(idx + '/mockup/'.length);
    const segs = after.split('/').filter(Boolean);
    return Math.max(0, segs.length - 1);
  }

  function rel(href, d) {
    if (!href) return href;
    return d > 0 ? '../'.repeat(d) + href : href;
  }

  function isActive(href, d) {
    const target = rel(href, d);
    const current = window.location.pathname.split('/').slice(-2).join('/');
    return target.endsWith(current) || target.endsWith(current.split('/').pop());
  }

  function renderNav() {
    const host = document.getElementById('nav');
    if (!host) return;
    const d = depth();
    const indexHref = rel('index.html', d);
    const logoSrc = rel('logo.svg', d);

    /*
     * Marca: símbolo + wordmark según documento de marca.
     * Si logo.svg está disponible, se usa. Si no, fallback a dos rombos
     * dibujados en CSS (.nav-brand-mark::before/::after).
     */
    let html = `
      <a class="nav-brand" href="${indexHref}">
        <div class="nav-brand-mark" id="nav-brand-mark"></div>
        <div class="nav-brand-name">aelium</div>
        <div class="nav-brand-tag">mockup</div>
      </a>
      <div class="nav-tagline">Tu socio digital, a tu lado.</div>
    `;

    NAV.forEach((group) => {
      html += `<div class="nav-section">${group.section}</div>`;
      group.items.forEach((item) => {
        if (item.section) {
          html += `<div class="nav-section" style="opacity:0.7;font-size:10px;padding-top:var(--space-2);">${item.section}</div>`;
          return;
        }
        const href = rel(item.href, d);
        const classes = ['nav-link'];
        if (item.pending) classes.push('pending');
        if (!item.pending && isActive(item.href, d)) classes.push('active');
        const target = item.pending ? '#' : href;
        html += `<a class="${classes.join(' ')}" href="${target}"${item.pending ? ' data-pending="1"' : ''}>${item.label}</a>`;
      });
    });

    host.innerHTML = html;
  }

  function bindPendingClicks() {
    document.querySelectorAll('a[data-pending="1"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        // navegamos al placeholder genérico
        const d = depth();
        window.location.href = rel('pending.html', d);
      });
    });
  }

  function bindToggles() {
    document.querySelectorAll('[data-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = document.querySelector(el.getAttribute('data-toggle'));
        if (target) target.classList.toggle('open');
      });
    });
  }

  /*
   * Try to load the Aelium logo from mockup/. Tries several filenames
   * in priority order (blue first — matches brand color). If none
   * exists, the CSS fallback (rombos) stays.
   */
  function tryLogo() {
    const mark = document.getElementById('nav-brand-mark');
    if (!mark) return;
    const d = depth();
    const candidates = [
      'aelium_logo_blue.svg',
      'aelium_logo.svg',
      'aelium_logo_black.svg',
      'logo.svg',
    ];
    function tryNext(i) {
      if (i >= candidates.length) return; // ran out — keep CSS fallback
      const src = rel(candidates[i], d);
      const img = new Image();
      img.onload = function () {
        mark.classList.add('has-logo');
        mark.innerHTML = '';
        mark.appendChild(img);
        img.style.width = '100%';
        img.style.height = '100%';
      };
      img.onerror = function () { tryNext(i + 1); };
      img.src = src;
    }
    tryNext(0);
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    tryLogo();
    bindPendingClicks();
    bindToggles();
  });
})();
