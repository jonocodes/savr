import React, { useContext, useEffect, useState } from "react";
import { Platform, ScrollView, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { router, useLocalSearchParams } from "expo-router";
import { generateFileManager, loadColorScheme, saveColorScheme } from "../tools";
import { Appbar, IconButton, Menu, Tooltip } from "react-native-paper";
import { Article, DbManager, FileManager } from "@savr/lib";
import { useSnackbar } from "@/components/SnackbarProvider";
import { useColorScheme } from "@/hooks/useColorScheme.web";
import {
  PaperProvider,
  useTheme,
  MD3LightTheme as LightTheme,
  MD3DarkTheme as DarkTheme,
  // DefaultTheme as PaperLightTheme,
  // DarkTheme as PaperDarkTheme,
} from "react-native-paper";
// import { DarkTheme, Theme, DefaultTheme } from "@react-navigation/native";
import { globalStyles } from "../_layout";

export default function ArticleScreen() {
  const { slug } = useLocalSearchParams();

  if (typeof slug !== "string") {
    // NOTE: this also make sure slug is set for some reason
    throw new Error("Slug is not a string");
  }

  const [html, setHtml] = useState("");

  const [article, setArticle] = useState({} as Article);

  const [visible, setVisible] = React.useState(false);

  const openMenu = () => setVisible(true);

  const closeMenu = () => setVisible(false);

  // TODO: save this to storage
  const [fontSize, setFontSize] = useState(16);

  const [fileManager, setFileManager] = useState<FileManager | null>(null);

  const [dbManager, setDbManager] = useState<DbManager | null>(null);

  const systemColorScheme = useColorScheme(); // Get the system's color scheme
  const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  // console.log("systemColorScheme", systemColorScheme);

  const [colorScheme, setColorScheme] = useState(
    systemColorScheme === "dark" ? DarkTheme : LightTheme
  );

  // const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const theme = isDarkMode ? DarkTheme : LightTheme;

  const { showMessage } = useSnackbar();

  // const [fileManager, setFileManager] = useState<FileManager|null|undefined>(null);

  useEffect(() => {
    // console.log(`Platform: ${Platform.OS}`);

    const setup = async () => {
      try {
        setColorScheme(await loadColorScheme());

        const fm = await generateFileManager(Platform.OS);

        // TODO: move to app startup and share with zustand?

        if (!fm) {
          console.error("FileManager not defined");
          throw new Error("FileManager not defined");
        }

        setFileManager(fm);

        const db = fm.generateJsonDbManager();

        setDbManager(db);

        const art = await db.getArticle(slug);

        if (!art) {
          throw new Error("Article not found");
        }

        console.log(art.slug);

        setArticle(art);

        const content = await fm.readTextFile(`saves/${slug}/index.html`);

        // TODO: this should really read from lib
        const style = await fm.readTextFile("static/shared/web.css");

        setHtml(`<style>${style}</style>${content}`);
      } catch (e) {
        // error reading value
        console.error(e);
      }
    };

    setup();
  }, []);

  const deleteArticle = async () => {
    console.log(`Deleting ${article.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "deleted");

      await fileManager?.deleteDir(`saves/${article.slug}`);

      showMessage("Article deleted");
      router.push("/");

      return true;
    } catch (e) {
      console.error(e);

      showMessage("Error deleting article", true);

      return false;
    }
  };

  const archiveArticle = async () => {
    console.log(`Archiving ${article.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "archived");

      setArticle(articleUpdated!);

      showMessage("Article archived");
    } catch (e) {
      console.error(e);

      showMessage("Error archiving article", true);
    }
  };

  const unarchiveArticle = async () => {
    if (!article) throw new Error("Article is undefined");

    console.log(`Unarchiving ${article.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "unread");

      setArticle(articleUpdated!);

      showMessage("Article unarchived");
    } catch (e) {
      console.error(e);

      showMessage("Error unarchiving article", true);
    }
  };

  return (
    <PaperProvider theme={colorScheme}>
      {/* <View style={globalStyles.tooltipWrapper}> */}
      <Appbar.Header theme={colorScheme}>
        {/* {navigation.canGoBack() && <Appbar.BackAction onPress={() => navigation.goBack()} />} */}

        <Appbar.BackAction
          onPress={
            () => {
              router.push("/");
            }
            // navigation.goBack()
          }
        />

        <Appbar.Content title="" />
        {/* Add buttons to the top-right */}
        {/* <Appbar.Action icon="cog" /> */}

        {/* <Appbar.Action
          icon="theme-light-dark"
          onPress={() => {
            const newSchemeStr = colorScheme === DarkTheme ? "light" : "dark";

            const newScheme = colorScheme === DarkTheme ? LightTheme : DarkTheme;

            setColorScheme(newScheme);

            // toggleTheme();

            saveColorScheme(newSchemeStr);
            // AsyncStorage.setItem("color-scheme", newScheme);

            console.log("set color scheme", newScheme);
          }}
        /> */}

        <Tooltip title="Increase font" enterTouchDelay={0} leaveTouchDelay={0}>
          <IconButton icon="format-font-size-increase" onPress={() => setFontSize(fontSize + 2)} />
        </Tooltip>

        <Tooltip title="Decrease font" enterTouchDelay={0} leaveTouchDelay={0}>
          <IconButton icon="format-font-size-decrease" onPress={() => setFontSize(fontSize - 2)} />
        </Tooltip>

        {article?.state === "archived" ? (
          <Tooltip title="Unarchive" enterTouchDelay={0} leaveTouchDelay={0}>
            <IconButton
              icon="archive-arrow-up"
              onPress={() => {
                closeMenu();
                unarchiveArticle();
              }}
            />
          </Tooltip>
        ) : (
          <Tooltip title="Archive" enterTouchDelay={0} leaveTouchDelay={0}>
            <Appbar.Action
              icon="archive-arrow-down"
              onPress={() => {
                closeMenu();
                archiveArticle();
              }}
            />
          </Tooltip>
        )}

        <Menu
          visible={visible}
          onDismiss={closeMenu}
          anchor={<IconButton icon="dots-vertical" onPress={openMenu} />}
          contentStyle={{
            marginTop: 8,
            borderRadius: 8,
            // paddingHorizontal: 16,
          }}
        >
          <Menu.Item
            leadingIcon="web"
            onPress={() => {
              closeMenu();
              // deleteArticle();
            }}
            title="View Original"
          />

          <Menu.Item
            leadingIcon="share-variant"
            onPress={() => {
              closeMenu();
              // deleteArticle();
            }}
            title="Share"
          />

          <Menu.Item
            leadingIcon="trash-can"
            onPress={() => {
              closeMenu();
              deleteArticle();
            }}
            title="Delete"
          />
        </Menu>
      </Appbar.Header>

      <View
        style={{
          flex: 1,
          backgroundColor: colorScheme.colors.background,
        }}
      >
        {Platform.OS === "web" ? (
          <ScrollView
            // contentContainerStyle={{
            //   flexGrow: 1,
            // }}
            style={{
              margin: 8,
              // fontSize: 30,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: fontSize,
                color: colorScheme.colors.onBackground,
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </ScrollView>
        ) : (
          // TODO: may need to use react-native-render-html
          <WebView originWhitelist={["*"]} source={{ html: html }} />
        )}
      </View>
      {/* </View> */}
    </PaperProvider>
  );
}

// const styles = StyleSheet.create({
//   htmtTextDark: {
//     color: DarkTheme.colors.text,
//   },
// });
