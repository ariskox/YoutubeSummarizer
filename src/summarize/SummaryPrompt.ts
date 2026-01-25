import { SummaryFormat, SummaryVerbosity } from "../shared/types.js";

export const buildSummaryPrompt = (verbosity: SummaryVerbosity, format: SummaryFormat) => {
  const lineStyle = format === "html"
    ? "Use plain sentences without markdown or bullet/number prefixes; start lines directly with the content; separate items with newlines only."
    : "Use clear bullet points.";

  switch (verbosity) {
    case "concise":
      return `Summarize the transcript into 3-5 tight lines. Focus on the main key points only. ${lineStyle} Make it about a 1 min read. (100-150 words)`;
    case "detailed":
      return `Summarize the transcript into a 4-5 minutes read text (400-500 words). Include specifics, numbers, and decisions mentioned. ${lineStyle}`;
    case "standard":
    default:
      return  `Summarize the transcript into 5-8 lines with the main takeaways. ${lineStyle} Make it a 2-3 min read. (300-350 words)`
  }
};
