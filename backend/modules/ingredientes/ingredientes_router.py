from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user
from modules.ingredientes.ingredientes_schema import (
    GastoCreate,
    GastoPaginaResponse,
    GastoResponse,
    GastoUpdate,
    IngredienteCreate,
    IngredienteEstadoUpdate,
    IngredienteResponse,
    IngredienteUpdate,
)
from modules.ingredientes.ingredientes_service import GastoService, IngredienteService


router = APIRouter(tags=["Ingredientes y gastos"])


def require_staff(current_user: dict) -> None:
    if current_user["role_name"] not in ["Administrador", "Cajero", "Mesero"]:
        raise HTTPException(status_code=403, detail="Acceso denegado. Rol insuficiente.")


@router.get("/ingredientes/", response_model=list[IngredienteResponse])
async def list_ingredientes(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await IngredienteService(db).get_all()


@router.post("/ingredientes/", response_model=IngredienteResponse, status_code=status.HTTP_201_CREATED)
async def create_ingrediente(data: IngredienteCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await IngredienteService(db).create(data)


@router.put("/ingredientes/{item_id}", response_model=IngredienteResponse)
async def update_ingrediente(item_id: int, data: IngredienteUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await IngredienteService(db).update(item_id, data)


@router.delete("/ingredientes/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ingrediente(item_id: int, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    await IngredienteService(db).delete(item_id)


@router.patch("/ingredientes/{item_id}/estado", response_model=IngredienteResponse)
async def change_ingrediente_state(
    item_id: int,
    data: IngredienteEstadoUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    return await IngredienteService(db).change_state(item_id, data.estado)


@router.get("/gastos/", response_model=list[GastoResponse])
async def list_gastos(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await GastoService(db).get_all()

@router.get("/gastos/historial", response_model=GastoPaginaResponse)
async def list_gastos_historial(
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    require_staff(current_user)
    if fecha_desde is not None and fecha_hasta is not None and fecha_desde > fecha_hasta:
        raise HTTPException(status_code=422, detail="La fecha inicial no puede ser posterior a la final.")
    return await GastoService(db).get_paginados(fecha_desde, fecha_hasta, page, page_size)

@router.post("/gastos/", response_model=GastoResponse, status_code=status.HTTP_201_CREATED)
async def create_gasto(data: GastoCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await GastoService(db).create(data)


@router.put("/gastos/{item_id}", response_model=GastoResponse)
async def update_gasto(item_id: int, data: GastoUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    return await GastoService(db).update(item_id, data)


@router.delete("/gastos/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gasto(item_id: int, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    require_staff(current_user)
    await GastoService(db).delete(item_id)