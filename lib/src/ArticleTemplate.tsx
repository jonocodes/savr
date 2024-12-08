import React from 'react';

interface ArticleTemplateProps {
  title: string;
  byline: string;
  published: string;
  readTime: string;
  content: string;
}

const ArticleTemplate: React.FC<ArticleTemplateProps> = ({
  title,
  byline,
  published,
  readTime,
  content,
}) => {
  return (
    <div id="savr-root">
      <div id="savr-metadata">
        <h1>{title}</h1>
        <div id="savr-byline">{byline}</div>
        <div id="savr-published">{published}</div>
        <div id="savr-readTime">{readTime}</div>
        <hr />
        <div id="savr-content" dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
};

export default ArticleTemplate;
