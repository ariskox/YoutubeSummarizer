export type LogLevel = "info" | "warn" | "error";

const levels: Record<LogLevel, number> = { info: 3, warn: 2, error: 1 };
let currentLevel: LogLevel = "error";

export const setLogLevel = (level: LogLevel) => {
  currentLevel = level;
};

const timestamp = () => new Date().toISOString();

const log = (level: LogLevel, message: string) => {
  if (levels[level] > levels[currentLevel]) return;
  const prefix = level.toUpperCase().padEnd(5, " ");
  // eslint-disable-next-line no-console
  console.log(`[${timestamp()}] ${prefix} ${message}`);
};

export const logger = {
  info: (msg: string) => log("info", msg),
  warn: (msg: string) => log("warn", msg),
  error: (msg: string) => log("error", msg),
};
