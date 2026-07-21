"""Aggregate API routers."""

from fastapi import APIRouter

from app.api import health, items, places, trips

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(trips.router)
api_router.include_router(items.router)
api_router.include_router(places.router)
