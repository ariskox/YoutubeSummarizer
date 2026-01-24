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
