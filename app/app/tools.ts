// import { Platform } from 'react-native';
import {
    StorageAccessFramework as SAF
  } from "expo-file-system";
import AsyncStorage from '@react-native-async-storage/async-storage';

// import { JSONFileSyncPreset } from 'lowdb/node';

// import { ArticleAndRender, Article } from '../../web/src/models';
// import * as lib  from '../../web/src/lib';

// import * as lib from '@/app/lib'
// import * as lib from '@web-src-lib';


import FileManager, {dbFile, filterAndPrepareArticles, upsertArticleToList} from '@savr/lib'
import {Article, ArticleAndRender} from '@savr/lib/models'

const DB_FILE_NAME='db.json'

// import {filterAndPrepareArticles} from 'lib/lib.js'
// import {Article, ArticleAndRender} from 'lib/models'


// import {filterAndPrepareArticles} from '@web/dist/src/lib'

// import { Article, ArticleAndRender} from '@web/dist/src/models'


// import {lib as libWeb} from '@web/lib'
// import { articleList } from '@web/lib';

// import { articleList, filterAndPrepareArticles } from '@web-src-lib';


// interface FileManagerOptions {
//   directory: string;
// }

// const getDir = async () => {
//     try {
//       const value = await AsyncStorage.getItem('data-directory');

//       console.log(`data-directory value: ${value}`);
//       if (value !== null) {
//         // value previously stored
//       }
//       return value
//     } catch (e) {
//       // error reading value
//       console.error(e);
//     }
//   };

export const getDir = async () => {
  try {
    const value = await AsyncStorage.getItem('data-directory');

    console.log(`data-directory value: ${value}`);
    if (value !== null) {
      // value previously stored
    }
    return value
  } catch (e) {
    // error reading value
    console.error(e);
    return null
  }
};

export async function generateFileManager(platform: string) {

  let dir: string | null = null;

  if (platform === 'android') {
    dir = await getDir();

    if (!dir) {
      console.error('SAF directory not found');
      return;
    }
  } else {

    if (!process.env.EXPO_PUBLIC_SAVR_SERVICE) {
      console.error('SAVR_SERVICE is not defined');
      return;
    }
    dir = process.env.EXPO_PUBLIC_SAVR_SERVICE

  }

  if (!dir) {
    console.error('Directory not found');
    return;
  }

  const fm = new FileManager(platform, dir)

  return fm
}

// export class DbManager {

//   private fileManager!: FileManager

//   constructor(fm: FileManager) {

//     this.fileManager = fm

//     // (async () => {
//     //   const fm = await generateFileManager();

//     //   if (!fm) {
//     //     console.error('FileManager not defined');
//     //     throw new Error('FileManager not defined');
//     //   }
      
//     //   this.fileManager = fm;

//     // })();
//   }

//   public async upsertArticle(article: Article) {
//     if (this.fileManager.platform === 'android') {

//       const articles = await this.getArticlesAndroid();

//       upsertArticleToList(articles, article);

//       this.fileManager.writeTextFileAndroid(DB_FILE_NAME, JSON.stringify({article}, null, 2));

//     } else {

//       const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${article.slug}`, {
//         method: 'PUT',
//         body: JSON.stringify(article)
//       });

//     }
//   }

//   public async getArticles(): Promise<Article[]> {
//     if (this.fileManager.platform === 'android') {
//       return this.getArticlesAndroid();
//     } else {
//       return this.getArticlesWeb();
//     }
//   }

//   private async getArticlesWeb(): Promise<Article[]> {

//     const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
//     // const articles: ArticleAndRender[] = await response.json();
//     const articles: Article[] = await response.json();

//     return articles
    
//   }

//   private async getArticlesAndroid(): Promise<Article[]> {
//     const content = await this.fileManager.readTextFileAndroid(DB_FILE_NAME)

//     const articles: Article[] = JSON.parse(content).articles;

//     return articles

//     // const response = filterAndPrepareArticles(articles);
//     // return response;
//   }

// }


// export default class FileManager {
//   private directory: string; // this will be a url or SAF path
//   // private static isWeb = Platform.OS === 'web';

//   public platform: string;

// //   private serviceRoot: string | null = null;

//   constructor(platform: string, directory: string) {
//     this.directory = directory;
//     this.platform = platform
//   }

//   public async readTextFile(filename: string): Promise<string> {
//     if (this.platform === 'android') {
//       return this.readTextFileAndroid(filename);
//     } else {
//       return this.readTextFileWeb(filename);
//     }

//     // if (FileManager.isWeb) {
//     //   return this.readTextFileWeb(filename);
//     // } else {
//     //   return this.readTextFileAndroid(filename);
//     // }
//   }

//   public async writeTextFile(filename: string, content: string): Promise<void> {
//     if (this.platform === 'android') {
//       return this.writeTextFileAndroid(filename, content);
//     } else {
//       return this.writeTextFileWeb(filename, content);
//     }
//   }

//   public async writeTextFileWeb(filename: string, content: string): Promise<void> {
//     const response = await fetch(`${this.directory}${filename}`, {
//       method: 'PUT',
//       body: content,
//     });
//   }

//   public async writeTextFileAndroid(filename: string, content: string): Promise<void> {
//     const uri = `${this.directory}${encodeURIComponent(filename)}`;
//     await SAF.writeAsStringAsync(uri, content);
//   }

//   public async readTextFileWeb(filename: string): Promise<string> {
//     const response = await fetch(`${this.directory}${filename}`);
//     return await response.text();
//   }

//   public async readTextFileAndroid(path: string): Promise<string> {

//     // const dir = await getDir();

//     // const path = `saves/${slug}/index.html`;
//     // const uri = `${directoryUri}${encodeURIComponent(path)}`;

//     const uri = `${this.directory}${encodeURIComponent(path)}`;

//     console.log(`uri: ${uri}`);

//     const contents = await SAF.readAsStringAsync(uri);

//     console.log(`SAF index file contents: ${contents}`);
//     // console.log(contents);
//     return contents

//     // const granted = await this.requestStoragePermission();
//     // if (!granted) {
//     //   throw new Error('Storage permission not granted');
//     // }

//     // const file = await this.getDocumentFile(uri);
//     // const text = await this.readFileContent(file);
//     // return text;
//   }
// }
