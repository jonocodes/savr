// import * as fs from 'fs';

// interface ArticleTemplateProps {
//   title: string;
//   byline: string;
//   published: string;
//   readTime: string;
//   content: string;
// }

export const listTemplateMoustache = `
    <!DOCTYPE html>

<!--
[metadata]
{{{metadata}}}
-->

<html>
    <head>

        <meta charset="utf-8" />

        <title>Savr Catalog</title>

        {{#static}}
        <link rel="stylesheet" href="./static/web.css" />
        {{/static}}
        {{^static}}
        <link rel="stylesheet" href="./static/shared/web.css" />
        <script src="./static/savr-remote.js"></script>
        {{/static}}

    </head>
    <body>

        <div id="savr-root">
            <h1>Savr Catalog</h1>

            {{^static}}
            <div id="add-url">
                <!-- submit to url in case in a text browser which cant handle javascript -->
                <form id="url-form" action="{{{namespace}}}/save" method="GET">
                    <input id="url" name="url" size="40">
                    <input type="submit" name="submit" value="Add URL">
                </form>
            </div>

            <hr />
            {{/static}}

            <h2>Saves</h2>
            <div class="savr-list">

                {{#readable}}
                <div class="article-card" >
                    <div class="article-card-thumb" >

                        <a href="{{namespace}}/saves/{{article.slug}}/{{extra.fileName}}">
                            <object data="{{namespace}}/saves/{{article.slug}}/thumbnail.webp" class="thumb">

                                {{#static}}
                                <img src="./static/article_bw.webp" alt="thumbnail">
                                {{/static}}
                                {{^static}}
                                <img src="{{namespace}}/static/shared/article_bw.webp" alt="thumbnail">
                                {{/static}}
                                
                            </object>
                        </a>

                    </div>
                    <div class="article-card-content" >
                        <a href="{{namespace}}/saves/{{article.slug}}/{{extra.fileName}}">{{article.title}}</a>
                        <p class="card-info">{{extra.infoForCard}}</p>

                        {{^static}}
                        <div class="update-buttons">
                            <a href="{{namespace}}/setstate/archived/{{article.slug}}">archive</a> | <a href="{{namespace}}/setstate/deleted/{{article.slug}}">delete</a>
                        </div>
                        {{/static}}

                    </div>
                </div>
                {{/readable}}

            </div>

            <hr />

            <h2>Archive</h2>
            <div class="savr-list">

                {{#archived}}
                <div class="article-card" >
                    <div class="article-card-thumb" >

                        <a href="{{namespace}}/saves/{{article.slug}}/index.html">
                            <object data="{{namespace}}/saves/{{article.slug}}/thumbnail.webp" class="thumb">
                                {{#static}}
                                <img src="./static/article_bw.webp" alt="thumbnail">
                                {{/static}}
                                {{^static}}
                                <img src="{{namespace}}/static/shared/article_bw.webp" alt="thumbnail">
                                {{/static}}
                            </object>
                        </a>

                    </div>
                    <div class="article-card-content" >
                        <a href="{{namespace}}/saves/{{article.slug}}/index.html">{{article.title}}</a>
                        <p class="card-info">{{extra.infoForCard}}</p>

                        {{^static}}
                        <div class="update-buttons">
                            <a href="{{namespace}}/setstate/unread/{{article.slug}}">unarchive</a> | <a href="{{namespace}}/setstate/deleted/{{article.slug}}">delete</a>
                        </div>
                        {{/static}}

                    </div>
                </div>
                {{/archived}}

            </div>
        </div>

        {{^static}}
        <p style="text-align:center">
            <a href="about">About</a>
        </p>
        {{/static}}
        
    </body>

    <script>

        function formSubmit(event) {

            event.preventDefault();

            const url = document.getElementById("url").value;

            if (typeof savr !== 'undefined' && typeof savr.startSSE === 'function') {
                savr.startSSE('.', url, function(){
                    console.log("ingest done")
                    window.location.reload()
                });
            } else {
                alert('Error: startSSE function not found in loaded script');
            }

        }

        (function(){
            const form = document.getElementById("url-form");
            form.addEventListener("submit", formSubmit);
        })()

    </script>

</html>


    `
