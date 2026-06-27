// Barrel del cliente de API — reexporta todos los dominios.
// `@/app/lib/api` resuelve aquí (antes era `lib/api.ts`, 2197 LOC → partido por
// dominio en F0.6/GL-27, cero churn para los importadores). Mantener el orden
// alfabético por dominio; un dominio = un archivo (R15).
export * from './client';
export * from './auth';
export * from './clients';
export * from './products';
export * from './billing';
export * from './support';
export * from './users';
export * from './tasks';
export * from './dashboard';
export * from './error-log';
export * from './audit';
export * from './notifications';
export * from './notification-templates';
export * from './plugins';
export * from './support-inside';
export * from './jobs';
export * from './service-types';
export * from './dns';
export * from './services';
