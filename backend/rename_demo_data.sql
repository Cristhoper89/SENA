-- Rename the visible labels from the earlier demo-data seed.
-- Run once on the test database before rerunning seed_demo_data.sql.

BEGIN;

SELECT pg_advisory_xact_lock(853102);

DO $rename$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.categorias old
        JOIN (VALUES
            ('Demo - Platos', 'Platos'),
            ('Demo - Bebidas', 'Bebidas'),
            ('Demo - Postres', 'Postres'),
            ('Demo - Acompanamientos', 'Acompañamientos'),
            ('Demo - Gastos', 'Gastos')
        ) AS names(old_name, new_name) ON old.nombre = names.old_name
        JOIN public.categorias existing
          ON existing.nombre = names.new_name AND existing.id <> old.id
    ) THEN
        RAISE EXCEPTION 'Ya existe una categoria con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.ingredientes old
        JOIN (VALUES
            ('Demo - Pan', 'Pan'),
            ('Demo - Carne', 'Carne'),
            ('Demo - Queso', 'Queso'),
            ('Demo - Lechuga', 'Lechuga'),
            ('Demo - Tomate', 'Tomate'),
            ('Demo - Pollo', 'Pollo'),
            ('Demo - Arroz', 'Arroz'),
            ('Demo - Cafe', 'Café'),
            ('Demo - Naranja', 'Naranja'),
            ('Demo - Chocolate', 'Chocolate'),
            ('Demo - Harina', 'Harina'),
            ('Demo - Papa', 'Papa'),
            ('Demo - Sal', 'Sal')
        ) AS names(old_name, new_name) ON old.nombre = names.old_name
        JOIN public.ingredientes existing
          ON existing.nombre = names.new_name AND existing.id <> old.id
    ) THEN
        RAISE EXCEPTION 'Ya existe un ingrediente con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.productos old
        JOIN (VALUES
            ('Demo - Hamburguesa Clasica', 'Hamburguesa Clásica'),
            ('Demo - Pollo a la Plancha', 'Pollo a la Plancha'),
            ('Demo - Cafe Americano', 'Café Americano'),
            ('Demo - Jugo Natural', 'Jugo Natural'),
            ('Demo - Brownie', 'Brownie'),
            ('Demo - Papas Fritas', 'Papas Fritas'),
            ('Demo - Agua Mineral', 'Agua Mineral')
        ) AS names(old_name, new_name) ON old.nombre = names.old_name
        JOIN public.productos existing
          ON existing.nombre = names.new_name AND existing.id <> old.id
    ) THEN
        RAISE EXCEPTION 'Ya existe un producto con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.grupo_opcion old
        JOIN (VALUES
            ('Demo - Personalizaciones', 'Personalizaciones'),
            ('Demo - Tamano', 'Tamaño')
        ) AS names(old_name, new_name) ON old.nombre = names.old_name
        JOIN public.grupo_opcion existing
          ON existing.nombre = names.new_name AND existing.id <> old.id
    ) THEN
        RAISE EXCEPTION 'Ya existe un grupo de opciones con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.grupo_opcion old_group
        JOIN (VALUES
            ('Demo - Personalizaciones', 'Personalizaciones', 'Demo - Queso Extra', 'Queso Extra'),
            ('Demo - Personalizaciones', 'Personalizaciones', 'Demo - Sin Cebolla', 'Sin Cebolla'),
            ('Demo - Tamano', 'Tamaño', 'Demo - Grande', 'Grande'),
            ('Demo - Tamano', 'Tamaño', 'Demo - Familiar', 'Familiar')
        ) AS names(old_group, new_group, old_name, new_name)
          ON old_group.nombre = names.old_group
        JOIN public.opcion old_option
          ON old_option.id_grupo_opcion = old_group.id AND old_option.nombre = names.old_name
        JOIN public.grupo_opcion existing_group
          ON existing_group.nombre = names.new_group AND existing_group.id <> old_group.id
        JOIN public.opcion existing_option
          ON existing_option.id_grupo_opcion = existing_group.id
         AND existing_option.nombre = names.new_name
    ) THEN
        RAISE EXCEPTION 'Ya existe una opcion con el mismo grupo y nombre; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.grupo_opcion old_group
        JOIN (VALUES
            ('Demo - Personalizaciones', 'Demo - Queso Extra', 'Queso Extra'),
            ('Demo - Personalizaciones', 'Demo - Sin Cebolla', 'Sin Cebolla'),
            ('Demo - Tamano', 'Demo - Grande', 'Grande'),
            ('Demo - Tamano', 'Demo - Familiar', 'Familiar')
        ) AS names(group_name, old_name, new_name)
          ON old_group.nombre = names.group_name
        JOIN public.opcion old_option
          ON old_option.id_grupo_opcion = old_group.id AND old_option.nombre = names.old_name
        JOIN public.opcion existing_option
          ON existing_option.id_grupo_opcion = old_group.id
         AND existing_option.nombre = names.new_name
         AND existing_option.id <> old_option.id
    ) THEN
        RAISE EXCEPTION 'Ya existe una opcion con el nombre nuevo en el grupo actual; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.mesa old
        JOIN (VALUES
            ('Demo - Mesa 1', 'Mesa 1', 'mesa'),
            ('Demo - Mesa 2', 'Mesa 2', 'mesa'),
            ('Demo - Mesa 3', 'Mesa 3', 'mesa'),
            ('Demo - Mesa 4', 'Mesa 4', 'mesa'),
            ('Demo - Barra 1', 'Barra 1', 'barra')
        ) AS names(old_name, new_name, tipo) ON old.nombre = names.old_name
        JOIN public.mesa existing
          ON existing.nombre = names.new_name
         AND existing.tipo = names.tipo::public.tipo_mesa
         AND existing.id <> old.id
    ) THEN
        RAISE EXCEPTION 'Ya existe una mesa con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.proveedores old
        JOIN public.proveedores existing
          ON existing.nombre = 'Proveedor General' AND existing.id <> old.id
        WHERE old.nombre = 'Demo - Proveedor General'
    ) THEN
        RAISE EXCEPTION 'Ya existe el proveedor con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.empresa old
        JOIN public.empresa existing
          ON existing.nombre = 'Restaurante La Cabaña' AND existing.id <> old.id
        WHERE old.nombre = 'Restaurante Demo La Cabana'
    ) THEN
        RAISE EXCEPTION 'Ya existe la empresa con el nombre nuevo; resuelve el duplicado antes de renombrar.';
    END IF;
END
$rename$;

UPDATE public.categorias c
SET nombre = names.new_name
FROM (VALUES
    ('Demo - Platos', 'Platos'),
    ('Demo - Bebidas', 'Bebidas'),
    ('Demo - Postres', 'Postres'),
    ('Demo - Acompanamientos', 'Acompañamientos'),
    ('Demo - Gastos', 'Gastos')
) AS names(old_name, new_name)
WHERE c.nombre = names.old_name;

UPDATE public.ingredientes i
SET nombre = names.new_name
FROM (VALUES
    ('Demo - Pan', 'Pan'),
    ('Demo - Carne', 'Carne'),
    ('Demo - Queso', 'Queso'),
    ('Demo - Lechuga', 'Lechuga'),
    ('Demo - Tomate', 'Tomate'),
    ('Demo - Pollo', 'Pollo'),
    ('Demo - Arroz', 'Arroz'),
    ('Demo - Cafe', 'Café'),
    ('Demo - Naranja', 'Naranja'),
    ('Demo - Chocolate', 'Chocolate'),
    ('Demo - Harina', 'Harina'),
    ('Demo - Papa', 'Papa'),
    ('Demo - Sal', 'Sal')
) AS names(old_name, new_name)
WHERE i.nombre = names.old_name;

UPDATE public.productos p
SET nombre = names.new_name,
    descripcion = names.descripcion
FROM (VALUES
    ('Demo - Hamburguesa Clasica', 'Hamburguesa Clásica', 'Pan artesanal, carne, queso y vegetales.'),
    ('Demo - Pollo a la Plancha', 'Pollo a la Plancha', 'Pollo a la plancha acompañado de arroz.'),
    ('Demo - Cafe Americano', 'Café Americano', 'Café recién preparado.'),
    ('Demo - Jugo Natural', 'Jugo Natural', 'Jugo natural de naranja.'),
    ('Demo - Brownie', 'Brownie', 'Brownie de chocolate.'),
    ('Demo - Papas Fritas', 'Papas Fritas', 'Papas fritas como acompañamiento.'),
    ('Demo - Agua Mineral', 'Agua Mineral', 'Agua mineral embotellada.')
) AS names(old_name, new_name, descripcion)
WHERE p.nombre = names.old_name;

UPDATE public.grupo_opcion g
SET nombre = names.new_name
FROM (VALUES
    ('Demo - Personalizaciones', 'Personalizaciones'),
    ('Demo - Tamano', 'Tamaño')
) AS names(old_name, new_name)
WHERE g.nombre = names.old_name;

UPDATE public.opcion o
SET nombre = names.new_name
FROM (VALUES
    ('Demo - Queso Extra', 'Queso Extra'),
    ('Demo - Sin Cebolla', 'Sin Cebolla'),
    ('Demo - Grande', 'Grande'),
    ('Demo - Familiar', 'Familiar')
) AS names(old_name, new_name),
public.grupo_opcion g
WHERE o.nombre = names.old_name
  AND g.id = o.id_grupo_opcion
  AND g.nombre IN ('Personalizaciones', 'Tamaño');

UPDATE public.mesa m
SET nombre = names.new_name
FROM (VALUES
    ('Demo - Mesa 1', 'Mesa 1', 'mesa'),
    ('Demo - Mesa 2', 'Mesa 2', 'mesa'),
    ('Demo - Mesa 3', 'Mesa 3', 'mesa'),
    ('Demo - Mesa 4', 'Mesa 4', 'mesa'),
    ('Demo - Barra 1', 'Barra 1', 'barra')
) AS names(old_name, new_name, tipo)
WHERE m.nombre = names.old_name
  AND m.tipo = names.tipo::public.tipo_mesa;

UPDATE public.proveedores
SET nombre = 'Proveedor General',
    "NIT" = '900000001-1',
    correo = 'compras@proveedor.invalid'
WHERE nombre = 'Demo - Proveedor General';

UPDATE public.empresa
SET nombre = 'Restaurante La Cabaña',
    direccion = 'Pereira, Risaralda'
WHERE nombre = 'Restaurante Demo La Cabana';

UPDATE public.gasto
SET nombre = 'Compra de insumos',
    descripcion = replace(descripcion, 'Gasto historico de prueba ', 'Compra mensual de insumos ')
WHERE nombre = 'Demo - Compra de insumos'
   OR descripcion LIKE 'Gasto historico de prueba %';

UPDATE public.mesa_consumo
SET notas = 'Consumo registrado'
WHERE notas = 'Venta demo';

UPDATE public.caja
SET notas_cierre = replace(notas_cierre, 'DEMO_SEED_V1:', 'Cierre mensual ')
WHERE notas_cierre LIKE 'DEMO_SEED_V1:%';

COMMIT;
