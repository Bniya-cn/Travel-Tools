# Cloudflare Pages + D1 部署手册

## 创建资源

1. 在已登录的 Cloudflare 账户创建 D1：`travel-planner-db`。
2. 将 Cloudflare 返回的 database ID 写入 `wrangler.jsonc` 的 `database_id`，不要提交真实环境变量。
3. 创建 Pages 项目：`travel-planner-web`，构建命令为 `npm run build`，输出目录为 `web/dist`。
4. Pages 构建变量：`VITE_API_BASE_URL=`、`VITE_AMAP_JS_KEY`、`VITE_AMAP_SECURITY_CODE`。
5. Pages Functions Secret：`AMAP_WEB_SERVICE_KEY`、`AI_API_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`PREVIEW_TOKEN_SECRET`；D1 binding 名称固定为 `DB`。

## 数据库与部署

```bash
WRANGLER_LOG_PATH=/tmp/travel-planner-wrangler.log npx wrangler d1 migrations apply DB --remote
npm run build
npx wrangler pages deploy web/dist --project-name travel-planner-web
```

先验证生成的 `travel-planner-web.pages.dev`。Pages 项目名若因全局占用发生变化，必须同时更新 DNS CNAME 与本文件，不能猜测目标地址。

## 域名与 DNS

正式地址为 `mytravel.bbroot.com`，API 固定使用同域 `/api/*`，不创建 `api` 记录。

1. 在 Cloudflare 添加并委派 `mytravel.bbroot.com`；记录控制台生成的两条 NS。
2. 在 DNSHE 以这两条实际 NS 替换当前 `ns1.dnshe.com`、`ns2.dnshe.com`。
3. Cloudflare 成为权威 DNS 后，通过 Pages 自定义域向导创建 `@ CNAME travel-planner-web.pages.dev`（已代理）。DNSHE 的 `@` 与 `api` 不创建 A、AAAA 或 CNAME。
4. 等待 Cloudflare 显示 Active 后，再验证：

```bash
curl -i https://mytravel.bbroot.com/health
curl -i https://mytravel.bbroot.com/api/trips
```

## 回滚

- Pages：Cloudflare 控制台选择上一条验证通过的部署。
- D1：只执行明确的恢复 migration；首版无历史数据迁移，禁止为了回滚清库。
- DNS：若 Pages 回滚仍不可用，恢复 DNSHE 的 `ns1.dnshe.com`、`ns2.dnshe.com`；保留本地 FastAPI + SQLite 启动能力。
