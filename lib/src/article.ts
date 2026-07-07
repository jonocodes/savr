import { Article } from "./models";

type ArticleObj = {
  pathContent: () => string;
  pathThumbnail: () => string;
  pathMetadata: () => string;
  pathResources: () => string;
};

export function createArticleObject(data: Article): ArticleObj {
  return {
    ...data,
    pathContent() {
      return `saves/${data.slug}/content.html`;
    },
    pathThumbnail() {
      return `saves/${data.slug}/thumbnail.png`;
    },
    pathMetadata() {
      return `saves/${data.slug}/metadata.json`;
    },
    pathResources() {
      return `saves/${data.slug}/resources`;
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface ArticleTemplateProps {
  title: string;
  byline: string;
  published: string;
  readTime: string;
  content: string;
}

const ArticleTemplate = (props: ArticleTemplateProps): string => `
<link rel="stylesheet" href="/web.css">
<div id="savr-root">
    <div id="savr-metadata">
        <h1>${escapeHtml(props.title)}</h1>
        <div id="savr-byline">${escapeHtml(props.byline)}</div>
        <div id="savr-published">${props.published}</div>
        <div id="savr-readTime">${escapeHtml(props.readTime)}</div>
        <hr />
    </div>
    <div id="savr-content">${props.content}</div>
</div>
`;

export default ArticleTemplate;
