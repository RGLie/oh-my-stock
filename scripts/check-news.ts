import { collectNews } from "../server/research";
// Public Korean market query only. No holdings or credentials are loaded.
const news = await collectNews([], "macro", "미국 연준 금리");
console.log(
  JSON.stringify({
    articles: news.length,
    koreanTitles: news.filter((e) => /[가-힣]/.test(e.title)).length,
    coverage: [...new Set(news.map((e) => e.coverage))],
  }),
);
if (!news.length || !news.some((e) => /[가-힣]/.test(e.title)))
  process.exitCode = 1;
