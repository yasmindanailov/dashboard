INSERT INTO settings (id, category, key, value, description) VALUES
  (gen_random_uuid(), 'billing', 'default_tax_rate', '{"value": 21}', 'IVA por defecto (%)'),
  (gen_random_uuid(), 'billing', 'invoice_prefix', '{"value": "AELIUM"}', 'Prefijo de numeración de facturas'),
  (gen_random_uuid(), 'billing', 'invoice_generation_days', '{"value": 7}', 'Días antes del vencimiento para generar factura'),
  (gen_random_uuid(), 'billing', 'max_payment_retries', '{"value": 3}', 'Número máximo de reintentos de cobro'),
  (gen_random_uuid(), 'billing', 'retry_interval_days', '{"value": 3}', 'Días entre reintentos de cobro'),
  (gen_random_uuid(), 'billing', 'suspension_days', '{"value": 7}', 'Días tras impago antes de suspender servicio'),
  (gen_random_uuid(), 'billing', 'cancellation_days', '{"value": 30}', 'Días tras suspensión antes de cancelar servicio'),
  (gen_random_uuid(), 'billing', 'data_retention_days', '{"value": 90}', 'Días de retención de datos tras cancelación')
ON CONFLICT (category, key) DO NOTHING;
