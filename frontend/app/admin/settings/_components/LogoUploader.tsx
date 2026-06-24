'use client';

import { useRef, useState } from 'react';

import { Button, useToast } from '../../../components/ui';
import { uploadLogoAction } from '../_actions';

const ACCEPTED = ['image/png', 'image/jpeg'];

/**
 * Editor del logo de marca (Sprint 12). Selección local + preview inmediato +
 * subida a MinIO vía `uploadLogoAction`. PNG/JPG (los formatos que el PDF de
 * factura puede incrustar). El preview usa un div con `background-image` (evita
 * `next/image` con URLs firmadas de MinIO y el lint de `<img>`).
 */
export function LogoUploader({ initialUrl }: { initialUrl: string | null }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>): void {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!ACCEPTED.includes(selected.type)) {
      toast('error', 'El logo debe ser una imagen PNG o JPG.');
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  }

  async function handleUpload(): Promise<void> {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadLogoAction(fd);
      if (res.ok) {
        setPreview(res.url);
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
        toast('success', 'Logo actualizado.');
      } else {
        toast('error', res.error);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}
      >
        Logo de la empresa
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          aria-label="Vista previa del logo"
          style={{
            width: 120,
            height: 64,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: preview
              ? `var(--surface) center / contain no-repeat url("${preview}")`
              : 'var(--surface-2, var(--surface))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          {!preview && 'Sin logo'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleSelect}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Seleccionar archivo…
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={uploading}
              disabled={!file}
              onClick={() => void handleUpload()}
            >
              Subir logo
            </Button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {file ? file.name : 'PNG o JPG. Aparece en la cabecera de las facturas.'}
          </span>
        </div>
      </div>
    </div>
  );
}
