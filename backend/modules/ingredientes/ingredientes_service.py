from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from modules.ingredientes.ingredientes_schema import (
    GastoCreate,
    GastoUpdate,
    IngredienteCreate,
    IngredienteUpdate,
)


class IngredienteService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(self) -> list[dict]:
        result = await self.db.execute(
            text("SELECT id, nombre, COALESCE(estado, FALSE) AS estado FROM ingredientes ORDER BY id ASC;")
        )
        return [dict(row) for row in result.mappings().all()]

    async def create(self, data: IngredienteCreate) -> dict:
        try:
            result = await self.db.execute(
                text("""
                    INSERT INTO ingredientes (nombre, estado)
                    VALUES (:nombre, TRUE)
                    RETURNING id, nombre, COALESCE(estado, FALSE) AS estado;
                """),
                {"nombre": data.nombre},
            )
            await self.db.commit()
            return dict(result.mappings().first())
        except Exception as error:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fue posible crear el ingrediente.",
            ) from error

    async def update(self, item_id: int, data: IngredienteUpdate) -> dict:
        if data.nombre is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No se enviaron datos para actualizar.",
            )
        try:
            result = await self.db.execute(
                text("""
                    UPDATE ingredientes
                    SET nombre = :nombre
                    WHERE id = :id
                    AND COALESCE(estado, FALSE) = TRUE
                    RETURNING id, nombre, COALESCE(estado, FALSE) AS estado;
                """),
                {"id": item_id, "nombre": data.nombre},
            )
            row = result.mappings().first()
            if row is None:
                await self.db.rollback()
                raise HTTPException(status_code=404, detail="El ingrediente no existe o está desactivado.")
            await self.db.commit()
            return dict(row)
        except HTTPException:
            raise
        except Exception as error:
            await self.db.rollback()
            raise HTTPException(status_code=400, detail="No fue posible actualizar el ingrediente.") from error

    async def delete(self, item_id: int) -> None:
        result = await self.db.execute(
            text("""
                UPDATE ingredientes
                SET estado = FALSE
                WHERE id = :id AND COALESCE(estado, FALSE) = TRUE
                RETURNING id;
            """),
            {"id": item_id},
        )
        if result.first() is None:
            await self.db.rollback()
            raise HTTPException(status_code=404, detail="El ingrediente no existe o ya está desactivado.")
        await self.db.commit()

    async def change_state(self, item_id: int, estado: bool) -> dict:
        try:
            result = await self.db.execute(
                text("""
                    UPDATE ingredientes
                    SET estado = :estado
                    WHERE id = :id
                    RETURNING id, nombre, COALESCE(estado, FALSE) AS estado;
                """),
                {"id": item_id, "estado": estado},
            )
            row = result.mappings().first()
            if row is None:
                await self.db.rollback()
                raise HTTPException(status_code=404, detail="El ingrediente no existe.")
            await self.db.commit()
            return dict(row)
        except HTTPException:
            raise
        except Exception as error:
            await self.db.rollback()
            raise HTTPException(status_code=400, detail="No fue posible cambiar el estado del ingrediente.") from error


class GastoService:
    columns = "g.id, g.nombre, g.descripcion, g.valor, g.fecha_hora, g.categoria, g.id_caja, c.nombre AS categoria_nombre"

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(self) -> list[dict]:
        result = await self.db.execute(
            text(f"""
                SELECT {self.columns}
                FROM gasto g
                LEFT JOIN categorias c ON c.id = g.categoria
                ORDER BY g.id ASC;
            """)
        )
        return [dict(row) for row in result.mappings().all()]

    async def get_paginados(
        self,
        fecha_desde: date | None,
        fecha_hasta: date | None,
        page: int,
        page_size: int,
    ) -> dict:
        conditions = []
        filter_params = {}
        if fecha_desde is not None:
            conditions.append(
                """g.fecha_hora >= (CAST(:fecha_desde AS date)::timestamp
                   AT TIME ZONE 'America/Bogota')"""
            )
            filter_params["fecha_desde"] = fecha_desde
        if fecha_hasta is not None:
            conditions.append(
                """g.fecha_hora < ((CAST(:fecha_hasta AS date) + 1)::timestamp
                   AT TIME ZONE 'America/Bogota')"""
            )
            filter_params["fecha_hasta"] = fecha_hasta
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        summary_result = await self.db.execute(
            text(f"""
                SELECT COUNT(*) AS total,
                       COALESCE(SUM(g.valor), 0) AS total_gastos
                FROM public.gasto g
                {where_clause};
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
                SELECT {self.columns}
                FROM public.gasto g
                LEFT JOIN public.categorias c ON c.id = g.categoria
                {where_clause}
                ORDER BY g.fecha_hora DESC NULLS LAST, g.id DESC
                LIMIT :limit OFFSET :offset;
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
            "total_gastos": summary["total_gastos"],
        }

    async def create(self, data: GastoCreate) -> dict:
        query = text(f"""
            INSERT INTO gasto (nombre, descripcion, valor, fecha_hora, categoria, id_caja)
            VALUES (:nombre, :descripcion, :valor,
                COALESCE(:fecha_hora, CURRENT_TIMESTAMP), :categoria, :id_caja)
            RETURNING id, nombre, descripcion, valor, fecha_hora, categoria, id_caja;
        """)
        gasto = await self._execute_write(query, data.model_dump())
        return await self._with_categoria_nombre(gasto)

    async def update(self, item_id: int, data: GastoUpdate) -> dict:
        values = data.model_dump(exclude_none=True)
        if not values:
            raise HTTPException(status_code=400, detail="No se enviaron datos para actualizar.")
        assignments = [f"{field} = :{field}" for field in values]
        values["id"] = item_id
        query = text(f"""
            UPDATE gasto SET {', '.join(assignments)}
            WHERE id = :id
            RETURNING id, nombre, descripcion, valor, fecha_hora, categoria, id_caja;
        """)
        gasto = await self._execute_write(query, values, missing_detail="El gasto no existe.")
        return await self._with_categoria_nombre(gasto)

    async def _with_categoria_nombre(self, gasto: dict) -> dict:
        result = await self.db.execute(
            text("SELECT nombre FROM categorias WHERE id = :categoria;"),
            {"categoria": gasto["categoria"]},
        ) if gasto["categoria"] is not None else None
        gasto["categoria_nombre"] = result.scalar_one_or_none() if result is not None else None
        return gasto

    async def delete(self, item_id: int) -> None:
        result = await self.db.execute(
            text("DELETE FROM gasto WHERE id = :id RETURNING id;"),
            {"id": item_id},
        )
        if result.first() is None:
            await self.db.rollback()
            raise HTTPException(status_code=404, detail="El gasto no existe.")
        await self.db.commit()

    async def _execute_write(self, query, params: dict, missing_detail: str = "") -> dict:
        try:
            result = await self.db.execute(query, params)
            row = result.mappings().first()
            if row is None:
                await self.db.rollback()
                raise HTTPException(status_code=404, detail=missing_detail)
            await self.db.commit()
            return dict(row)
        except HTTPException:
            raise
        except Exception as error:
            await self.db.rollback()
            raise HTTPException(status_code=400, detail="No fue posible guardar el gasto.") from error