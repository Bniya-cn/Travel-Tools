import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiClientError } from '../types/api';

type Mode = 'login' | 'register';

export function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (mode === 'login') await login({ account, password });
      else await register({ account, password, display_name: displayName.trim() || null });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '操作失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel__brand">
          <span>Travel Planner</span>
          <h1 id="auth-title">登录后继续规划旅行</h1>
          <p>你的旅行、已保存行程和未保存草稿都会保存在当前账号下。</p>
        </div>
        <div className="auth-panel__card">
          <div className="auth-tabs" role="tablist" aria-label="账号操作">
            <button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => setMode('login')}>登录</button>
            <button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => setMode('register')}>注册</button>
          </div>
          {error && <div className="md-banner md-banner--error">{error}</div>}
          <form className="stack-form" onSubmit={handleSubmit}>
            <label className="md-field">
              <span>账号</span>
              <input value={account} onChange={(event) => setAccount(event.target.value)} minLength={3} maxLength={80} required autoComplete="username" />
            </label>
            {mode === 'register' && (
              <label className="md-field">
                <span>昵称</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="nickname" />
              </label>
            )}
            <label className="md-field">
              <span>密码</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={200} required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </label>
            <button type="submit" className="md-btn md-btn--primary auth-submit" disabled={isSubmitting}>
              {isSubmitting ? '处理中…' : mode === 'login' ? '登录' : '创建账号'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
