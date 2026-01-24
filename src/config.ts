import path from "node:path";
import { createTempDir } from "./shared/fs.js";

export type AppConfig = {
  copilotApiKey?: string;
  copilotModel: string;
  whisperBinary: string;
  whisperModel: string;
  ollamaModel: string;
  keepTemp: boolean;
};

export const loadConfig = async (flags: {
  keepTemp?: boolean;
  copilotModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  ollamaModel?: string;
}) => {
  const keepTemp = Boolean(flags.keepTemp);

  return {
    copilotApiKey: process.env.COPILOT_API_KEY,
    copilotModel: flags.copilotModel ?? "gpt-4o-mini",
    whisperBinary: flags.whisperBinary ?? "./main",
    whisperModel: flags.whisperModel ?? "./models/ggml-base.en.bin",
    ollamaModel: flags.ollamaModel ?? "llama3.1",
    keepTemp,
  } satisfies AppConfig;
};

export const tempWorkspace = async () => {
  const dir = await createTempDir("ytsum-");
  return {
    root: dir,
    videoPath: path.join(dir, "video.mp4"),
    audioPath: path.join(dir, "audio.wav"),
    transcriptPath: path.join(dir, "transcript.txt"),
  } as const;
};
