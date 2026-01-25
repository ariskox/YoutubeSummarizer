import { promises as fs } from "node:fs";
import { ensureParentDir, fileExists } from "../shared/fs.js";
import { Summary, Transcript } from "../shared/types.js";

export class CacheManager {
  constructor(private readonly enabled: boolean) {}

  async media(path: string, opts: { allowMissing?: boolean } = {}): Promise<{ path: string } | null> {
    if (opts.allowMissing) {
      return { path };
    }
    if (!this.enabled) return null;
    return (await fileExists(path)) ? { path } : null;
  }

  async readTranscript(path: string): Promise<Transcript | null> {
    if (!this.enabled) return null;
    if (!(await fileExists(path))) return null;
    const text = await fs.readFile(path, "utf8");
    if (!text.trim()) return null;
    return { text, source: path };
  }

  async persistTranscript(path: string, text: string): Promise<void> {
    await this.writeFile(path, text);
  }

  async readSummary(path: string): Promise<Summary | null> {
    if (!this.enabled) return null;
    if (!(await fileExists(path))) return null;
    const text = await fs.readFile(path, "utf8");
    if (!text.trim()) return null;
    return { text, model: "cache" };
  }

  async persistSummary(path: string, content: string): Promise<void> {
    await this.writeFile(path, content);
  }

  private async writeFile(path: string, content: string) {
    await ensureParentDir(path);
    await fs.writeFile(path, content, "utf8");
  }
}