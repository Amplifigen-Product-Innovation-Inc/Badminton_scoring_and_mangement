/**
 * §33 — errors must preserve trust. Never surface raw Postgres/Supabase
 * messages or status codes; always say what's still safe and what to do.
 * `message` should already be a human string produced by the caller — this
 * component just standardizes the presentation, it does not sanitize.
 */
export function ErrorState({
  message,
  reassurance,
  onRetry,
}: {
  message: string;
  reassurance?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-error-500/20 bg-error-50 px-4 py-3 text-center"
    >
      <p className="text-sm font-medium text-error-700">{message}</p>
      {reassurance && <p className="mt-1 text-xs text-error-700/80">{reassurance}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-sm font-semibold text-error-700 underline underline-offset-2"
        >
          Retry
        </button>
      )}
    </div>
  );
}
