import { Summary, SummaryFormat } from "../shared/types.js";

export class SummaryFormatter {
  constructor(private readonly format: SummaryFormat) {}

  render(summary: Summary): string {
    if (this.format === "html") {
      return this.wrapHtml(summary.text, summary.model);
    }
    return summary.text;
  }

  private wrapHtml(content: string, model: string) {
    const escaped = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `<li>${line.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`) // basic HTML escaping for list items
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
