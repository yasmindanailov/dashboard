import { ImageResponse } from 'next/og';

/**
 * apple-icon — icono de pantalla de inicio iOS (F1d). iOS no admite SVG ni
 * transparencia para el touch-icon, así que se genera un PNG opaco con
 * `ImageResponse` (next/og): isotipo de marca (dos rombos `#BFDBFE`/`#3B82F6`,
 * mismo trazado que BrandMark) centrado sobre fondo blanco. Formas puras, sin
 * texto → independiente de fuentes. Estáticamente optimizado en build.
 */

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // Rombo = cuadrado redondeado de 80px rotado 45°. Centros del par en y=90,
  // x=66.5 (claro) y x=113.5 (marca) → punto medio (90,90), centrado.
  const D = 80;
  const r = 24;
  const diamond = (left: number, background: string) => ({
    position: 'absolute' as const,
    left,
    top: 50,
    width: D,
    height: D,
    borderRadius: r,
    background,
    transform: 'rotate(45deg)',
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#FFFFFF',
        }}
      >
        <div style={diamond(26.5, '#BFDBFE')} />
        <div style={diamond(73.5, '#3B82F6')} />
      </div>
    ),
    { ...size },
  );
}
