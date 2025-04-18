import React, { useEffect, useState } from "react";
import { Platform, ScrollView, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { router, useLocalSearchParams } from "expo-router";
import { useFontStore, useMyStore, useThemeStore } from "../tools";
import { Appbar, IconButton, Menu, Tooltip } from "react-native-paper";
import { Article } from "@savr/lib";
import { useSnackbar } from "@/components/SnackbarProvider";
import { PaperProvider } from "react-native-paper";
import { useRemoteStorage } from "@/components/RemoteStorageProvider";

export default function ArticleScreen() {
  const { slug } = useLocalSearchParams();

  const storage = useRemoteStorage();

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
  // const [fontSize, setFontSize] = useState(16);

  // const fontSize = useMyStore((state) => state.fontSize);
  // const setFontSize = useMyStore((state) => state.setFontSize);

  const fontSize = useFontStore((state) => state.fontSize);
  const setFontSize = useFontStore((state) => state.setFontSize);

  const fileManager = useMyStore((state) => state.fileManager);

  const dbManager = useMyStore((state) => state.dbManager);

  const theme = useThemeStore((state) => state.theme);

  const { showMessage } = useSnackbar();

  // const currentTheme = useMyStore((state) => state.colorScheme);

  // const getThemeName = useMyStore((state) => state.getThemeName);

  // const [fileManager, setFileManager] = useState<FileManager|null|undefined>(null);

  useEffect(() => {
    const setup = async () => {
      try {
        const art = await dbManager!.getArticle(slug);

        if (!art) {
          throw new Error("Article not found");
        }

        console.log(art.slug);

        // TODO: this should really read from lib
        const style = await fileManager!.readTextFile("static/shared/web.css");

        setArticle(art);

        storage.client
          ?.getFile(`saves/${slug}/index.html`)
          .then((file) => {
            console.log("FILE READ");
            console.log(file.data);

            setHtml(`<style>${style}</style>${file.data}`);
          })
          .catch((error) => {
            debugger;
            console.error("Error retrieving contact:", error);
          });
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
      router.push("/");
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
      router.push("/");
    } catch (e) {
      console.error(e);

      showMessage("Error unarchiving article", true);
    }
  };

  return (
    <PaperProvider theme={theme}>
      {/* <View style={globalStyles.tooltipWrapper}> */}
      <Appbar.Header theme={theme}>
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
          backgroundColor: theme.colors.background,
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
                color: theme.colors.onBackground,
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
