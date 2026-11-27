from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from modules.metodos_pagos.metodo_pago_schema import (
    MetodoPagoDetalle,
    MetodoPagoMovimientoEnum,
    MetodoPCreate,
    MetodoPResponse,
    MetodoPUpdate,
)
from core.logger import logger


def validar_desglose_pago(
    metodo: MetodoPagoMovimientoEnum,
    pagos: list[MetodoPagoDetalle],
    total: Decimal | float,
) -> list[MetodoPagoDetalle]:
    metodo_value = metodo.value
    total_value = Decimal(str(total))

    if not pagos:
        if metodo_value == MetodoPagoMovimientoEnum.mixto.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Para un pago mixto, registre el valor pagado con cada método.",
            )
        if total_value == 0:
            return []
        pagos = [MetodoPagoDetalle(metodo=metodo_value, valor=total_value)]

    if sum((pago.valor for pago in pagos), Decimal("0")) != total_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La suma de los métodos de pago debe ser igual al total de la cuenta.",
        )

    metodos = {pago.metodo.value for pago in pagos}
    if metodo_value == MetodoPagoMovimientoEnum.mixto.value:
        if len(metodos) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un pago mixto debe incluir al menos dos métodos distintos.",
            )
    elif len(pagos) != 1 or metodos != {metodo_value}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El desglose debe coincidir con el método de pago seleccionado.",
        )

    return pagos


async def reemplazar_desglose_pago(
    db: AsyncSession,
    movimiento_id: int,
    metodo: MetodoPagoMovimientoEnum,
    pagos: list[MetodoPagoDetalle],
    total: Decimal | float,
) -> None:
    pagos_validados = validar_desglose_pago(metodo, pagos, total)
    await db.execute(
        text("DELETE FROM metodos_pagos WHERE movimiento_id = :movimiento_id;"),
        {"movimiento_id": movimiento_id},
    )
    for pago in pagos_validados:
        await db.execute(
            text("""
                INSERT INTO metodos_pagos (movimiento_id, valor, metodo)
                VALUES (:movimiento_id, :valor, :metodo);
            """),
            {
                "movimiento_id": movimiento_id,
                "valor": pago.valor,
                "metodo": pago.metodo.value,
            },
        )


class Metodo_pService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all_metodo_pagos(self) -> list[dict]:
        logger.info("SQL Nativo: Consultando todos los métodos de pago.")
        query = text("SELECT * FROM metodos_pagos ORDER BY id ASC;")
        result = await self.db.execute(query)
        return [dict(row) for row in result.mappings().all()]

    async def create_metodo_pago(self, metodo_pago_data: MetodoPCreate) -> dict:
        logger.info(f"SQL Nativo: Insertando método de pago al movimiento {metodo_pago_data.movimiento_id}")

        query = text("INSERT INTO metodos_pagos (movimiento_id, valor, metodo) VALUES (:movimiento_id, :valor, :metodo) RETURNING id, movimiento_id, valor, metodo;")
        try:
            result = await self.db.execute(query, {
                "movimiento_id": metodo_pago_data.movimiento_id,
                "valor": metodo_pago_data.valor,
                "metodo": metodo_pago_data.metodo
            })
            await self.db.commit()
            return dict(result.mappings().first())
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error al insertar método de pago: {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error interno del servidor.")

    async def update_metodo_pago(self, target_metodo_pago_id: int, metodo_pago_update: MetodoPUpdate, current_user: dict) -> dict:
        logger.info(f"Usuario '{current_user['username']}' intenta modificar el método de pago ID: {target_metodo_pago_id}")

        # Verificar que el usuario objetivo realmente exista en PostgreSQL
        check = await self.db.execute(text("SELECT id FROM movimiento WHERE id = :id;"), {"id": target_metodo_pago_id})
        if not check.first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="El método de pago a modificar no existe.")

        # Construcción dinámica de la sentencia UPDATE con SQL Puro
        update_fields = []
        params = {"id": target_metodo_pago_id}

        if metodo_pago_update.movimiento_id is not None:
            update_fields.append("movimiento_id = :movimiento_id")
            params["movimiento_id"] = metodo_pago_update.movimiento_id

        if metodo_pago_update.valor is not None:
            update_fields.append("valor = :valor")
            params["valor"] = metodo_pago_update.valor

        if metodo_pago_update.metodo is not None:
            update_fields.append("metodo = :metodo")
            params["metodo"] = metodo_pago_update.metodo

        if not update_fields:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se enviaron datos para actualizar.")

        # Unificar campos en el string de SQL Nativo
        query_str = f"""
            UPDATE metodos_pagos
            SET {', '.join(update_fields)} 
            WHERE id = :id 
            RETURNING id, movimiento_id, valor, metodo;
        """
        
        try:
            result = await self.db.execute(text(query_str), params)
            await self.db.commit()
            return dict(result.mappings().first())
        except Exception as e:
            await self.db.rollback()
            logger.error(f"Error crítico en actualización SQL: {str(e)}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error al procesar los datos.")
