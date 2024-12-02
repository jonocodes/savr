

import { Platform } from 'react-native';
import {
    StorageAccessFramework as SAF
  } from "expo-file-system";
import AsyncStorage from '@react-native-async-storage/async-storage';

// import { ArticleAndRender, Article } from '../../web/src/models';
// import * as lib  from '../../web/src/lib';

// import * as lib from '@/app/lib'
// import * as lib from '@web-src-lib';

import {filterAndPrepareArticles, Article, ArticleAndRender} from 'lib'


// import {filterAndPrepareArticles} from '@web/dist/src/lib'

// import { Article, ArticleAndRender} from '@web/dist/src/models'


// import {lib as libWeb} from '@web/lib'
// import { articleList } from '@web/lib';

// import { articleList, filterAndPrepareArticles } from '@web-src-lib';


interface FileManagerOptions {
  directory: string;
}

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

export async function generateFileManager() {

  let dir: string | null = null;

  if (Platform.OS === 'web') {
    if (!process.env.EXPO_PUBLIC_SAVR_SERVICE) {
      console.error('SAVR_SERVICE is not defined');
      return;
    }
    dir = process.env.EXPO_PUBLIC_SAVR_SERVICE
  } else {

    dir = await getDir();

    if (!dir) {
      console.error('SAF directory not found');
      return;
    }
  }

  if (!dir) {
    console.error('Directory not found');
    return;
  }

  const fm = new FileManager({directory: dir})

  return fm
}

export class DbManager {

  private fileManager!: FileManager

  constructor() {
    (async () => {
      const fm = await generateFileManager();

      if (!fm) {
        console.error('FileManager not defined');
        throw new Error('FileManager not defined');
      }
      
      this.fileManager = fm;

    })();
  }

  public async getArticles(): Promise<ArticleAndRender[]> {
    if (Platform.OS === 'web') {
      return this.getArticlesWeb();
    } else {
      return this.getArticlesAndroid();
    }
  }

  private async getArticlesWeb(): Promise<ArticleAndRender[]> {

    const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
    // const data = await response.json();
    // const slugs = data.map(item => item.slug);
    const articles: ArticleAndRender[] = await response.json();
    // const slugs: string[] = data.map(item => item['slug']);
    return articles
    
  }

  private async getArticlesAndroid(): Promise<ArticleAndRender[]> {
    const content = await this.fileManager.readFile('db.json')

    const articles: Article[] = JSON.parse(content);

    const response = filterAndPrepareArticles(articles);

    return response;
  }

}


export default class FileManager {
  private directory: string; // this will be a url or SAF path
  private static isWeb = Platform.OS === 'web';

//   private serviceRoot: string | null = null;

  constructor(options: FileManagerOptions) {
    this.directory = options.directory;
  }

  public async readFile(filename: string): Promise<string> {
    if (FileManager.isWeb) {
      return this.readFileWeb(filename);
    } else {
      return this.readFileAndroid(filename);
    }
  }

  private async readFileWeb(filename: string): Promise<string> {
    const response = await fetch(`${this.directory}${filename}`);
    return await response.text();
  }

  private async readFileAndroid(path: string): Promise<string> {

    // const dir = await getDir();

    // const path = `saves/${slug}/index.html`;
    // const uri = `${directoryUri}${encodeURIComponent(path)}`;

    const uri = `${this.directory}${encodeURIComponent(path)}`;

    console.log(`uri: ${uri}`);

    const contents = await SAF.readAsStringAsync(uri);

    console.log(`SAF index file contents: ${contents}`);
    // console.log(contents);
    return contents

    // const granted = await this.requestStoragePermission();
    // if (!granted) {
    //   throw new Error('Storage permission not granted');
    // }

    // const file = await this.getDocumentFile(uri);
    // const text = await this.readFileContent(file);
    // return text;
  }
}
