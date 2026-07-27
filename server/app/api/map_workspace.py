"""Map workspace APIs: TripPlace pool, plan drafts, generate-routes, confirm, AI plan."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.common import ApiResponse, ok
from app.schemas.route_plan_draft import (
    AiPlanRequest,
    ConfirmDraftResponse,
    GenerateRoutesResponse,
    RoutePlanDraftResponse,
    RoutePlanDraftUpsert,
)
from app.schemas.trip_place import TripPlaceCreate, TripPlaceResponse, TripPlaceUpdate
from app.services import ai_plan, plan_draft_service, trip_place_service

router = APIRouter(tags=["map-workspace"])


@router.get("/api/trips/{trip_id}/trip-places", response_model=ApiResponse[list[TripPlaceResponse]])
def list_trip_places(
    trip_id: str,
    include_removed: bool = False,
    db: Session = Depends(get_db),
) -> ApiResponse[list[TripPlaceResponse]]:
    return ok(trip_place_service.list_trip_places(db, trip_id, include_removed=include_removed))


@router.post(
    "/api/trips/{trip_id}/trip-places",
    response_model=ApiResponse[TripPlaceResponse],
    status_code=201,
)
def create_trip_place(
    trip_id: str,
    payload: TripPlaceCreate,
    db: Session = Depends(get_db),
) -> ApiResponse[TripPlaceResponse]:
    return ok(trip_place_service.add_trip_place(db, trip_id, payload))


@router.patch(
    "/api/trips/{trip_id}/trip-places/{trip_place_id}",
    response_model=ApiResponse[TripPlaceResponse],
)
def patch_trip_place(
    trip_id: str,
    trip_place_id: str,
    payload: TripPlaceUpdate,
    db: Session = Depends(get_db),
) -> ApiResponse[TripPlaceResponse]:
    return ok(trip_place_service.update_trip_place(db, trip_id, trip_place_id, payload))


@router.get(
    "/api/trips/{trip_id}/plan-drafts",
    response_model=ApiResponse[RoutePlanDraftResponse | None],
)
def get_plan_draft(
    trip_id: str,
    date: date = Query(...),
    db: Session = Depends(get_db),
) -> ApiResponse[RoutePlanDraftResponse | None]:
    return ok(plan_draft_service.get_draft_for_date(db, trip_id, date))


@router.put(
    "/api/trips/{trip_id}/plan-drafts",
    response_model=ApiResponse[RoutePlanDraftResponse],
)
def put_plan_draft(
    trip_id: str,
    payload: RoutePlanDraftUpsert,
    db: Session = Depends(get_db),
) -> ApiResponse[RoutePlanDraftResponse]:
    return ok(plan_draft_service.upsert_draft(db, trip_id, payload))


@router.post(
    "/api/trips/{trip_id}/plan-drafts/{draft_id}/generate-routes",
    response_model=ApiResponse[GenerateRoutesResponse],
)
async def generate_routes(
    trip_id: str,
    draft_id: str,
    route_type: str = Query(default="transit"),
    strategy: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse[GenerateRoutesResponse]:
    return ok(
        await plan_draft_service.generate_routes(
            db, trip_id, draft_id, route_type=route_type, strategy=strategy
        )
    )


@router.post(
    "/api/trips/{trip_id}/plan-drafts/{draft_id}/confirm",
    response_model=ApiResponse[ConfirmDraftResponse],
)
async def confirm_draft(
    trip_id: str,
    draft_id: str,
    route_type: str = Query(default="transit"),
    strategy: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse[ConfirmDraftResponse]:
    return ok(
        await plan_draft_service.confirm_draft(
            db, trip_id, draft_id, route_type=route_type, strategy=strategy
        )
    )


@router.post(
    "/api/trips/{trip_id}/ai-plan",
    response_model=ApiResponse[RoutePlanDraftResponse],
    status_code=201,
)
async def ai_plan_day(
    trip_id: str,
    payload: AiPlanRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[RoutePlanDraftResponse]:
    return ok(await ai_plan.create_ai_plan(db, trip_id, payload))
