"""Health check router."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe — plain JSON (not ApiResponse envelope)."""
    return {"status": "ok"}
