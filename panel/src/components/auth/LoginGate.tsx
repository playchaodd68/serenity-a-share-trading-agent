// 全屏登录门：在 main.tsx 包住整个 App（QueryClientProvider 之内、Router 之外）。
// 启动时查 /api/auth/status：required && 未认证 → 渲染登录页；
// 运行中任何请求返回 401（api.ts 派发 UNAUTHORIZED_EVENT）→ 回到登录门；
// 登录成功后 invalidateQueries 让 react-query 全量重拉。
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { api, UNAUTHORIZED_EVENT } from "@/lib/api";
import { useAuthStatus } from "@/lib/useSharedQueries";
import { cn } from "@/lib/cn";

interface LoginGateProps {
  children: ReactNode;
}

function LoginScreen({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (password === "" || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await api.login(password);
        setPassword("");
        await onSuccess();
      } catch (err) {
        // 服务端错误文案已含限速提示（连续失败 5 次锁定 5 分钟）。
        setError(err instanceof Error ? err.message : "登录失败，请重试。");
      } finally {
        setSubmitting(false);
      }
    },
    [password, submitting, onSuccess],
  );

  return (
    <div className="grid min-h-screen place-items-center bg-base px-4">
      <div className="w-full max-w-sm rounded-dialog border border-line bg-surface p-6 shadow-overlay">
        {/* 品牌块 — violet 全站仅品牌处 */}
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-btn bg-violet/15 text-violet">
            <Activity className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-ink">Serenity</div>
            <div className="text-2xs text-ink-3">研究面板 · 需要访问密码</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="访问密码"
            aria-label="访问密码"
            autoFocus
            autoComplete="current-password"
            className={cn(
              "w-full rounded-input border border-line bg-base px-3 py-2 text-sm text-ink placeholder:text-ink-3",
              "outline-none transition-colors duration-fast ease-smooth focus:border-accent",
            )}
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={password === "" || submitting}
            className={cn(
              "w-full rounded-btn border border-accent/40 bg-accent/15 px-3 py-2 text-sm font-medium text-accent",
              "transition-colors duration-fast ease-smooth hover:bg-accent/25",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {submitting ? "验证中…" : "进入面板"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function LoginGate({ children }: LoginGateProps) {
  const queryClient = useQueryClient();
  const { data: status, isLoading, isError } = useAuthStatus();
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const onUnauthorized = () => setUnauthorized(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const handleLoginSuccess = useCallback(async () => {
    setUnauthorized(false);
    // 登录成功：auth-status 与所有业务查询一起重拉。
    await queryClient.invalidateQueries();
  }, [queryClient]);

  if (isLoading) {
    return (
      <div role="status" className="grid min-h-screen place-items-center bg-base text-sm text-ink-3">
        连接中…
      </div>
    );
  }

  // status 拉取失败（服务未启动等）：放行进壳，由各页面的离线空态兜底。
  const gateClosed = !isError && status?.required === true && (unauthorized || !status.authenticated);
  if (!gateClosed) return <>{children}</>;

  return <LoginScreen onSuccess={handleLoginSuccess} />;
}
