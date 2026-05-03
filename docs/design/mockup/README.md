# mockup/ — Maqueta viva del dashboard

> Artefacto visual navegable que crece fase a fase. Multi-página con CSS y
> JS compartidos: se siente como una sola maqueta desde el navegador,
> mantenible desde el repo.

---

## Cómo usarla

Abrir `index.html` en un navegador local. Funciona sin servidor (file://)
porque las páginas son autocontenidas y los assets compartidos viven al
lado:

```
docs/design/mockup/
├── README.md          ← este archivo
├── index.html         ← entry con nav lateral + bienvenida
├── tokens.css         ← copia sincronizada de fase-1-tokens/tokens.css
├── styles.css         ← shell de la maqueta + base de componentes
├── scripts.js         ← nav rendering, toggles, accionadores
├── components/        ← fase 2 (un .html por componente)
├── patterns/          ← fase 3 (DetailPage / ListPage / FormPage)
├── shells/            ← fase 4 (auth / client / admin / partner)
└── pages/             ← fases 5–9 (mockups de páginas reales)
```

Cualquier página de la maqueta:
- Hace `<link rel="stylesheet" href="../tokens.css">` y `../styles.css`.
- Hace `<script src="../scripts.js">` para que se renderice la nav lateral.
- Tiene su propio `<main>` con la spec visual del elemento.

---

## Cómo se mantiene sincronizada con fase-1

`tokens.css` aquí es **una copia** de `../fase-1-tokens/tokens.css`. Cuando
fase 1 cambie (probablemente solo tras la promoción a `globals.css`), se
actualiza con `cp` (paso del modo implementación). La maqueta nunca diverge.

---

## Cómo se conectan las páginas

`scripts.js` renderiza la nav lateral y resalta la página activa según la
URL. Los enlaces de la nav apuntan a las páginas existentes. Ítems de
fases futuras aparecen marcados como pendientes pero no rotos — al hacer
click llevan a una página "Pendiente" amable.

A medida que avanzan las fases:
- **Fase 2** (en curso): `components/` se llena.
- **Fase 3**: aparecen `patterns/`.
- **Fase 4**: aparecen `shells/` y la maqueta entra en "modo dashboard
  real" — el shell envuelve las páginas de `pages/`.
- **Fases 5–9**: `pages/` se llena con mockups reales (Overview cliente,
  detalle factura, etc.).
- **Fase 10**: estados especiales (404, empty states, error pages).
- **Fase 11**: toggle dark mode.

---

## Reglas

1. Cero hex hardcoded. Todo via tokens.
2. Cada página, autocontenida — abrible directamente desde `file://`.
3. Sin librerías externas en runtime salvo Google Fonts (DM Sans,
   JetBrains Mono).
4. Los accionadores (toggles, modales, tabs) viven en `scripts.js` y se
   activan con `data-*` attributes.
5. Si una página requiere comportamiento que no existe en `scripts.js`,
   se añade ahí (compartido), no inline en la página.
6. Los previews HTML de fases (p.ej. `fase-1-tokens/phase-1-tokens.html`)
   son **distintos** a la maqueta. Aquellos documentan tokens; esta es la
   maqueta del producto.

---

## Estado actual

| Sección | Estado |
|---------|--------|
| `index.html` | Listo (entry + nav) |
| `components/button.html` | **Modelo · pendiente de aprobación** |
| Resto | Pendiente |
