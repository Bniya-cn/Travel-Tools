# 个人旅游日程规划器

个人使用的旅游日程 + 地图 + 公交/地铁路线规划工具（Monorepo）。

当前阶段为**工程脚手架**：可启动前后端与健康检查，尚未包含 Trip / Item 等业务功能。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React、TypeScript、Vite、TanStack Query、React Router、Axios |
| 地图 | 高德 JS API 2.0（`@amap/amap-jsapi-loader`） |
| 后端 | FastAPI、SQLAlchemy 2.x、Alembic、Pydantic v2 |
| 数据库 | 开发期 SQLite（结构兼容 PostgreSQL） |

## 环境要求

- Node.js **18+**
- Python **3.12+**

## 目录结构

```text
web/          前端
server/       后端（在此目录启动 uvicorn）
tests/        pytest
uploads/      本地上传目录（内容不入库）
```

## 启动方式

### 后端

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # 按需填写 SECRET_KEY / AMAP_WEB_SERVICE_KEY
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health` → `{"status":"ok"}`

> 请始终在 `server/` 目录下启动，数据库路径由 Settings 解析为绝对路径。

### 前端

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

浏览器打开 Vite 提示的地址（默认 `http://localhost:5173`）。

## Key 配置说明

| Key | 填写位置 | 用途 |
|---|---|---|
| Web 端（JS API）Key | `web/.env.local` → `VITE_AMAP_JS_KEY` | 浏览器加载 2D 地图 |
| 安全密钥 securityJsCode | `web/.env.local` → `VITE_AMAP_SECURITY_CODE` | 加载地图前写入 `_AMapSecurityConfig` |
| Web 服务 Key | `server/.env` → `AMAP_WEB_SERVICE_KEY` | 地点搜索、公交/步行路线（仅后端） |

**硬性规则：**

- Web 服务 Key **禁止**进入任何 `VITE_` 变量或前端代码。
- `.env` / `.env.local` **禁止**提交 Git（仓库仅保留 `.env.example`）。
- 申请与域名白名单步骤见：`高德地图Key申请与配置教程.md`

## 常用命令

```bash
# 后端测试（仓库根目录）
cd server && source .venv/bin/activate
cd .. && PYTHONPATH=server pytest tests/ -q

# 数据库迁移
cd server && alembic upgrade head
```

## 明确不做（本仓库范围）

爬虫、AI 排程、定位导航、3D/路况、多人协作、权限系统、云存储。
# Travel-Tools
