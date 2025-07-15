import React, { useEffect, useState } from "react";
import { Platform, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
// import { router, useLocalSearchParams } from "expo-router";
import {
  removeArticle,
  updateArticleState,
  useFontStore,
  useMyStore,
  useThemeStore,
} from "../tools";
// import { Appbar, IconButton, Menu, Tooltip } from "react-native-paper";
// import { Article } from "@savr/lib";
// import { useSnackbar } from "@/components/SnackbarProvider";
import { PaperProvider } from "react-native-paper";
// import { useRemoteStorage } from "@/components/RemoteStorageProvider";
// import { db } from "@/db";

export default function ArticleView({
  content,
  viewMode = "cleaned",
}: {
  content: string;
  viewMode?: "cleaned" | "original";
}) {
  // const storage = useRemoteStorage();

  // const [viewMode, setViewMode] = useState("cleaned");

  const [html, setHtml] = useState("");

  // const [article, setArticle] = useState({} as Article);

  // TODO: save this to storage
  // const [fontSize, setFontSize] = useState(16);

  // const fontSize = useMyStore((state) => state.fontSize);
  // const setFontSize = useMyStore((state) => state.setFontSize);

  const fontSize = useFontStore((state) => state.fontSize);
  // const setFontSize = useFontStore((state) => state.setFontSize);

  const theme = useThemeStore((state) => state.theme);

  // const { showMessage } = useSnackbar();

  // const currentTheme = useMyStore((state) => state.colorScheme);
  // const getThemeName = useMyStore((state) => state.getThemeName);

  // console.log("content", content);
  useEffect(() => {
    const setup = async () => {
      // db.articles.get(slug).then((article) => {
      //   if (!article) {
      //     console.error("Article not found");
      //     return;
      //   }
      //   setArticle(article);
      // });

      if (viewMode === "original") {
        setHtml(`${content}`);
      } else {
        // TODO: this should really read from lib
        const style = require("../assets/web.css");

        setHtml(`<link rel="stylesheet" href="${style.uri}">${content}`);
      }
    };

    setup();
  }, [viewMode, content]);

  return (
    <>
      {/* <PaperProvider theme={theme}> */}

      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
      >
        <View
          // contentContainerStyle={{
          //   flexGrow: 1,
          // }}
          style={{
            margin: 8,
            backgroundColor: theme.colors.background,
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
        </View>
      </View>

      {/* </PaperProvider> */}
    </>
  );
}

// const styles = StyleSheet.create({
//   htmtTextDark: {
//     color: DarkTheme.colors.text,
//   },
// });
