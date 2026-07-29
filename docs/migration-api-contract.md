# FastAPI → Pages Functions 接口契约

Cloudflare 运行层的唯一入口为 `functions/_middleware.ts`：它只截获同域 `/api/*`，`/health` 仍由 `functions/health.ts` 返回非 envelope JSON。所有业务成功响应保持 `{ "data": ..., "error": null }`，错误响应保持 `{ "data": null, "error": { "code", "message", "details" } }`。

| 原 FastAPI 路由 | Pages Functions 实现 | 契约验证 |
|---|---|---|
| `GET /health` | `functions/health.ts` | `curl -i http://127.0.0.1:8788/health` 返回 200 与 `status` |
| `POST/GET /api/trips`、`GET/PATCH/DELETE /api/trips/:id` | `functions/_lib/api-handler.ts#trips` | 旅行 CRUD、日期范围冲突、`items_count` |
| `POST/GET /api/trips/:id/items`、`PATCH/DELETE /api/items/:id` | `tripItems`、`item` | 日期范围、地点归属、时间冲突、路线段清理 |
| `GET /api/places/search`、places CRUD | `searchPlaces`、`tripPlacesCrud`、`place` | 高德 DTO 映射、重复 POI 幂等、地点引用保护 |
| `GET /api/geo/city-center`、`GET /api/city-hints` | `cityCenter`、city hints 分支 | 参数、空值、第三方失败 envelope |
| 路线预览、路线段 CRUD | `routePreview`、`createSegment`、`routeSegments` | 缓存、HMAC preview token、步骤与 polyline JSON |
| trip places、draft、generate、confirm、AI plan | `tripPlacePool`、`planDrafts`、`generatedDraftRoutes`、`confirmDraft`、`aiPlan` | 候选地点、草稿、确认后事项/路线段闭环 |

## 本地契约流程

1. 启动原 FastAPI，记录固定请求夹具的 HTTP 状态和 envelope。
2. 执行 D1 migration 与 `functions/db/seed.local.sql`。
3. 用同一夹具调用 Pages Functions；仅允许 ID、时间戳、HMAC token 与缓存命中字段差异。
4. 对创建 Trip A → Place A/B/C → 草稿 → 路线生成 → 确认 → 读取路线段做完整闭环。

首版不导入本地 SQLite 个人数据；线上 D1 从空库初始化。本地 `server/` 与 SQLite 保留，直到上述 diff 完成并通过。
