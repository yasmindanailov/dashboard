export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Resilencia frente a respuestas vacías:
  //   - HTTP 204 No Content (DELETE / no-content endpoints).
  //   - Handlers NestJS que devuelven `null`/`undefined` — se serializan
  //     como cuerpo vacío con `Content-Length: 0`, NO como `null` JSON.
  //   - 5xx con body vacío de un proxy.
  // En esos casos `res.json()` lanza "Unexpected end of JSON input" y
  // rompe todo el cliente. Leer el texto y parsear sólo si tiene contenido.
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown> | unknown[] | string | number | boolean | null) : null;

  if (!res.ok) {
    const errBody = (data ?? {}) as { message?: string; correlationId?: string };
    throw {
      status: res.status,
      message: errBody.message || 'Error desconocido',
      correlationId: errBody.correlationId,
    };
  }

  return data as T;
}
