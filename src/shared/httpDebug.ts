type HeadersLike = Record<string, string>;

import { logger } from "./logger.js";

const escapeSingleQuotes = (value: string) => value.replace(/'/g, "'\"'\"'");

const toCurl = (opts: { url: string; method?: string; headers?: HeadersLike; body?: unknown }) => {
  const parts: string[] = ["curl"];
  const method = (opts.method ?? "GET").toUpperCase();
  parts.push("-X", method, `'${escapeSingleQuotes(opts.url)}'`);

  if (opts.headers) {
    for (const [key, value] of Object.entries(opts.headers)) {
      parts.push("-H", `'${escapeSingleQuotes(`${key}: ${value}`)}'`);
    }
  }

  if (opts.body !== undefined) {
    const bodyString =
      typeof opts.body === "string"
        ? opts.body
        : (() => {
            try {
              return JSON.stringify(opts.body, null, 2);
            } catch {
              return String(opts.body);
            }
          })();
    parts.push("--data-raw", `'${escapeSingleQuotes(bodyString)}'`);
  }

  return parts.join(" ");
};

const prettyJson = (value: unknown) => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const headersToRecord = (headers?: Headers | HeadersLike): HeadersLike => {
  if (!headers) return {};
  if (typeof (headers as Headers).forEach === "function") {
    const record: HeadersLike = {};
    (headers as Headers).forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  return headers as HeadersLike;
};

export const createHttpDebugger = (enabled: boolean) => {
  const log = (message: string) => {
    if (!enabled) return;
    logger.debug(message);
  };

  return {
    request(label: string, req: { url: string; method?: string; headers?: Headers | HeadersLike; body?: unknown }) {
      if (!enabled) return;
      const headers = headersToRecord(req.headers);
      log(`[${label}] request curl:\n${toCurl({ url: req.url, method: req.method, headers, body: req.body })}`);
      if (req.body !== undefined) {
        log(`[${label}] request body:\n${prettyJson(req.body)}`);
      }
    },
    response(label: string, res: { status: number; headers?: Headers | HeadersLike; body?: unknown }) {
      if (!enabled) return;
      const headers = headersToRecord(res.headers);
      log(`[${label}] response status: ${res.status}`);
      if (Object.keys(headers).length > 0) {
        log(`[${label}] response headers: ${prettyJson(headers)}`);
      }
      if (res.body !== undefined) {
        log(`[${label}] response body:\n${prettyJson(res.body)}`);
      }
    },
  };
};