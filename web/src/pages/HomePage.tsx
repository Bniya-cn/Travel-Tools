import { useEffect, useState } from 'react';
import { fetchHealth } from '../api/client';
import { ApiClientError } from '../types/api';

type Status = 'loading' | 'ok' | 'error';

/**
 * Scaffold home — verifies API client + backend health.
 * No Trip/Item business UI yet.
 */
export function HomePage() {
  const [status, setStatus] = useState<Status>('loading');
  const [detail, setDetail] = useState('正在连接后端…');

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((res) => {
        if (cancelled) return;
        if (res.status === 'ok') {
          setStatus('ok');
          setDetail('后端健康检查通过');
        } else {
          setStatus('error');
          setDetail(`意外响应: ${JSON.stringify(res)}`);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        if (err instanceof ApiClientError) {
          setDetail(err.message);
        } else if (err instanceof Error) {
          setDetail(err.message);
        } else {
          setDetail('未知错误');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header className="page__header">
        <p className="page__brand">Travel Planner</p>
        <h1 className="page__title">个人旅游日程规划器</h1>
        <p className="page__lead">工程脚手架已就绪。业务功能将在后续阶段接入。</p>
      </header>

      <section className="status" data-state={status} aria-live="polite">
        <h2 className="status__label">后端连接</h2>
        <p className="status__value">{detail}</p>
        <p className="status__hint">
          API Base: {import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}
        </p>
      </section>

      <section className="hints">
        <h2>下一步</h2>
        <ul>
          <li>复制 web/.env.example 为 web/.env.local 并填写高德 JS Key</li>
          <li>复制 server/.env.example 为 server/.env 并填写 Web 服务 Key</li>
          <li>阶段 2：实现 Trip / Item 日程 MVP</li>
        </ul>
      </section>
    </main>
  );
}
