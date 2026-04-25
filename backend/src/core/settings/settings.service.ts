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

    const value = setting ? String(setting.value) : (fallback ?? '');
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

  invalidateCache(category?: string, key?: string) {
    if (category && key) {
      this.cache.delete(`${category}.${key}`);
    } else {
      this.cache.clear();
    }
  }
}
