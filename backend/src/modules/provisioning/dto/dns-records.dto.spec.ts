/**
 * Sprint 15C.II Fase G.1.c — §A.2 área 3 (parte DTO): validación DNS records.
 *
 * Gap cerrado: el DTO `dns-records.dto.ts` declara los bounds canónicos (kind
 * ∈ 7 valores v1, ttl 60..86400, name 1..255, value 1..4096) pero NO había
 * spec que verificara que la capa class-validator rechaza la basura grosera
 * antes del schema Ajv del plugin. Cubre los edge cases del audit: TTL fuera
 * de rango (0, 99999999) + kind inválido + longitudes límite.
 */

import 'reflect-metadata';

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { CreateDnsRecordDto, UpdateDnsRecordDto } from './dns-records.dto';

async function errorsFor(
  cls: typeof CreateDnsRecordDto | typeof UpdateDnsRecordDto,
  obj: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(cls, obj);
  const errors = await validate(dto);
  // Devuelve la lista de propiedades con error (para asserts legibles).
  return errors.map((e) => e.property);
}

describe('CreateDnsRecordDto — Sprint 15C.II G.1.c (§A.2 área 3)', () => {
  const VALID = { kind: 'A', name: 'www', value: '203.0.113.10', ttl: 3600 };

  it('acepta un record válido', async () => {
    expect(await errorsFor(CreateDnsRecordDto, VALID)).toEqual([]);
  });

  it('acepta sin ttl (opcional)', async () => {
    const { ttl: _ttl, ...noTtl } = VALID;
    expect(await errorsFor(CreateDnsRecordDto, noTtl)).toEqual([]);
  });

  describe('ttl bounds (60..86400)', () => {
    it.each([60, 3600, 86400])('acepta ttl en rango: %i', async (ttl) => {
      expect(await errorsFor(CreateDnsRecordDto, { ...VALID, ttl })).toEqual(
        [],
      );
    });

    it.each([0, 59, 86401, 99999999, -1])(
      'rechaza ttl fuera de rango: %i',
      async (ttl) => {
        expect(
          await errorsFor(CreateDnsRecordDto, { ...VALID, ttl }),
        ).toContain('ttl');
      },
    );

    it('rechaza ttl no-entero (3600.5)', async () => {
      expect(
        await errorsFor(CreateDnsRecordDto, { ...VALID, ttl: 3600.5 }),
      ).toContain('ttl');
    });
  });

  describe('kind ∈ [A, AAAA, CNAME, MX, TXT, SRV, CAA]', () => {
    it.each(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA'])(
      'acepta kind válido: %s',
      async (kind) => {
        expect(await errorsFor(CreateDnsRecordDto, { ...VALID, kind })).toEqual(
          [],
        );
      },
    );

    it.each(['', 'a', 'NS', 'SOA', 'PTR', 'INVALID'])(
      'rechaza kind inválido: "%s"',
      async (kind) => {
        expect(
          await errorsFor(CreateDnsRecordDto, { ...VALID, kind }),
        ).toContain('kind');
      },
    );

    it('rechaza kind ausente (requerido)', async () => {
      const { kind: _kind, ...noKind } = VALID;
      expect(await errorsFor(CreateDnsRecordDto, noKind)).toContain('kind');
    });
  });

  describe('name / value (longitud)', () => {
    it('rechaza name vacío', async () => {
      expect(
        await errorsFor(CreateDnsRecordDto, { ...VALID, name: '' }),
      ).toContain('name');
    });

    it('rechaza name > 255 chars', async () => {
      expect(
        await errorsFor(CreateDnsRecordDto, {
          ...VALID,
          name: 'a'.repeat(256),
        }),
      ).toContain('name');
    });

    it('rechaza value vacío', async () => {
      expect(
        await errorsFor(CreateDnsRecordDto, { ...VALID, value: '' }),
      ).toContain('value');
    });

    it('rechaza value > 4096 chars', async () => {
      expect(
        await errorsFor(CreateDnsRecordDto, {
          ...VALID,
          value: 'x'.repeat(4097),
        }),
      ).toContain('value');
    });
  });
});

describe('UpdateDnsRecordDto — todos los campos opcionales', () => {
  it('acepta objeto vacío (patch parcial)', async () => {
    expect(await errorsFor(UpdateDnsRecordDto, {})).toEqual([]);
  });

  it('valida los mismos bounds cuando los campos están presentes', async () => {
    expect(await errorsFor(UpdateDnsRecordDto, { ttl: 99999999 })).toContain(
      'ttl',
    );
    expect(await errorsFor(UpdateDnsRecordDto, { kind: 'INVALID' })).toContain(
      'kind',
    );
  });
});
