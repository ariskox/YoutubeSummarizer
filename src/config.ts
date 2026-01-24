import path from "node:path";
import { createTempDir, defaultCacheDir, ensureDir, hashString } from "./shared/fs.js";

export type AppConfig = {
  openaiApiKey?: string;
  openaiModel: string;
  whisperBinary: string;
  whisperModel: string;
  ollamaModel: string;
  keepTemp: boolean;
  cacheDir: string;
};

export const loadConfig = async (flags: {
  keepTemp?: boolean;
  openaiModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  ollamaModel?: string;
  cacheDir?: string;
}) => {
  const keepTemp = Boolean(flags.keepTemp);

  return {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: flags.openaiModel ?? "gpt-4o-mini",
    whisperBinary: flags.whisperBinary ?? "/usr/local/bin/whisper-cli",
    whisperModel: flags.whisperModel ?? "/usr/local/lib/whisper-models/ggml-base.en.bin",
    ollamaModel: flags.ollamaModel ?? "llama3.1",
    keepTemp,
    cacheDir: flags.cacheDir ?? defaultCacheDir,
  } satisfies AppConfig;
};

export const workspacePaths = async (url: string, useCache: boolean, cacheDir: string) => {
  const dir = useCache
    ? path.join(cacheDir, hashString(url).slice(0, 16))
    : await createTempDir("ytsum-");

  await ensureDir(dir);

  return {
    root: dir,
    videoPath: path.join(dir, "video.mp4"),
    audioPath: path.join(dir, "audio.wav"),
    transcriptPath: path.join(dir, "transcript.txt"),
    summaryPath: path.join(dir, "summary.txt"),
    isCache: useCache,
  } as const;
};
