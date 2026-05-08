import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: string; expiresAt: number }>();
  private readonly CACHE_TTL = 60_000; // 1 minute

  constructor(private readonly prisma: PrismaService) {}

  async get(category: string, key: string, fallback?: string): Promise<string> {
    const cacheKey = `${category}.${key}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const setting = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
    });

    // setting.value es Json — restringimos a string|number|boolean para evitar
    // "[object Object]" si alguien guarda un objeto por error.
    const raw = setting?.value;
    const value =
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
        ? String(raw)
        : (fallback ?? '');
    this.cache.set(cacheKey, { value, expiresAt: Date.now() + this.CACHE_TTL });
    return value;
  }

  async getNumber(
    category: string,
    key: string,
    fallback: number,
  ): Promise<number> {
    const val = await this.get(category, key, String(fallback));
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? fallback : parsed;
  }

  async getBoolean(
    category: string,
    key: string,
    fallback: boolean,
  ): Promise<boolean> {
    const val = await this.get(category, key, String(fallback));
    return val === 'true';
  }

  /**
   * Lee un setting cuyo `value` es un JSON estructurado (objeto o array).
   *
   * Sprint 15C Fase 15C.D — ADR-082 §4 introduce el primer setting con
   * shape JSON array (`provisioning.default_nameservers`). El `get()`
   * tradicional lo serializaría a `String(...)` y devolvería
   * `"[object Object]"` o `"ns1.aelium.net,ns2.aelium.net"`. Este método
   * preserva el shape canónico.
   *
   * No cachea (TTL 60s del `get()` no aplica): los settings JSON estructurados
   * son raros y se leen desde listeners on-event, no en hot paths.
   */
  async getJson<T>(category: string, key: string, fallback: T): Promise<T> {
    const setting = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
    });
    if (!setting) return fallback;
    const raw = setting.value;
    if (raw === null || raw === undefined) return fallback;
    return raw as unknown as T;
  }

  invalidateCache(category?: string, key?: string) {
    if (category && key) {
      this.cache.delete(`${category}.${key}`);
    } else {
      this.cache.clear();
    }
  }
}
