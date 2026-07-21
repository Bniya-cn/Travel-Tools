"""City geocode and AI copy-hint APIs."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.city_hints import CityHintsResponse
from app.schemas.common import ApiResponse, ok
from app.schemas.geo import CityCenterResponse
from app.services import amap_geocode, city_hints

router = APIRouter(tags=["city"])


@router.get("/api/geo/city-center", response_model=ApiResponse[CityCenterResponse])
async def get_city_center(
    city: str = Query(min_length=1, description="城市中文名，如：西安"),
) -> ApiResponse[CityCenterResponse]:
    return ok(await amap_geocode.geocode_city(city))


@router.get("/api/city-hints", response_model=ApiResponse[CityHintsResponse])
async def get_city_hints(
    city: str = Query(min_length=1, description="城市中文名，如：西安"),
) -> ApiResponse[CityHintsResponse]:
    """占位文案：优先 AI；未配置或失败时本地回退。"""
    return ok(await city_hints.generate_city_hints(city))
