import { StorageAccessFramework as SAF } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { FileManager, DB_FILE_NAME, DbManager } from "@savr/lib";
import { Article, ArticleAndRender } from "@savr/lib";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

export const getDir = async (platform: string) => {
  if (platform === "android")
    try {
      const value = await AsyncStorage.getItem("data-directory");

      console.log(`data-directory value: ${value}`);
      if (value !== null) {
        // value previously stored
      }
      return value;
    } catch (e) {
      // error reading value
      console.error(e);
      return null;
    }

  // this is for the web version
  if (!process.env.EXPO_PUBLIC_SAVR_SERVICE) {
    console.error("EXPO_PUBLIC_SAVR_SERVICE is not defined");
    throw new Error("EXPO_PUBLIC_SAVR_SERVICE is not defined");
    // return null;
  }

  return process.env.EXPO_PUBLIC_SAVR_SERVICE;
};

export async function generateFileManager(platform: string) {
  let dir: string | null = null;
  dir = await getDir(platform);

  if (platform === "android") {
    if (!dir) {
      console.error("SAF directory not found");
      return;
    }

    return new FileManagerAndroid(dir);
  } else {
    if (!dir) {
      console.error("SAVR_SERVICE is not defined");
      return;
    }
    // dir = process.env.EXPO_PUBLIC_SAVR_SERVICE

    return new FileManagerWeb(dir);
  }
}

export async function loadColorScheme() {

  const color = await AsyncStorage.getItem("color-scheme");

  const theme = color === "dark" ? DarkTheme : DefaultTheme;

  console.log("loaded color", color);

  return theme
}

export async function saveColorScheme(theme: string) {
  await AsyncStorage.setItem("color-scheme", theme);
}


export class DbManagerAndroid extends DbManager {
  // public async upsertArticle(article: Article) {
  //   const articles = await this.getArticles();

  //   upsertArticleToList(articles, article);

  //   this.fileManager.writeTextFile(DB_FILE_NAME, JSON.stringify({article}, null, 2));
  // }

  public async getArticles(): Promise<Article[]> {
    const content = await this.fileManager.readTextFile(DB_FILE_NAME);

    const articles: Article[] = JSON.parse(content).articles;

    return articles;
  }
}

export class DbManagerWeb extends DbManager {
  public async setArticleState(slug: string, state: string): Promise<Article> {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${slug}/setstate/${state}`
    );

    if (!response.ok) {
      throw new Error("Error setting article state");
    }

    const article: Article = await response.json();
    return article;
  }

  public async upsertArticle(article: Article) {
    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${article.slug}`,
      {
        method: "PUT",
        body: JSON.stringify(article),
      }
    );

    if (!response.ok) {
      throw new Error("Error setting article state");
    }
  }

  public async getArticles(): Promise<Article[]> {
    const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles`);
    // const articles: ArticleAndRender[] = await response.json();

    if (!response.ok) {
      throw new Error("Error getting articles");
    }

    const articles: Article[] = await response.json();
    return articles;
  }

  public async getArticle(slug: string): Promise<Article | undefined> {
    const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}api/articles/${slug}`);

    if (!response.ok) {
      throw new Error("Error getting article");
    }

    const article = await response.json();
    return article;
  }
}

export class FileManagerAndroid extends FileManager {
  public directory: string;

  constructor(directory: string) {
    super();
    // super(directory);
    this.directory = directory;
  }

  public generateJsonDbManager(): DbManager {
    return new DbManagerAndroid(this);
  }

  public async deleteDir(dir: string): Promise<void> {
    const response = await SAF.deleteAsync(`${this.directory}${dir}`);
  }

  public async writeTextFile(filename: string, content: string): Promise<void> {
    const uri = `${this.directory}${encodeURIComponent(filename)}`;
    await SAF.writeAsStringAsync(uri, content);
  }

  public async readTextFile(path: string): Promise<string> {
    const uri = `${this.directory}${encodeURIComponent(path)}`;

    console.log(`reading uri: ${uri}`);

    const contents = await SAF.readAsStringAsync(uri);

    console.log(`SAF file contents: ${contents}`);
    // console.log(contents);
    return contents;
  }

  public async downloadAndResizeImage(url: string, targetDir: string) {
    const maxDimension = 200;
    const filePath = url.split("/").pop();
    const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;

    // // Download the image
    // const response = await fetch(url);
    // const buffer = await response.arrayBuffer();

    // // Get the image type from the response headers
    // const imageType = response.headers.get('Content-Type').split('/')[1];

    // // Resize the image to a maximum dimension
    // const resizedImage = await ImageManipulator.manipulateAsync(buffer, [
    //   {
    //     resize: {
    //       width: maxDimension,
    //       height: maxDimension,
    //     },
    //   },
    // ]);

    // // Save the image to the SAF
    // const file = await SAF.createFileAsync(
    //  `${this.directory}/${targetDir}`,
    //    filePath,
    //   `image/${imageType}`,
    // );
    // await FileSystem.writeAsStringAsync(file, resizedImage.base64, {
    //   encoding: 'base64',
    // });

    // return file.uri;
  }
}

export class FileManagerWeb extends FileManager {
  public directory: string;

  constructor(directory: string) {
    // super(directory);
    super();
    this.directory = directory;
  }

  public generateJsonDbManager(): DbManager {
    return new DbManagerWeb(this);
  }

  public async downloadAndResizeImage(url: string, targetDir: string) {
    const maxDimension = 200;
    const filePath = url.split("/").pop();
    const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;
  }

  public async writeTextFile(filename: string, content: string): Promise<void> {
    const response = await fetch(`${this.directory}${filename}`, {
      method: "PUT",
      body: content,
    });
  }

  public async readTextFile(filename: string): Promise<string> {
    const response = await fetch(`${this.directory}${filename}`);
    return await response.text();
  }

  public async deleteDir(dir: string): Promise<void> {
    // NOTE: for now this does nothing since the db delete should have removed the article dir already?
  }
}
