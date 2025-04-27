import AsyncStorage from "@react-native-async-storage/async-storage";

import { Article, ArticleAndRender } from "@savr/lib";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  // MD3LightTheme as LightTheme,
  // MD3DarkTheme as DarkTheme,
  MD3LightTheme,
  MD3DarkTheme,
  MD3Theme,
  // TODO: handle DefaultTheme
  // DefaultTheme as PaperLightTheme,
  // DarkTheme as PaperDarkTheme,
} from "react-native-paper";

import { create } from "zustand";
import BaseClient from "remotestoragejs/release/types/baseclient";
import Dexie from "dexie";
import { db, DbType } from "@/db";
import { executeNativeBackPress } from "react-native-screens";
import { glob } from "@/storage";

export type ColorTheme = MD3Theme & {
  name: string;
};

export const DarkTheme: ColorTheme = {
  ...MD3DarkTheme,
  name: "dark",
};

export const LightTheme: ColorTheme = {
  ...MD3LightTheme,
  name: "light",
};

// import { setStatusBarHidden } from "expo-status-bar";

// const useBearStore = create((set) => ({
//   bears: 0,
//   increasePopulation: () => set((state: any) => ({ bears: state.bears + 1 })),
//   removeAllBears: () => set({ bears: 0 }),
// }))

const STORE_KEY_COLOR_SCHEME = "color-scheme";

export interface ThemeState {
  theme: ColorTheme;
  // theme: 'light' | 'dark';

  setTheme: (value: ColorTheme) => void;

  // setTheme: (theme: 'light' | 'dark') => void;
}

export interface FontState {
  fontSize: number;
  setFontSize: (value: number) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: LightTheme,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "theme-storage", // key in AsyncStorage
      storage: createJSONStorage(() => AsyncStorage), // use AsyncStorage for persistence
    }
  )
);

export const useFontStore = create<FontState>()(
  persist(
    (set) => ({
      fontSize: 16,
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    {
      name: "font-storage", // key in AsyncStorage
      storage: createJSONStorage(() => AsyncStorage), // use AsyncStorage for persistence
    }
  )
);

export type MyStoreState = {
  // TODO: use this instead of the font and theme store

  corsProxy: string | null;
  setCorsProxy: (value: string) => void;

  fontSize: number;
  setFontSize: (value: number) => void;
};

export const useMyStore = create<MyStoreState>()(
  // colorScheme: LightTheme,
  // setColorScheme: (value: ColorTheme) => set({ colorScheme: value }),
  // toggleTheme: () =>
  //   set((state) => ({
  //     colorScheme: state.colorScheme === DarkTheme ? LightTheme : DarkTheme,
  //   })),

  // initializeTheme: async () => {
  //   const savedTheme = await AsyncStorage.getItem('theme');
  //   if (savedTheme) {
  //     set({ theme: savedTheme as 'light' | 'dark' });
  //   }
  // },

  // getThemeName: () => (get().colorScheme === DarkTheme ? "dark" : "light"),

  persist(
    (set) => ({
      // TODO: remove this temp workaround proxy after dvelopment
      corsProxy: "https://lively-cors-proxy-b569.cloudflare8899.workers.dev/?url=",
      // corsProxy: null, // "http://localhost:7007",
      setCorsProxy: (value: string) => set({ corsProxy: value }),

      fontSize: 16,
      setFontSize: (value: number) => set({ fontSize: value }),
    }),
    {
      name: "my-storage", // key in AsyncStorage
      storage: createJSONStorage(() => AsyncStorage), // use AsyncStorage for persistence
    }
  )
);

function colorSchemeFromStr(value: string | null): ColorTheme {
  const theme = value === DarkTheme.name ? DarkTheme : LightTheme;

  return theme;
}

export async function loadColorScheme() {
  const color = await AsyncStorage.getItem(STORE_KEY_COLOR_SCHEME);

  const theme = colorSchemeFromStr(color);

  // color === DarkTheme.name ? DarkTheme : LightTheme;

  console.log("loaded color", theme.name);

  return theme;
}

export async function saveColorScheme(theme: ColorTheme) {
  console.log("saving color", theme.name);
  await AsyncStorage.setItem(STORE_KEY_COLOR_SCHEME, theme.name);
}

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

function getFilePathContent(slug: string): string {
  return `saves/${slug}/index.html`;
}

function getFilePathMetadata(slug: string): string {
  return `saves/${slug}/article.json`;
}

// delete the article from the db and the file system
export async function removeArticle(storeClient: BaseClient, slug: string): Promise<void> {
  // const files = await glob(storeClient, `saves/${slug}/*`);

  for (const file of await glob(storeClient, `saves/${slug}/*`)) {
    console.log("Deleting file", file);
    await storeClient.remove(file);
  }

  // delete the directory. is this needed?
  // storeClient.remove(`saves/${slug}`);

  // remove the article from the db
  await db.articles.delete(slug);
}

export async function updateArticleState(
  // db: DbType,
  storeClient: BaseClient,
  slug: string,
  state: string
): Promise<Article> {
  // const metadataPath = getFilePathMetadata(slug);

  // delete the directory if deleting. TODO: recursive
  // storeClient?.remove(`saves/${slug}/index.html`);

  // set the state in the file

  const article = await db.articles.get(slug);

  if (article === undefined) {
    throw new Error("article empty");
  }

  article.state = state;

  await storeClient.storeFile(
    "application/json",
    getFilePathMetadata(slug),
    JSON.stringify(article)
  );

  // set the state in the db

  await db.articles.put(article);

  return article;
}

//   public async downloadAndResizeImage(url: string, targetDir: string) {
//     const maxDimension = 200;
//     const filePath = url.split("/").pop();
//     const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;

//     // // Download the image
//     // const response = await fetch(url);
//     // const buffer = await response.arrayBuffer();

//     // // Get the image type from the response headers
//     // const imageType = response.headers.get('Content-Type').split('/')[1];

//     // // Resize the image to a maximum dimension
//     // const resizedImage = await ImageManipulator.manipulateAsync(buffer, [
//     //   {
//     //     resize: {
//     //       width: maxDimension,
//     //       height: maxDimension,
//     //     },
//     //   },
//     // ]);

//     // // Save the image to the SAF
//     // const file = await SAF.createFileAsync(
//     //  `${this.directory}/${targetDir}`,
//     //    filePath,
//     //   `image/${imageType}`,
//     // );
//     // await FileSystem.writeAsStringAsync(file, resizedImage.base64, {
//     //   encoding: 'base64',
//     // });

//     // return file.uri;
//   }
// }

// export class FileManagerWeb extends FileManager {
//   public directory: string;

//   public async downloadAndResizeImage(url: string, targetDir: string) {
//     const maxDimension = 200;
//     const filePath = url.split("/").pop();
//     const outputFilePath = `${this.directory}/${targetDir}/${filePath}`;
//   }
