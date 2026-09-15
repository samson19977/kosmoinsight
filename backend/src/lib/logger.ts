// ============================================
// Minimal structured logger.
//
// This does not replace a real observability stack (Sentry/Datadog/etc)
// — it's a small, dependency-free upgrade over bare console.log/error
// calls scattered through the codebase:
//   - every line carries a level, a timestamp, and a named source
//   - error() always keeps a real stack trace instead of a stringified one
//   - swapping in a real log shipper later (pino, winston, Sentry) means
//     changing this one file, not every call site
// ============================================

type LogMeta = Record<string, unknown> | undefined;

function timestamp(): string {
  return new Date().toISOString();
}

function format(level: string, source: string, message: string, meta?: LogMeta): string {
  const base = `[${timestamp()}] [${level}] [${source}] ${message}`;
  if (!meta) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch {
    return base;
  }
}

export function createLogger(source: string) {
  return {
    info(message: string, meta?: LogMeta) {
      console.log(format('INFO', source, message, meta));
    },
    warn(message: string, meta?: LogMeta) {
      console.warn(format('WARN', source, message, meta));
    },
    error(message: string, error?: unknown, meta?: LogMeta) {
      console.error(format('ERROR', source, message, meta));
      if (error instanceof Error) {
        console.error(error.stack || error.message);
      } else if (error !== undefined) {
        console.error(error);
      }
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
