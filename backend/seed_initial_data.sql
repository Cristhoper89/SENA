-- DEMO DATA ONLY. Replace the company values before using this on production.
-- Run after schema_base.sql on a new database. This script preserves existing rows.
-- Payment methods are enums; metodos_pagos stores transaction details and stays empty.

BEGIN;

SELECT pg_advisory_xact_lock(853102);

INSERT INTO public.roles (name, description)
VALUES
    ('Administrador', 'Acceso de administracion'),
    ('Cajero', 'Operacion de caja'),
    ('Mesero', 'Atencion de mesas'),
    ('Cocina', 'Gestion de pedidos de cocina'),
    ('Cliente', 'Acceso de cliente')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.configuracion (id, propina, valor_propina, alerta_bajo_stock)
VALUES (1, TRUE, 10.00, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.empresa (nombre, direccion, telefono, "NIT", correo)
SELECT
    'Restaurante Demo La Cabana',
    'Calle 00 # 00-00, Pereira, Risaralda (PRUEBA)',
    '0000000000',
    '000000000-0',
    'pruebas@example.invalid'
WHERE NOT EXISTS (SELECT 1 FROM public.empresa);

COMMIT;
