import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

export const fileExists = async (targetPath: string) => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

export const createTempDir = async (prefix: string) => {
  const base = path.join(os.tmpdir(), prefix);
  await ensureDir(base);
  const dir = await fs.mkdtemp(`${base}${path.sep}`);
  return dir;
};

export const removeIfExists = async (targetPath: string) => {
  if (await fileExists(targetPath)) {
    await fs.rm(targetPath, { recursive: true, force: true });
  }
};

export const ensureParentDir = async (filePath: string) => {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
};

export const hashString = (value: string) => {
  return crypto.createHash("sha256").update(value).digest("hex");
};

export const defaultCacheDir = path.join(os.homedir(), ".cache", "ytsum");

export const DEFAULT_CACHE_TTL_MS = 1000 * 60 * 60 * 48; // 48 hours

export const pruneCache = async (
  cacheDir: string,
  opts: { force?: boolean; ttlMs?: number } = {}
) => {
  const ttlMs = opts.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  if (!(await fileExists(cacheDir))) return;

  if (opts.force) {
    await fs.rm(cacheDir, { recursive: true, force: true });
    return;
  }

  const now = Date.now();
  const entries = await fs.readdir(cacheDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(cacheDir, entry.name);
    const stats = await fs.stat(fullPath);
    const age = now - stats.mtimeMs;
    if (age > ttlMs) {
      await fs.rm(fullPath, { recursive: true, force: true });
    }
  }
};
