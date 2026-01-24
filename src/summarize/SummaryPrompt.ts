import { SummaryVerbosity } from "../shared/types.js";

export const buildSummaryPrompt = (verbosity: SummaryVerbosity) => {
  switch (verbosity) {
    case "concise":
      return "Summarize the transcript into 3-5 tight bullet points. Focus on the main key points only. Make it 1 min read";
    case "detailed":
      return "Summarize the transcript into 8-12 bullets. Include specifics, numbers, and decisions mentioned. Make it 4-5 min read";
    case "standard":
    default:
      return "Summarize the transcript into 5-8 bullet points with the main takeaways. Make it 2-3 min read";
  }
};
