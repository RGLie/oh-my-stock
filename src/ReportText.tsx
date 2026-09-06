// Reflow the original words for reading; the saved model response remains unchanged.
export function ReportText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).flatMap((block) => {
    if (block.length < 240 || typeof Intl.Segmenter !== "function")
      return [block];
    const sentences = [
      ...new Intl.Segmenter("ko", { granularity: "sentence" }).segment(block),
    ].map((part) => part.segment);
    const groups: string[] = [];
    let current = "";
    for (const sentence of sentences) {
      current += sentence;
      if (current.length >= 160) {
        groups.push(current);
        current = "";
      }
    }
    if (current) groups.push(current);
    return groups;
  });
  return (
    <div className="report-prose">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
