from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import get_current_user
from core.mesa_realtime import notify_mesa_change
from modules.movimientos.movimientos_schema import (
    MovimientoCreate,
    MovimientoDetalleResponse,
    MovimientoPaginaResponse,
    MovimientoResponse,
    MovimientoUpdate,
)
from modules.movimientos.movimientos_service import MovimientoService

router = APIRouter(prefix="/movimientos", tags=["movimientos"])

@router.get("/historial", response_model=MovimientoPaginaResponse, status_code=status.HTTP_200_OK)
async def read_movimientos_historial(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado. Rol insuficiente.")
    if fecha_desde is not None and fecha_hasta is not None and fecha_desde > fecha_hasta:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La fecha inicial no puede ser posterior a la final.")
    service = MovimientoService(db)
    return await service.get_movimientos_paginados(fecha_desde, fecha_hasta, page, page_size)

@router.get("/", response_model=list[MovimientoResponse], status_code=status.HTTP_200_OK)
async def read_movimientos(
    db: AsyncSession = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    """Acceso restringido: Solo Administradores y Cajeros pueden listar proveedores."""
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado. Rol insuficiente.")
    service = MovimientoService(db)
    return await service.get_all_movimientos()

@router.get("/{movimiento_id}/detalle", response_model=MovimientoDetalleResponse, status_code=status.HTTP_200_OK)
async def read_movimiento_detalle(
    movimiento_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado. Rol insuficiente.")
    service = MovimientoService(db)
    return await service.get_movimiento_detalle(movimiento_id)

@router.post("/", response_model=MovimientoResponse, status_code=status.HTTP_201_CREATED)
async def add_movimiento(
    movimiento_in: MovimientoCreate, 
    db: AsyncSession = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    """Acceso restringido: Personal autorizado puede registrar movimientos."""
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado. Rol insuficiente.")
    service = MovimientoService(db)
    movimiento = await service.create_movimiento(movimiento_in)
    await notify_mesa_change(db)
    return movimiento

@router.put("/{movimiento_id}", response_model=MovimientoResponse, status_code=status.HTTP_200_OK)
async def update_existing_movimiento(
    movimiento_id: int, 
    movimiento_data: MovimientoUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: dict = Depends(get_current_user)
):
    """
    Endpoint Protegido por Token y RBAC:
    - Admin y cajero: Modifica a cualquier movimiento sin restricciones.
    """
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso denegado. Rol insuficiente.")
    if movimiento_data.metodo is not None and current_user["role_name"] not in ["Administrador", "Cajero"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo administradores y cajeros pueden cambiar el método de pago.")
    service = MovimientoService(db)
    movimiento = await service.update_movimiento(movimiento_id, movimiento_data, current_user)
    await notify_mesa_change(db)
    return movimiento
