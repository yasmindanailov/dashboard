'use client';

import { useEffect, useRef, useCallback } from 'react';

/* ═══════════════════════════════════════════════
   AURORA DIGITAL — Brand Identity Canvas Animation

   Flowing light ribbons in the brand blue spectrum,
   like a digital aurora borealis. Multiple layered
   bands move organically using layered sine waves.

   Subtle mouse interaction — cursor gently pulls
   nearby ribbons. Floating specks add life.

   Canvas 2D · 60fps · Premium grain overlay
   ═══════════════════════════════════════════════ */

/* ── Brand palette ── */
const C = {
  deep: [29, 78, 216],     // #1D4ED8
  brand: [59, 130, 246],     // #3B82F6
  light: [147, 197, 253],    // #93C5FD
  pale: [191, 219, 254],    // #BFDBFE
};

/* ── Ribbon configs ── */
interface RibbonCfg {
  baseY: number;         // 0-1, vertical position
  amplitude: number;     // wave height relative to canvas
  color: number[];       // RGB
  alpha: number;         // peak opacity
  glowSpread: number;    // how far the glow extends (px)
  speed: number;         // time multiplier
  freqs: number[];       // sine frequencies for organic shape
  phase: number;         // time phase offset
}

const RIBBONS: RibbonCfg[] = [
  // Back layer — deep, wide, slow
  { baseY: 0.62, amplitude: 0.07, color: C.deep, alpha: 0.25, glowSpread: 140, speed: 0.20, freqs: [0.0025, 0.004, 0.007], phase: 0 },
  { baseY: 0.55, amplitude: 0.09, color: C.brand, alpha: 0.18, glowSpread: 120, speed: 0.28, freqs: [0.003, 0.005, 0.009], phase: 1.5 },
  // Mid layer — brand, medium
  { baseY: 0.58, amplitude: 0.06, color: C.brand, alpha: 0.30, glowSpread: 100, speed: 0.35, freqs: [0.004, 0.006, 0.011], phase: 0.8 },
  { baseY: 0.52, amplitude: 0.08, color: C.light, alpha: 0.20, glowSpread: 110, speed: 0.32, freqs: [0.0035, 0.007, 0.010], phase: 2.2 },
  // Front layer — light, bright, prominent
  { baseY: 0.56, amplitude: 0.05, color: C.light, alpha: 0.38, glowSpread: 70, speed: 0.42, freqs: [0.005, 0.008, 0.013], phase: 3.0 },
  { baseY: 0.60, amplitude: 0.04, color: C.pale, alpha: 0.24, glowSpread: 60, speed: 0.38, freqs: [0.006, 0.009, 0.015], phase: 4.1 },
];

/* ── Math helpers ── */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* Layered sine — cheap organic noise */
function ribbonY(x: number, time: number, cfg: RibbonCfg, h: number, mouseX: number, mouseY: number, mouseInfluence: number): number {
  const t = time * cfg.speed + cfg.phase;
  let y = cfg.baseY * h;

  // Layered sines for organic shape
  y += Math.sin(x * cfg.freqs[0] + t) * cfg.amplitude * h * 0.5;
  y += Math.sin(x * cfg.freqs[1] + t * 0.7 + 1.3) * cfg.amplitude * h * 0.3;
  y += Math.sin(x * cfg.freqs[2] + t * 1.1 + 2.7) * cfg.amplitude * h * 0.2;

  // Soft attraction — ribbons gently pulled toward cursor
  if (mouseInfluence > 0.001) {
    const dx = x - mouseX;
    const dy = y - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const proximity = Math.max(0, 1 - dist / 500);
    y += (mouseY - y) * proximity * proximity * 0.45 * mouseInfluence;
  }

  return y;
}

/* ── Scene transform — rotate aurora inside canvas ── */
const SCENE_ANGLE = -30 * (Math.PI / 180); // rotation in radians
const SCENE_OFFSET_Y = -0.25;              // vertical shift (-1 to 1, negative = up)

/* ── Configuration ── */
function makeNoise(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.random() * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 16;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ═══════════════════════════════════════════════ */

export default function GradientMesh() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const animRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0, inf: 0, tInf: 0 });
  const dimRef = useRef({ w: 0, h: 0 });
  const t0Ref = useRef(0);
  const noiseRef = useRef<HTMLCanvasElement | null>(null);

  /* ── Render ── */
  const render = useCallback((ctx: CanvasRenderingContext2D, now: number) => {
    const { w, h } = dimRef.current;
    if (w === 0 || h === 0) return;

    const sec = (now - t0Ref.current) / 1000;

    /* Entrance fade */
    const entrance = Math.min(1, sec / 2.5);
    const eFade = entrance * entrance; // ease in

    /* Smooth mouse + influence */
    const m = mouseRef.current;
    m.x = lerp(m.x, m.tx, 0.04);
    m.y = lerp(m.y, m.ty, 0.04);
    m.inf = lerp(m.inf, m.tInf, 0.03); // slow fade — prevents harsh reset

    /* ─── Clear with subtle gradient background ─── */
    ctx.globalCompositeOperation = 'source-over';
    const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, '#ffffff');
    bgGrad.addColorStop(0.5, '#f8faff');
    bgGrad.addColorStop(1, '#eef4ff');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    /* ─── Apply scene rotation (aurora only, background stays fixed) ─── */
    // Dynamic scale: ensures rotated content covers viewport on any aspect ratio
    const aspect = Math.max(w, h) / Math.min(w, h);
    const sceneScale = (Math.cos(Math.abs(SCENE_ANGLE)) + Math.sin(Math.abs(SCENE_ANGLE)) * aspect) * 1.1;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.rotate(SCENE_ANGLE);
    ctx.scale(sceneScale, sceneScale);
    ctx.translate(-w * 0.5, -h * 0.5 + h * SCENE_OFFSET_Y);

    /* ─── Aurora ribbons ─── */
    const step = 3; // pixel step for points (perf vs quality)

    for (let rIdx = 0; rIdx < RIBBONS.length; rIdx++) {
      const ribbon = RIBBONS[rIdx];
      const points: number[] = [];

      // Compute ribbon path
      for (let x = 0; x <= w; x += step) {
        const y = ribbonY(x, sec, ribbon, h, m.x, m.y, m.inf);
        points.push(x, y);
      }

      // ── Downward glow (main aurora wash) ──
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
      }
      // Extend downward
      ctx.lineTo(w, points[points.length - 1] + ribbon.glowSpread);
      ctx.lineTo(0, points[1] + ribbon.glowSpread);
      ctx.closePath();

      const gDown = ctx.createLinearGradient(0, points[1] - 10, 0, points[1] + ribbon.glowSpread);
      gDown.addColorStop(0, `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},${ribbon.alpha * eFade})`);
      gDown.addColorStop(0.3, `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},${ribbon.alpha * 0.4 * eFade})`);
      gDown.addColorStop(1, `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},0)`);
      ctx.fillStyle = gDown;
      ctx.fill();

      // ── Upward glow (subtle, thinner) ──
      const upSpread = ribbon.glowSpread * 0.4;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
      }
      ctx.lineTo(w, points[points.length - 1] - upSpread);
      ctx.lineTo(0, points[1] - upSpread);
      ctx.closePath();

      const gUp = ctx.createLinearGradient(0, points[1] + 5, 0, points[1] - upSpread);
      gUp.addColorStop(0, `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},${ribbon.alpha * 0.6 * eFade})`);
      gUp.addColorStop(1, `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},0)`);
      ctx.fillStyle = gUp;
      ctx.fill();

      // ── Bright core line ──
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
      }
      ctx.strokeStyle = `rgba(${ribbon.color[0]},${ribbon.color[1]},${ribbon.color[2]},${ribbon.alpha * 0.7 * eFade})`;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // ── Glowing connection dots — flowing along ribbon edges ──
      const TRAVELER_RIBBONS = [1, 2, 4, 5];
      if (TRAVELER_RIBBONS.includes(rIdx) && eFade > 0.5) {
        const dotFade = Math.min(1, (eFade - 0.5) / 0.3);
        const totalPts = points.length / 2;

        // Each ribbon gets 2 dots with unique speeds/phases
        const dots = [
          { speed: 0.12 + rIdx * 0.025, phase: rIdx * 1.7, dir: 1 },
          { speed: 0.09 + rIdx * 0.018, phase: rIdx * 2.3 + 0.6, dir: -1 },
        ];

        ctx.save();

        for (const dot of dots) {
          const tRaw = (sec * dot.speed + dot.phase) % 1;
          const tPos = dot.dir > 0 ? tRaw : 1 - tRaw;
          const idx = Math.floor(tPos * (totalPts - 1));
          const dx = points[idx * 2] ?? 0;
          const dy = points[idx * 2 + 1] ?? 0;

          // Subtle size pulse — breathing effect
          const pulse = 1 + Math.sin(sec * 2.5 + dot.phase) * 0.15;
          const coreR = 1.0 * pulse;
          const glowR = 5 * pulse;

          // Layer 1: soft ambient halo via shadowBlur
          ctx.shadowColor = `rgba(255,255,255,${0.45 * dotFade})`;
          ctx.shadowBlur = 7 * pulse;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // Layer 2: radial gradient bloom
          const grad = ctx.createRadialGradient(dx, dy, 0, dx, dy, glowR);
          grad.addColorStop(0, `rgba(255,255,255,${0.7 * dotFade})`);
          grad.addColorStop(0.3, `rgba(200,220,255,${0.25 * dotFade})`);
          grad.addColorStop(1, 'rgba(200,220,255,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(dx, dy, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Layer 3: bright white core
          ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(255,255,255,${0.9 * dotFade})`;
          ctx.beginPath();
          ctx.arc(dx, dy, coreR, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }


    /* ─── Restore from scene rotation ─── */
    ctx.restore();

    /* ─── Noise overlay ─── */
    if (noiseRef.current) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.2;
      ctx.drawImage(noiseRef.current, 0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }, []);

  /* ── Setup ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = boxRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimRef.current = { w, h };
      noiseRef.current = makeNoise(Math.round(w * 0.5), Math.round(h * 0.5));
    };

    /* ── Mouse/touch: listen on document so interactive elements don't interrupt ── */
    const onMM = (e: MouseEvent) => {
      const r = container.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      mouseRef.current.tx = mx;
      mouseRef.current.ty = my;
      // Smooth bounds check — target influence fades via lerp in render loop
      const inBounds = mx >= -40 && mx <= r.width + 40 && my >= -40 && my <= r.height + 40;
      mouseRef.current.tInf = inBounds ? 1 : 0;
    };
    const onML = () => { mouseRef.current.tInf = 0; };

    const onTM = (e: TouchEvent) => {
      const tc = e.touches[0];
      if (!tc) return;
      const r = container.getBoundingClientRect();
      mouseRef.current.tx = tc.clientX - r.left;
      mouseRef.current.ty = tc.clientY - r.top;
      mouseRef.current.tInf = 1;
    };
    const onTE = () => { mouseRef.current.tInf = 0; };

    resize();
    t0Ref.current = performance.now();

    const loop = (now: number) => {
      render(ctx, now);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    document.addEventListener('mousemove', onMM, { passive: true });
    document.addEventListener('mouseleave', onML);
    container.addEventListener('touchmove', onTM, { passive: true });
    container.addEventListener('touchend', onTE);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      document.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseleave', onML);
      container.removeEventListener('touchmove', onTM);
      container.removeEventListener('touchend', onTE);
    };
  }, [render]);

  return (
    <div ref={boxRef} className="absolute inset-0" aria-hidden="true">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="noise-texture" />
    </div>
  );
}
