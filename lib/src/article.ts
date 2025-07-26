// import * as fs from 'fs';

import { Article } from "./models";

// class ArticleObj {
//   constructor(data: Article) {
//     this.data = data;
//   }

//   pathContent(): string {
//     return `saves/${this.slug}/content.html`;
//   }
// }

type ArticleObj = {
  // data: Article;
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

interface ArticleTemplateProps {
  title: string;
  byline: string;
  published: string;
  readTime: string;
  content: string;
}

const ArticleTemplate = (props: ArticleTemplateProps) => {
  const html = `
    <div id="savr-root">
        <div id="savr-metadata">
            <h1>${props.title}</h1>
            <div id="savr-byline">${props.byline}</div>
            <div id="savr-published">${props.published}</div>
            <div id="savr-readTime">${props.readTime}</div>
            <hr />
            <div id="savr-content">${props.content}</div>
        </div>
    </div>
    `;

  return html;

  //   return (
  //     <div id="savr-root">
  //       <div id="savr-metadata">
  //         <h1>{props.title}</h1>
  //         <div id="savr-byline">{props.byline}</div>
  //         <div id="savr-published">{props.published}</div>
  //         <div id="savr-readTime">{props.readTime}</div>
  //         <hr />
  //         <div id="savr-content" dangerouslySetInnerHTML={{ __html: props.content }} />
  //       </div>
  //     </div>
  //   );
};

export default ArticleTemplate;
