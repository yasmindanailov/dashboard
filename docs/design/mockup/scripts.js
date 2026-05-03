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
    ]},
    { section: 'Fase 2 · Componentes base', items: [
      { section: 'Formularios' },
      { href: 'components/button.html',             label: 'Button' },
      { href: 'components/input.html',              label: 'Input',         pending: true },
      { href: 'components/select.html',             label: 'Select',        pending: true },
      { href: 'components/textarea.html',           label: 'Textarea',      pending: true },
      { href: 'components/search-input.html',       label: 'SearchInput',   pending: true },
      { href: 'components/dropdown.html',           label: 'Dropdown',      pending: true },
      { section: 'Feedback' },
      { href: 'components/badge.html',              label: 'Badge',         pending: true },
      { href: 'components/status-dot.html',         label: 'StatusDot',     pending: true },
      { href: 'components/toast.html',              label: 'Toast',         pending: true },
      { href: 'components/alert-banner.html',       label: 'AlertBanner',   pending: true },
      { href: 'components/tooltip.html',            label: 'Tooltip',       pending: true },
      { href: 'components/help-tip.html',           label: 'HelpTip',       pending: true },
      { href: 'components/skeleton.html',           label: 'Skeleton',      pending: true },
      { section: 'Data' },
      { href: 'components/table.html',              label: 'Table',         pending: true },
      { href: 'components/pagination.html',         label: 'Pagination',    pending: true },
      { href: 'components/stats-card.html',         label: 'StatsCard',     pending: true },
      { href: 'components/bulk-action-bar.html',    label: 'BulkActionBar', pending: true },
      { href: 'components/filter-bar.html',         label: 'FilterBar',     pending: true },
      { section: 'Navegación' },
      { href: 'components/tabs.html',               label: 'Tabs',          pending: true },
      { href: 'components/breadcrumb.html',         label: 'Breadcrumb',    pending: true },
      { href: 'components/command-palette.html',    label: 'CommandPalette', pending: true },
      { href: 'components/notification-bell.html',  label: 'NotificationBell', pending: true },
      { href: 'components/portal-badge.html',       label: 'PortalBadge',   pending: true },
      { section: 'Contenedores' },
      { href: 'components/card.html',               label: 'Card',          pending: true },
      { href: 'components/modal.html',              label: 'Modal',         pending: true },
      { href: 'components/avatar.html',             label: 'Avatar',        pending: true },
      { href: 'components/empty-state.html',        label: 'EmptyState',    pending: true },
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
    { section: 'Fases 5–9 · Páginas', items: [
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

    let html = `
      <a class="nav-brand" href="${indexHref}">
        <div class="nav-brand-mark"></div>
        <div class="nav-brand-name">aelium</div>
        <div class="nav-brand-tag">mockup</div>
      </a>
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

  document.addEventListener('DOMContentLoaded', () => {
    renderNav();
    bindPendingClicks();
    bindToggles();
  });
})();
