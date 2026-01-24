import { promises as fs } from "node:fs";
import ora, { Color } from "ora";
import { fileExists, removeIfExists, ensureParentDir } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Summary, Transcript, SummaryVerbosity, SummaryFormat } from "../shared/types.js";
import { AudioExtractor } from "../media/AudioExtractor.js";
import { MediaDownloader } from "../media/YoutubeDownloader.js";
import { Transcriber } from "../transcribe/WhisperTranscriber.js";
import { Summarizer } from "../summarize/Summarizer.js";

export class SummarizePipeline {
  constructor(
    private readonly downloader: MediaDownloader,
    private readonly extractor: AudioExtractor,
    private readonly transcriber: Transcriber,
    private readonly summarizer: Summarizer,
    private readonly keepTemp: boolean,
    private readonly useCache: boolean,
    private readonly verbosity: SummaryVerbosity,
    private readonly summarizerLabel: string,
    private readonly summaryFormat: SummaryFormat
  ) {}

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
    summaryPath: string;
    isCache: boolean;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    // If we already have a cached transcript, we can skip download/extract steps and reuse it.
    const cachedTranscript = this.useCache ? await this.readCachedTranscript(paths.transcriptPath) : null;

    const video = await this.withSpinner(
      "Download audio",
      "cyan",
      cachedTranscript
        ? async () => ({ path: paths.videoPath, fromCache: true } as const)
        : () => this.getOrDownload(url, paths.videoPath),
      cachedTranscript ? " (skip)" : undefined
    );

    const audio = await this.withSpinner(
      "Extract audio",
      "magenta",
      cachedTranscript
        ? async () => ({ path: paths.audioPath, fromCache: true } as const)
        : () => this.getOrExtract(video.path, paths.audioPath),
      cachedTranscript ? " (skip)" : undefined
    );

    const transcript = await this.withSpinner(
      "Transcribe audio",
      "yellow",
      cachedTranscript
        ? async () => ({ value: cachedTranscript, fromCache: true })
        : () => this.getOrTranscribe(audio.path, paths.transcriptPath),
      cachedTranscript ? " (skip)" : undefined
    );

    if (!this.keepTemp) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
    }

    const summary = await this.withSpinner(`Summarize (${this.summarizerLabel})`, "green", () =>
      this.getOrSummarize(transcript.value, paths.summaryPath)
    );

    if (!this.keepTemp && !paths.isCache) {
      // Transcript is retained; drop temp summary only for txt to avoid clutter.
      if (this.summaryFormat === "txt") {
        await removeIfExists(paths.summaryPath);
      }
    }

    return { videoPath: video.path, audioPath: audio.path, transcript: transcript.value, summary: summary.value } satisfies PipelineResult;
  }

  private async withSpinner<T extends { fromCache?: boolean }>(label: string, color: Color, fn: () => Promise<T>, cacheLabel?: string): Promise<T> {
    const spinner = ora({ text: label, color }).start();
    try {
      const result = await fn();
      const suffix = result.fromCache ? cacheLabel ?? " (cache)" : "";
      spinner.succeed(`${label}${suffix}`);
      return result;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      spinner.fail(message);
      throw err;
    }
  }

  private async getOrDownload(url: string, videoPath: string) {
    if (this.useCache && await fileExists(videoPath)) {
      return { path: videoPath, fromCache: true } as const;
    }
    const path = await this.downloader.download(url, videoPath);
    return { path, fromCache: false } as const;
  }

  private async getOrExtract(videoPath: string, audioPath: string) {
    if (this.useCache && await fileExists(audioPath)) {
      return { path: audioPath, fromCache: true } as const;
    }
    const path = await this.extractor.extract(videoPath, audioPath);
    return { path, fromCache: false } as const;
  }

  private async getOrTranscribe(audioPath: string, transcriptPath: string): Promise<{ value: Transcript; fromCache: boolean }> {
    if (this.useCache && await fileExists(transcriptPath)) {
      const text = await fs.readFile(transcriptPath, "utf8");
      if (text.trim()) {
        return { value: { text, source: transcriptPath }, fromCache: true };
      }
    }
    const transcript = await this.transcriber.transcribe(audioPath, transcriptPath);
    await ensureParentDir(transcriptPath);
    await fs.writeFile(transcriptPath, transcript.text, "utf8");
    return { value: transcript, fromCache: false };
  }

  private async getOrSummarize(transcript: Transcript, summaryPath: string): Promise<{ value: Summary; fromCache: boolean }> {
    if (this.useCache && await fileExists(summaryPath)) {
      const text = await fs.readFile(summaryPath, "utf8");
      if (text.trim()) {
        return { value: { text, model: "cache" }, fromCache: true };
      }
    }
    const summary = await this.summarizer.summarize(transcript, {
      verbosity: this.verbosity,
      summaryFormat: this.summaryFormat,
    });
    await ensureParentDir(summaryPath);
    const output = this.summaryFormat === "html" ? this.wrapHtml(summary.text, summary.model) : summary.text;
    await fs.writeFile(summaryPath, output, "utf8");
    return { value: summary, fromCache: false };
  }

  private async readCachedTranscript(transcriptPath: string): Promise<Transcript | null> {
    if (await fileExists(transcriptPath)) {
      const text = await fs.readFile(transcriptPath, "utf8");
      if (text.trim()) {
        return { text, source: transcriptPath };
      }
    }
    return null;
  }

  private wrapHtml(content: string, model: string) {
    const escaped = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `<li>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`)
      .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
  <title>Summary</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f1eb;
      --card: #ffffff;
      --text: #1f1c17;
      --muted: #5b534a;
      --accent: #e2c79f;
      --shadow: 0 18px 40px rgba(0, 0, 0, 0.08);
      --radius: 18px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 20% 20%, rgba(255,255,255,0.8), transparent 35%),
                  radial-gradient(circle at 80% 10%, rgba(226,199,159,0.25), transparent 32%),
                  var(--bg);
      color: var(--text);
      font-family: "DM Sans", system-ui, -apple-system, sans-serif;
      padding: 32px 18px;
    }
    .card {
      width: min(960px, 100%);
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 32px 36px;
      border: 1px solid rgba(31,28,23,0.05);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      background: rgba(226,199,159,0.22);
      border-radius: 999px;
      padding: 8px 14px;
      font-weight: 600;
    }
    h1 {
      margin: 14px 0 6px;
      font-family: "Source Serif 4", "DM Sans", serif;
      font-size: 32px;
      font-weight: 600;
      line-height: 1.25;
    }
    .meta {
      color: var(--muted);
      margin: 0 0 22px;
      font-size: 15px;
    }
    ul {
      padding-left: 20px;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    li {
      font-size: 18px;
      line-height: 1.6;
      background: linear-gradient(90deg, rgba(226,199,159,0.18), transparent 60%);
      padding: 10px 12px;
      border-radius: 12px;
    }
    @media (max-width: 640px) {
      body { padding: 24px 14px; }
      .card { padding: 26px 24px; }
      h1 { font-size: 28px; }
      li { font-size: 17px; }
    }
  </style>
</head>
<body>
  <article class="card">
    <div class="eyebrow">
      <span>Video Summary</span>
    </div>
    <h1>Key Takeaways</h1>
    <p class="meta">Model: ${model}</p>
    <ul>
      ${escaped}
    </ul>
  </article>
</body>
</html>`;
  }
}
