from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from modules.movimientos.movimientos_schema import MovimientoCreate, MovimientoResponse, MovimientoUpdate
from modules.metodos_pagos.metodo_pago_service import reemplazar_desglose_pago
from core.logger import logger

class MovimientoService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all_movimientos(self) -> list[dict]:
        logger.info("SQL Nativo: Consultando todos los movimientos.")
        query = text("""
                        SELECT m.id, m.estado, m.propina, m.domicilio, m.total, m.id_caja,
                   m.metodo, m.id_cliente, m.id_mesero, m."fecha-hora" AS fecha_hora,
                                     b.id_mesa, c.estado AS caja_estado
            FROM movimiento m
            LEFT JOIN barra b ON b.id_movimiento = m.id
                        LEFT JOIN caja c ON c.id = m.id_caja
            ORDER BY m.id ASC;
        """)
        result = await self.db.execute(query)
        return [dict(row) for row in result.mappings().all()]

    async def get_movimientos_paginados(
        self,
        fecha_desde: date | None,
        fecha_hasta: date | None,
        page: int,
        page_size: int,
    ) -> dict:
        conditions = ["COALESCE(m.total, 0) <> 0"]
        filter_params = {}
        if fecha_desde is not None:
            conditions.append(
                """m."fecha-hora" >= (CAST(:fecha_desde AS date)::timestamp
                   AT TIME ZONE 'America/Bogota')"""
            )
            filter_params["fecha_desde"] = fecha_desde
        if fecha_hasta is not None:
            conditions.append(
                """m."fecha-hora" < ((CAST(:fecha_hasta AS date) + 1)::timestamp
                   AT TIME ZONE 'America/Bogota')"""
            )
            filter_params["fecha_hasta"] = fecha_hasta
        where_clause = " AND ".join(conditions)

        summary_result = await self.db.execute(
            text(f"""
                SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(m.total) FILTER (
                        WHERE m.estado IS DISTINCT FROM FALSE
                    ), 0) AS total_ingresos
                FROM public.movimiento m
                WHERE {where_clause};
            """),
            filter_params,
        )
        summary = summary_result.mappings().one()
        page_params = {
            **filter_params,
            "limit": page_size,
            "offset": (page - 1) * page_size,
        }

        rows_result = await self.db.execute(
            text(f"""
                WITH pagina_movimientos AS (
                    SELECT
                        m.id, m.estado, m.propina, m.domicilio, m.total, m.id_caja,
                        m.metodo, m.id_cliente, m.id_mesero, m."fecha-hora"
                    FROM public.movimiento m
                    WHERE {where_clause}
                    ORDER BY m."fecha-hora" DESC NULLS LAST, m.id DESC
                    LIMIT :limit OFFSET :offset
                )
                SELECT
                    m.id, m.estado, m.propina, m.domicilio, m.total, m.id_caja,
                    m.metodo, m.id_cliente, m.id_mesero,
                    m."fecha-hora" AS fecha_hora,
                    b.id_mesa, c.estado AS caja_estado
                FROM pagina_movimientos m
                LEFT JOIN LATERAL (
                    SELECT barra.id_mesa
                    FROM public.barra
                    WHERE barra.id_movimiento = m.id
                    ORDER BY barra.id_mesa
                    LIMIT 1
                ) b ON TRUE
                LEFT JOIN public.caja c ON c.id = m.id_caja
                ORDER BY m."fecha-hora" DESC NULLS LAST, m.id DESC;
            """),
            page_params,
        )
        total = summary["total"]
        return {
            "items": [dict(row) for row in rows_result.mappings().all()],
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": max(1, (total + page_size - 1) // page_size),
            "total_ingresos": summary["total_ingresos"],
        }

    async def get_movimiento_detalle(self, movimiento_id: int) -> dict:
        exists = await self.db.execute(
            text("SELECT 1 FROM public.movimiento WHERE id = :id;"),
            {"id": movimiento_id},
        )
        if exists.first() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="El movimiento no existe.",
            )

        consumos_result = await self.db.execute(
            text("""
                SELECT id, id_producto, cantidad, subtotal, notas
                FROM public.mesa_consumo
                WHERE id_mov = :id
                ORDER BY id ASC;
            """),
            {"id": movimiento_id},
        )
        pagos_result = await self.db.execute(
            text("""
                SELECT id, movimiento_id, valor, metodo
                FROM public.metodos_pagos
                WHERE movimiento_id = :id
                ORDER BY id ASC;
            """),
            {"id": movimiento_id},
        )
        return {
            "consumos": [dict(row) for row in consumos_result.mappings().all()],
            "pagos": [dict(row) for row in pagos_result.mappings().all()],
        }

    async def create_movimiento(self, movimiento_data: MovimientoCreate) -> dict:
        logger.info("SQL Nativo: Insertando movimiento.")

        if movimiento_data.id_mesa is not None:
            barra = (await self.db.execute(text("""
                SELECT m.id, m.tipo, m.estado
                FROM mesa m
                WHERE m.id = :id_mesa;
            """), {"id_mesa": movimiento_data.id_mesa})).mappings().first()
            if not barra:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="La barra no existe.")
            if barra["tipo"] != "barra":
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La mesa indicada no es una barra.")
            if barra["estado"] is not True:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La barra debe estar activa para asociar un movimiento.")

        caja_id = movimiento_data.id_caja
        if caja_id is None:
            caja = (await self.db.execute(
                text("""
                    SELECT id
                    FROM caja
                    WHERE LOWER(TRIM(estado::text)) = 'abierta'
                    ORDER BY id DESC
                    LIMIT 1
                    FOR UPDATE;
                """)
            )).first()
            if not caja:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No hay una caja abierta.")
            caja_id = caja.id
        else:
            caja = (await self.db.execute(
                text("""
                    SELECT id
                    FROM caja
                    WHERE id = :id AND LOWER(TRIM(estado::text)) = 'abierta'
                    FOR UPDATE;
                """),
                {"id": caja_id},
            )).first()
            if not caja:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La caja asociada debe estar abierta.")

        query = text("""
            INSERT INTO movimiento (estado, propina, domicilio, total, id_caja, metodo, id_cliente, id_mesero, "fecha-hora")
            VALUES (:estado, :propina, :domicilio, :total, :id_caja, :metodo, :id_cliente, :id_mesero,
                    COALESCE(:fecha_hora, CURRENT_TIMESTAMP))
            RETURNING id, estado, propina, domicilio, total, id_caja, metodo, id_cliente, id_mesero, "fecha-hora" AS fecha_hora;
        """)
        try:
            result = await self.db.execute(query, {
                "estado": movimiento_data.estado,
                "propina": movimiento_data.propina,
                "domicilio": movimiento_data.domicilio,
                "total": movimiento_data.total,
                "id_caja": caja_id,
                "metodo": movimiento_data.metodo,
                "id_cliente": movimiento_data.id_cliente,
                "id_mesero": movimiento_data.id_mesero,
                "fecha_hora": movimiento_data.fecha_hora
            })
            movimiento = dict(result.mappings().first())
            movimiento["id_mesa"] = movimiento_data.id_mesa
            if movimiento_data.id_mesa is not None:
                await self.db.execute(
                    text("INSERT INTO barra (id_mesa, id_movimiento) VALUES (:id_mesa, :id_movimiento);"),
                    {"id_mesa": movimiento_data.id_mesa, "id_movimiento": movimiento["id"]},
                )
            await self.db.commit()
            return movimiento
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error al insertar movimiento: {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno del servidor.")

    async def update_movimiento(self, target_movimiento_id: int, movimiento_update: MovimientoUpdate, current_user: dict) -> dict:
        logger.info(f"Usuario '{current_user['username']}' intenta modificar el movimiento ID: {target_movimiento_id}")

        # Verificar que el usuario objetivo realmente exista en PostgreSQL
        check = await self.db.execute(text("""
            SELECT m.id, m.total, m.estado, m.id_caja
            FROM movimiento m
            WHERE m.id = :id;
        """), {"id": target_movimiento_id})
        existing_movement = check.mappings().first()
        if existing_movement is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El movimiento a modificar no existe.")

        if movimiento_update.pagos is not None and movimiento_update.metodo is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Debe indicar el método para guardar su desglose.")

        if movimiento_update.metodo is not None:
            if existing_movement["estado"] is False or existing_movement["id_caja"] is None:
                await self.db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Solo se puede cambiar el método de pago de movimientos activos en una caja abierta.",
                )
            caja_result = await self.db.execute(
                text("SELECT estado FROM caja WHERE id = :id FOR UPDATE;"),
                {"id": existing_movement["id_caja"]},
            )
            caja = caja_result.mappings().first()
            if caja is None or str(caja["estado"]).strip().lower() != "abierta":
                await self.db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Solo se puede cambiar el método de pago de movimientos activos en una caja abierta.",
                )

        # Construcción dinámica de la sentencia UPDATE con SQL Puro
        update_fields = []
        params = {"id": target_movimiento_id}

        if movimiento_update.estado is not None:
            update_fields.append("estado = :estado")
            params["estado"] = movimiento_update.estado

        if movimiento_update.propina is not None:
            update_fields.append("propina = :propina")
            params["propina"] = movimiento_update.propina

        if movimiento_update.domicilio is not None:
            update_fields.append("domicilio = :domicilio")
            params["domicilio"] = movimiento_update.domicilio

        if movimiento_update.total is not None:
            update_fields.append("total = :total")
            params["total"] = movimiento_update.total

        if movimiento_update.id_caja is not None:
            update_fields.append("id_caja = :id_caja")
            params["id_caja"] = movimiento_update.id_caja

        if movimiento_update.metodo is not None:
            update_fields.append("metodo = :metodo")
            params["metodo"] = movimiento_update.metodo

        if movimiento_update.id_cliente is not None:
            update_fields.append("id_cliente = :id_cliente")
            params["id_cliente"] = movimiento_update.id_cliente

        if movimiento_update.id_mesero is not None:
            update_fields.append("id_mesero = :id_mesero")
            params["id_mesero"] = movimiento_update.id_mesero

        if movimiento_update.fecha_hora is not None:
            update_fields.append('"fecha-hora" = :fecha_hora')
            params["fecha_hora"] = movimiento_update.fecha_hora

        if not update_fields:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se enviaron datos para actualizar.")

        caja_filters = []
        if movimiento_update.estado is False:
            params["caja_id_guard"] = movimiento_update.id_caja
            caja_filters.append("""
                AND EXISTS (
                    SELECT 1 FROM caja c
                    WHERE c.id = COALESCE(:caja_id_guard, movimiento.id_caja)
                      AND LOWER(TRIM(c.estado::text)) = 'abierta'
                )
            """)
        if movimiento_update.metodo is not None:
            caja_filters.append("""
                AND movimiento.estado IS DISTINCT FROM FALSE
                AND EXISTS (
                    SELECT 1 FROM caja c
                    WHERE c.id = movimiento.id_caja
                      AND LOWER(TRIM(c.estado::text)) = 'abierta'
                )
            """)

        # Unificar campos en el string de SQL Nativo
        query_str = f"""
            UPDATE movimiento 
            SET {', '.join(update_fields)} 
            WHERE id = :id {' '.join(caja_filters)}
            RETURNING id, estado, propina, domicilio, total, id_caja, metodo, id_cliente, id_mesero, "fecha-hora" AS fecha_hora;
        """
        
        try:
            result = await self.db.execute(text(query_str), params)
            updated_movement = result.mappings().first()
            if updated_movement is None:
                await self.db.rollback()
                if movimiento_update.metodo is not None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No se puede cambiar el método de pago de un movimiento cuya caja no está abierta.",
                    )
                if movimiento_update.estado is False:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="No se puede desactivar un movimiento cuya caja no está abierta.",
                    )
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El movimiento a modificar no existe.")
            if movimiento_update.metodo is not None:
                await reemplazar_desglose_pago(
                    self.db,
                    target_movimiento_id,
                    movimiento_update.metodo,
                    movimiento_update.pagos or [],
                    updated_movement["total"],
                )
            await self.db.commit()
            return dict(updated_movement)
        except HTTPException:
            await self.db.rollback()
            raise
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error crítico en actualización SQL: {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al procesar los datos.")
