-- DEMO DATA ONLY. Run after schema_base.sql and seed_initial_data.sql.
-- Adds catalog, cash-register, expense, and sales data without deleting rows.
-- Historical sales cover 2023 through the current month; each month is seeded once.

BEGIN;

SELECT pg_advisory_xact_lock(853102);

INSERT INTO public.configuracion (id, propina, valor_propina, alerta_bajo_stock)
VALUES (1, TRUE, 10.00, FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.categorias (nombre, estado)
SELECT demo.nombre, TRUE
FROM (VALUES
    ('Platos'),
    ('Bebidas'),
    ('Postres'),
    ('Acompañamientos'),
    ('Gastos')
) AS demo(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM public.categorias c WHERE c.nombre = demo.nombre
);

INSERT INTO public.ingredientes (nombre, estado)
SELECT demo.nombre, TRUE
FROM (VALUES
    ('Pan'),
    ('Carne'),
    ('Queso'),
    ('Lechuga'),
    ('Tomate'),
    ('Pollo'),
    ('Arroz'),
    ('Café'),
    ('Naranja'),
    ('Chocolate'),
    ('Harina'),
    ('Papa'),
    ('Sal')
) AS demo(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM public.ingredientes i WHERE i.nombre = demo.nombre
);

INSERT INTO public.proveedores (nombre, "NIT", telefono, correo)
SELECT 'Proveedor General', '900000001-1', '0000000000', 'compras@proveedor.invalid'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.proveedores p
    WHERE p.nombre = 'Proveedor General'
);

INSERT INTO public.productos (
    nombre, descripcion, cantidad, stock_minimo, precio,
    id_categoria, preparacion, estado, id_proveedor
)
SELECT
    demo.nombre,
    demo.descripcion,
    demo.cantidad,
    demo.stock_minimo,
    demo.precio,
    categoria.id,
    demo.preparacion,
    TRUE,
    (SELECT MIN(p.id) FROM public.proveedores p WHERE p.nombre = 'Proveedor General')
FROM (VALUES
    ('Hamburguesa Clásica', 'Pan artesanal, carne, queso y vegetales.', 120, 10, 18000.00, 'Platos', TRUE),
    ('Pollo a la Plancha', 'Pollo a la plancha acompañado de arroz.', 100, 8, 22000.00, 'Platos', TRUE),
    ('Café Americano', 'Café recién preparado.', 150, 15, 5000.00, 'Bebidas', TRUE),
    ('Jugo Natural', 'Jugo natural de naranja.', 4, 10, 8000.00, 'Bebidas', TRUE),
    ('Brownie', 'Brownie de chocolate.', 80, 6, 7000.00, 'Postres', TRUE),
    ('Papas Fritas', 'Papas fritas como acompañamiento.', 100, 12, 9000.00, 'Acompañamientos', TRUE),
    ('Agua Mineral', 'Agua mineral embotellada.', 200, 20, 4000.00, 'Bebidas', FALSE)
) AS demo(nombre, descripcion, cantidad, stock_minimo, precio, categoria, preparacion)
CROSS JOIN LATERAL (
    SELECT c.id
    FROM public.categorias c
    WHERE c.nombre = demo.categoria
    ORDER BY c.id
    LIMIT 1
) AS categoria
WHERE NOT EXISTS (
    SELECT 1 FROM public.productos p WHERE p.nombre = demo.nombre
);

INSERT INTO public.producto_ingredientes (id_producto, id_ingrediente)
SELECT producto.id, ingrediente.id
FROM (VALUES
    ('Hamburguesa Clásica', 'Pan'),
    ('Hamburguesa Clásica', 'Carne'),
    ('Hamburguesa Clásica', 'Queso'),
    ('Hamburguesa Clásica', 'Lechuga'),
    ('Hamburguesa Clásica', 'Tomate'),
    ('Pollo a la Plancha', 'Pollo'),
    ('Pollo a la Plancha', 'Arroz'),
    ('Café Americano', 'Café'),
    ('Jugo Natural', 'Naranja'),
    ('Brownie', 'Chocolate'),
    ('Brownie', 'Harina'),
    ('Papas Fritas', 'Papa'),
    ('Papas Fritas', 'Sal')
) AS demo(producto_nombre, ingrediente_nombre)
CROSS JOIN LATERAL (
    SELECT p.id
    FROM public.productos p
    WHERE p.nombre = demo.producto_nombre
    ORDER BY p.id
    LIMIT 1
) AS producto
CROSS JOIN LATERAL (
    SELECT i.id
    FROM public.ingredientes i
    WHERE i.nombre = demo.ingrediente_nombre
    ORDER BY i.id
    LIMIT 1
) AS ingrediente
ON CONFLICT (id_producto, id_ingrediente) DO NOTHING;

INSERT INTO public.grupo_opcion (nombre, estado)
SELECT demo.nombre, TRUE
FROM (VALUES ('Personalizaciones'), ('Tamaño')) AS demo(nombre)
WHERE NOT EXISTS (
    SELECT 1 FROM public.grupo_opcion g WHERE g.nombre = demo.nombre
);

INSERT INTO public.opcion (id_grupo_opcion, nombre, estado)
SELECT grupo.id, demo.nombre, TRUE
FROM (VALUES
    ('Personalizaciones', 'Queso Extra'),
    ('Personalizaciones', 'Sin Cebolla'),
    ('Tamaño', 'Grande'),
    ('Tamaño', 'Familiar')
) AS demo(grupo_nombre, nombre)
CROSS JOIN LATERAL (
    SELECT g.id
    FROM public.grupo_opcion g
    WHERE g.nombre = demo.grupo_nombre
    ORDER BY g.id
    LIMIT 1
) AS grupo
WHERE NOT EXISTS (
    SELECT 1
    FROM public.opcion o
    WHERE o.id_grupo_opcion = grupo.id AND o.nombre = demo.nombre
);

INSERT INTO public.producto_grupo_opcion (id_producto, id_grupo_opcion)
SELECT producto.id, grupo.id
FROM (VALUES
    ('Hamburguesa Clásica', 'Personalizaciones'),
    ('Pollo a la Plancha', 'Tamaño')
) AS demo(producto_nombre, grupo_nombre)
CROSS JOIN LATERAL (
    SELECT p.id
    FROM public.productos p
    WHERE p.nombre = demo.producto_nombre
    ORDER BY p.id
    LIMIT 1
) AS producto
CROSS JOIN LATERAL (
    SELECT g.id
    FROM public.grupo_opcion g
    WHERE g.nombre = demo.grupo_nombre
    ORDER BY g.id
    LIMIT 1
) AS grupo
ON CONFLICT (id_producto, id_grupo_opcion) DO NOTHING;

INSERT INTO public.mesa (nombre, estado, tipo)
SELECT demo.nombre, FALSE, demo.tipo::public.tipo_mesa
FROM (VALUES
    ('Mesa 1', 'mesa'),
    ('Mesa 2', 'mesa'),
    ('Mesa 3', 'mesa'),
    ('Mesa 4', 'mesa'),
    ('Barra 1', 'barra')
) AS demo(nombre, tipo)
WHERE NOT EXISTS (
    SELECT 1
    FROM public.mesa m
    WHERE m.nombre = demo.nombre AND m.tipo = demo.tipo::public.tipo_mesa
);

DO $demo$
DECLARE
    v_month date;
    v_month_end date;
    v_marker text;
    v_box_id integer;
    v_movement_id integer;
    v_month_index integer;
    v_sale integer;
    v_day integer;
    v_product_ids integer[];
    v_product_count integer;
    v_product_one integer;
    v_product_two integer;
    v_quantity_one integer;
    v_quantity_two integer;
    v_price_one numeric(10,2);
    v_price_two numeric(10,2);
    v_preparable_one boolean;
    v_preparable_two boolean;
    v_line_one numeric(10,2);
    v_line_two numeric(10,2);
    v_subtotal numeric(10,2);
    v_tip numeric(10,2);
    v_total numeric(10,2);
    v_method public.tipo_pago;
    v_detail_method public.metodo_pago;
    v_cash numeric(10,2);
    v_card numeric(10,2);
    v_transfer numeric(10,2);
    v_income_cash numeric(10,2);
    v_income_card numeric(10,2);
    v_income_transfer numeric(10,2);
    v_tip_total numeric(10,2);
    v_expense numeric(10,2);
    v_start_balance numeric(10,2) := 150000.00;
    v_final_balance numeric(10,2);
    v_expense_category integer;
    v_sale_at timestamp with time zone;
BEGIN
    SELECT ARRAY[
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Hamburguesa Clásica'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Pollo a la Plancha'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Café Americano'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Jugo Natural'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Brownie'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Papas Fritas'),
        (SELECT MIN(id) FROM public.productos WHERE nombre = 'Agua Mineral')
    ] INTO v_product_ids;

    SELECT COUNT(*) INTO v_product_count
    FROM unnest(v_product_ids) AS seeded_product(id)
    WHERE id IS NOT NULL;

    IF v_product_count <> 7 THEN
        RAISE EXCEPTION 'No se encontraron todos los productos demo; no se generaron ventas.';
    END IF;

    SELECT MIN(id) INTO v_expense_category
    FROM public.categorias
    WHERE nombre = 'Gastos';

    FOR v_month IN
        SELECT month_start::date
        FROM generate_series(
            DATE '2023-01-01',
            date_trunc('month', CURRENT_DATE)::date,
            INTERVAL '1 month'
        ) AS months(month_start)
    LOOP
        v_month_index :=
            (EXTRACT(YEAR FROM v_month)::integer - 2023) * 12
            + EXTRACT(MONTH FROM v_month)::integer - 1;
        v_month_end := (v_month + INTERVAL '1 month' - INTERVAL '1 day')::date;
        v_marker := 'Cierre mensual ' || to_char(v_month, 'YYYY-MM');

        SELECT c.id INTO v_box_id
        FROM public.caja c
        WHERE c.notas_cierre = v_marker
           OR c.notas_cierre = 'DEMO_SEED_V1:' || to_char(v_month, 'YYYY-MM')
        ORDER BY c.id
        LIMIT 1;

        IF v_box_id IS NOT NULL THEN
            CONTINUE;
        END IF;

        INSERT INTO public.caja (
            fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia,
            egresos_efectivo, egresos_tarjeta, egresos_transferencia,
            total_propinas, balance_inicial, balance_final, estado,
            efectivo_contado, diferencia_caja, notas_cierre
        )
        VALUES (
            LEAST(v_month_end, CURRENT_DATE),
            0, 0, 0, 0, 0, 0, 0,
            v_start_balance, v_start_balance, 'cerrada',
            v_start_balance, 0, v_marker
        )
        RETURNING id INTO v_box_id;

        FOR v_sale IN 1..5 LOOP
            v_product_one := v_product_ids[((v_month_index + v_sale - 1) % 7) + 1];
            v_product_two := v_product_ids[((v_month_index + v_sale + 2) % 7) + 1];
            v_quantity_one := 1 + ((v_month_index + v_sale) % 3);
            v_quantity_two := 1 + ((v_month_index + v_sale + 1) % 2);

            SELECT precio::numeric, preparacion
            INTO v_price_one, v_preparable_one
            FROM public.productos
            WHERE id = v_product_one;

            SELECT precio::numeric, preparacion
            INTO v_price_two, v_preparable_two
            FROM public.productos
            WHERE id = v_product_two;

            v_line_one := round(v_price_one * v_quantity_one, 2);
            v_line_two := round(v_price_two * v_quantity_two, 2);
            v_subtotal := v_line_one + v_line_two;
            v_tip := round(v_subtotal * 0.10, 2);
            v_total := v_subtotal + v_tip;

            v_day := LEAST(3 + (6 * (v_sale - 1)), EXTRACT(DAY FROM v_month_end)::integer);
            IF v_month = date_trunc('month', CURRENT_DATE)::date THEN
                v_day := LEAST(v_day, EXTRACT(DAY FROM CURRENT_DATE)::integer);
            END IF;

            v_sale_at := LEAST(
                ((v_month + v_day - 1) + TIME '12:00') AT TIME ZONE 'America/Bogota',
                CURRENT_TIMESTAMP
            );

            v_method := CASE v_sale
                WHEN 1 THEN 'Efectivo'::public.tipo_pago
                WHEN 2 THEN 'Tarjeta'::public.tipo_pago
                WHEN 3 THEN 'Transferencia'::public.tipo_pago
                WHEN 4 THEN 'Mixto'::public.tipo_pago
                ELSE 'Efectivo'::public.tipo_pago
            END;

            INSERT INTO public.movimiento (
                estado, propina, domicilio, total, id_caja, metodo,
                id_cliente, id_mesero, "fecha-hora"
            )
            VALUES (
                TRUE, v_tip, 0, v_total, v_box_id, v_method,
                NULL, NULL, v_sale_at
            )
            RETURNING id INTO v_movement_id;

            IF v_method = 'Mixto'::public.tipo_pago THEN
                v_cash := round(v_total * 0.60, 2);
                v_card := v_total - v_cash;

                INSERT INTO public.metodos_pagos (movimiento_id, valor, metodo)
                VALUES
                    (v_movement_id, v_cash, 'Efectivo'::public.metodo_pago),
                    (v_movement_id, v_card, 'Tarjeta'::public.metodo_pago);
            ELSE
                v_detail_method := v_method::text::public.metodo_pago;

                INSERT INTO public.metodos_pagos (movimiento_id, valor, metodo)
                VALUES (v_movement_id, v_total, v_detail_method);
            END IF;

            INSERT INTO public.mesa_consumo (
                id_producto, id_mov, cantidad, precio_unitario, subtotal,
                preparado, notas, descuento, fecha_creacion
            )
            VALUES
                (
                    v_product_one, v_movement_id, v_quantity_one, v_price_one, v_line_one,
                    CASE WHEN v_preparable_one THEN TRUE ELSE NULL END,
                    'Consumo registrado', 0, v_sale_at
                ),
                (
                    v_product_two, v_movement_id, v_quantity_two, v_price_two, v_line_two,
                    CASE WHEN v_preparable_two THEN TRUE ELSE NULL END,
                    'Consumo registrado', 0, v_sale_at
                );
        END LOOP;

        v_expense := 30000 + ((v_month_index % 5) * 5000);
        INSERT INTO public.gasto (nombre, descripcion, valor, fecha_hora, categoria, id_caja)
        VALUES (
            'Compra de insumos',
            'Compra mensual de insumos ' || to_char(v_month, 'YYYY-MM'),
            v_expense,
            LEAST(
                (LEAST(v_month_end, CURRENT_DATE)::timestamp + TIME '16:00')
                    AT TIME ZONE 'America/Bogota',
                CURRENT_TIMESTAMP
            ),
            v_expense_category,
            v_box_id
        );

        SELECT
            COALESCE(SUM(CASE WHEN mp.metodo = 'Efectivo'::public.metodo_pago THEN mp.valor ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mp.metodo = 'Tarjeta'::public.metodo_pago THEN mp.valor ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mp.metodo = 'Transferencia'::public.metodo_pago THEN mp.valor ELSE 0 END), 0)
        INTO v_income_cash, v_income_card, v_income_transfer
        FROM public.metodos_pagos mp
        JOIN public.movimiento m ON m.id = mp.movimiento_id
        WHERE m.id_caja = v_box_id;

        SELECT COALESCE(SUM(m.propina), 0)
        INTO v_tip_total
        FROM public.movimiento m
        WHERE m.id_caja = v_box_id
          AND m.estado IS DISTINCT FROM FALSE
          AND COALESCE(m.total, 0) > 0;

        v_final_balance :=
            v_start_balance
            + v_income_cash + v_income_card + v_income_transfer
            - v_expense - v_tip_total;

        UPDATE public.caja
        SET ingresos_efectivo = v_income_cash,
            ingresos_tarjeta = v_income_card,
            ingresos_transferencia = v_income_transfer,
            egresos_efectivo = v_expense,
            egresos_tarjeta = 0,
            egresos_transferencia = 0,
            total_propinas = v_tip_total,
            balance_final = v_final_balance,
            efectivo_contado = v_final_balance,
            diferencia_caja = 0
        WHERE id = v_box_id;
    END LOOP;
END
$demo$;

INSERT INTO public.caja (
    fecha, ingresos_efectivo, ingresos_tarjeta, ingresos_transferencia,
    egresos_efectivo, egresos_tarjeta, egresos_transferencia,
    total_propinas, balance_inicial, balance_final, estado
)
SELECT CURRENT_DATE, 0, 0, 0, 0, 0, 0, 0, 100000, 100000, 'abierta'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.caja c
    WHERE c.estado = 'abierta'::public.estado_caja_mesa
);

COMMIT;

SELECT
    EXTRACT(YEAR FROM m."fecha-hora")::integer AS anio,
    COUNT(*) AS ventas,
    ROUND(SUM(m.total), 2) AS ingresos
FROM public.movimiento m
JOIN public.caja c ON c.id = m.id_caja
WHERE c.notas_cierre LIKE 'Cierre mensual %'
  AND m.estado IS DISTINCT FROM FALSE
  AND COALESCE(m.total, 0) > 0
GROUP BY EXTRACT(YEAR FROM m."fecha-hora")
ORDER BY anio;
