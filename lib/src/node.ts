import FileManager, { DB_FILE_NAME, DbManager } from "./lib";
import { Article } from "./models";

import { pipeline } from 'stream/promises';

import { Jimp } from "jimp";

import fs, { createWriteStream, Dirent } from "fs";
import axios from "axios";
import { promisify } from "util";

export class FileManagerLocal extends FileManager {

    constructor(directory: string) {
      super(directory);
      // this.directory = directory;
    }

    // #directory: string; // a url or SAF path, or local dir
    
    public generateJsonDbManager(): DbManager {
      return new DbManagerLocal(this);
    }

    public async downloadAndResizeImage(url: string, targetDir: string) {

      const maxDimension = 200
      const filePath = url.split("/").pop()
      const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;

      // const response = await fetch(url);
      // const buffer = await response.buffer();

      // const type = await promisify(fileType.fromBuffer)(buffer);
      // const image = sharp(buffer);
      // const resizedImageBuffer = await image.resize(200, 200).toFormat(type.ext).toBuffer();
      // // const writeStream = createWriteStream(`resizedImage.${type.ext}`);

      // const writeStream = createWriteStream(outputFilePath);
      // await pipeline(resizedImageBuffer, writeStream);

    };
  
  
    public async writeTextFile(filename: string, content: string): Promise<void> {
      fs.writeFileSync(`${this.directory}/${filename}`, content);
    }
  
    public async readTextFile(filename: string): Promise<string> {
      return fs.readFileSync(`${this.directory}/${filename}`, 'utf8');
    }
  }
  
  

  export class DbManagerLocal extends DbManager {


    public async upsertArticle(article: Article) {
  
      const articles = await this.getArticles();
  
      // upsertArticleToList(articles, article);
  
      this.fileManager.writeTextFile(DB_FILE_NAME, JSON.stringify({article}, null, 2));
  
      // const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${article.slug}`, {
      //   method: 'PUT',
      //   body: JSON.stringify(article)
      // });
    }
  
    public async getArticle(slug: string): Promise<Article|undefined>  {
      
      // TODO: read from single article json file?
  
      const articles = await this.getArticles();
  
      return articles.find((article: Article) => article.slug === slug);
    }
  
    public async getArticles(): Promise<Article[]> {
  
      // const content = await this.fileManager.readTextFile(dbFile);
  
      const content = await this.fileManager.readTextFile(DB_FILE_NAME);
  
      const articles = JSON.parse(content).articles;
  
      // const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
      // // const articles: ArticleAndRender[] = await response.json();
      // const articles: Article[] = await response.json();
  
      return articles
      
    }
  
  }
  