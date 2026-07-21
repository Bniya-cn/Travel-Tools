"""FastAPI application entry."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.common import fail

logger = logging.getLogger("travel_planner")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    # Ensure upload directory exists; do not log secrets
    settings.upload_root.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Travel Planner API", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    body = fail(exc.code, exc.message, exc.details)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    body = fail(
        ErrorCode.VALIDATION_ERROR,
        "请求参数校验失败",
        {"errors": exc.errors()},
    )
    return JSONResponse(status_code=422, content=body.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = ErrorCode.NOT_FOUND if exc.status_code == 404 else ErrorCode.INTERNAL_ERROR
    if exc.status_code == 401:
        code = ErrorCode.UNAUTHORIZED
    elif exc.status_code == 403:
        code = ErrorCode.FORBIDDEN
    elif exc.status_code == 409:
        code = ErrorCode.CONFLICT
    message = exc.detail if isinstance(exc.detail, str) else "请求失败"
    body = fail(code, message)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", type(exc).__name__)
    body = fail(ErrorCode.INTERNAL_ERROR, "服务器内部错误")
    return JSONResponse(status_code=500, content=body.model_dump())
