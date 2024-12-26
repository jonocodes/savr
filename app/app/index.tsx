import React, { useState, useEffect } from "react";
import { View, FlatList, StyleSheet, ScrollView } from "react-native";
import {
  List,
  IconButton,
  FAB,
  Portal,
  Dialog,
  TextInput,
  Button,
  Text,
  Menu,
  Icon,
  Tooltip,
  PaperProvider,
  MD3LightTheme as LightTheme,
  MD3DarkTheme as DarkTheme,
  ProgressBar,
} from "react-native-paper";

import { Image, Platform, Linking, TouchableOpacity } from "react-native";

import type { ImageSourcePropType } from "react-native";

import { router } from "expo-router";

import { generateFileManager, loadColorScheme } from "@/app/tools";
import { FileManager, DbManager, ingestUrl, Article, generateInfoForCard } from "@savr/lib";
import { useSnackbar } from "@/components/SnackbarProvider";
import { globalStyles } from "./_layout";
import { useColorScheme } from "@/hooks/useColorScheme.web";
import { ThemedText } from "@/components/ThemedText";
// import { ScrollView } from "react-native-reanimated/lib/typescript/Animated";

// const AddArticleDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
//   const [url, setUrl] = useState(
//     "https://www.freecodecamp.org/news/javascript-typeof-how-to-check-the-type-of-a-variable-or-object-in-js/"
//   );

//   return (
//     <Portal>
//       <Dialog visible={open} onDismiss={onClose}>
//         <Dialog.Title>Add Article</Dialog.Title>
//         <Dialog.Content>
//           <TextInput label="URL" value={url} onChangeText={setUrl} mode="outlined" />
//         </Dialog.Content>
//         <Dialog.Actions>
//           <Button onPress={onClose}>Cancel</Button>
//           <Button onPress={handleSave}>Save</Button>
//         </Dialog.Actions>
//       </Dialog>
//     </Portal>
//   );
// };

const sampleArticleUrls = [
  "https://www.apalrd.net/posts/2023/network_ipv6/",
  "https://getpocket.com/explore/item/is-matter-conscious",
  "https://medium.com/androiddevelopers/jetnews-for-every-screen-4d8e7927752",
  "https://theconversation.com/records-of-pompeiis-survivors-have-been-found-and-archaeologists-are-starting-to-understand-how-they-rebuilt-their-lives-230641",
  "https://en.m.wikipedia.org/wiki/Dune:_Part_Two",
  "https://lifehacker.com/home/how-to-make-more-kitchen-counter-space", // has svg
  "http://leejo.github.io/2024/09/01/off_by_one/", // no ssl
  "https://www.troyhunt.com/inside-the-3-billion-people-national-public-data-breach/",
  "https://medium.com/airbnb-engineering/rethinking-text-resizing-on-web-1047b12d2881",
  "https://leejo.github.io/2024/09/29/holding_out_for_the_heros_to_fuck_off/",
];

const fallbackSource = require("../assets/images/react-logo.png");

interface ThumbnailImageProps {
  source: ImageSourcePropType;
  // Add any other props you want to support
}

const ThumbnailImage = (props: ThumbnailImageProps) => {
  const [imageSource, setImageSource] = useState(props.source);

  return (
    <Image
      {...props}
      source={imageSource}
      onError={() => setImageSource(fallbackSource)}
      style={{ width: 100, height: 100, padding: 20 }}
    />
  );
};

function ArticleItem(props: {
  item: Article;
  fileManager: FileManager | null;
  dbManager: DbManager | null;
  refreshArticles: () => void;
}) {
  const item = props.item;
  const fileManager = props.fileManager;
  const dbManager = props.dbManager;

  const [visible, setVisible] = React.useState(false);

  const openMenu = () => setVisible(true);

  const closeMenu = () => setVisible(false);

  const { showMessage } = useSnackbar();

  const deleteArticle = async (article: Article) => {
    console.log(`Deleting ${item.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "deleted");

      await fileManager?.deleteDir(`saves/${article.slug}`);

      props.refreshArticles();

      showMessage("Article deleted");
    } catch (e) {
      console.error(e);

      showMessage("Error deleting article", true);
    }
  };

  const archiveArticle = async (article: Article) => {
    console.log(`Archiving ${item.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "archived");

      props.refreshArticles();

      showMessage("Article archived");
    } catch (e) {
      console.error(e);

      showMessage("Error archiving article", true);
    }
  };

  const unarchiveArticle = async (article: Article) => {
    console.log(`Unarchiving ${item.slug}`);

    try {
      const articleUpdated = await dbManager?.setArticleState(article.slug, "unread");

      props.refreshArticles();

      showMessage("Article unarchived");
    } catch (e) {
      console.error(e);

      showMessage("Error unarchiving article", true);
    }
  };

  let imgSrc = require("../assets/images/react-logo.png");

  // const fallbackSource = require("../assets/images/react-logo.png");

  if (Platform.OS === "web") {
    imgSrc = { uri: `${fileManager?.directory}saves/${item.slug}/thumbnail.webp` };
  } else if (Platform.OS === "android") {
    // TODO: figure this part out
    // imgSrc = { uri: `${fileManager?.directory}saves/${item.slug}/thumbnail.webp` };
  }

  return (
    <List.Item
      // title={item.title}
      title={(props) => (
        <ThemedText style={{ flexWrap: "wrap", width: "80%", fontWeight: "bold" }}>
          {item.title}
        </ThemedText>
      )}
      description={generateInfoForCard(item)}
      left={() => <ThumbnailImage source={imgSrc} />}
      onPress={() => router.push(`/article/${item.slug}`)}
      right={() => (
        <Menu
          visible={visible}
          onDismiss={closeMenu}
          anchor={<IconButton icon="dots-vertical" onPress={openMenu} />}
          // anchorOrigin={{ vertical: "bottom", horizontal: "right" }}

          contentStyle={{
            marginTop: 8,
            borderRadius: 8,
            // paddingHorizontal: 16,
          }}
        >
          {item.state === "archived" ? (
            <Menu.Item
              leadingIcon="archive-arrow-up"
              onPress={() => {
                closeMenu();
                unarchiveArticle(item);
              }}
              title="Unarchive"
            />
          ) : (
            <Menu.Item
              leadingIcon="archive-arrow-down"
              onPress={() => {
                closeMenu();
                archiveArticle(item);
              }}
              title="Archive"
            />
          )}
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
              deleteArticle(item);
            }}
            title="Delete"
          />
        </Menu>
      )}
    />
  );
}

export default function ArticleListScreen() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const [ingestPercent, setIngestPercent] = useState<number>(0);

  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const [fileManager, setFileManager] = useState<FileManager | null>(null);

  const [dbManager, setDbManager] = useState<DbManager | null>(null);

  const { showMessage } = useSnackbar();

  const [url, setUrl] = useState<string>("");

  const systemColorScheme = useColorScheme(); // Get the system's color scheme
  // const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  // const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const [colorScheme, setColorScheme] = useState(
    systemColorScheme === "dark" ? DarkTheme : LightTheme
  );

  useEffect(() => {
    const setup = async () => {
      // TODO: move to app startup and share with zustand?

      try {
        setColorScheme(await loadColorScheme());

        const fm = await generateFileManager(Platform.OS);

        if (!fm) {
          console.error("FileManager not defined");
          throw new Error("FileManager not defined");
        }
        const dbManager = fm.generateJsonDbManager();

        setFileManager(fm);
        setDbManager(dbManager);

        console.log(`Platform: ${Platform.OS}`);

        refreshArticleList(dbManager);

        // if (Platform.OS === "web") {
        //   const dataDir = process.env.EXPO_PUBLIC_DATA_DIR;
        //   const service = process.env.EXPO_PUBLIC_SAVR_SERVICE;

        //   console.log(`DATA_DIR: ${dataDir}`);
        //   console.log(`SAVR_SERVICE: ${service}`);

        //   if (service) {
        //     refreshArticleList(dbManager);
        //   }
        // }
      } catch (error) {
        console.error(error);
      }
    };
    setup();
  }, []);

  const refreshArticleList = async (db: DbManager) => {
    if (!db) {
      console.error("dbManager is null");
      throw new Error("dbManager is null");
    }

    const articles = await db.getArticles();

    setArticles(articles);
  };

  const handleSubmitUrl = async () => {
    console.log(url);

    if (Platform.OS === "web") {
      // const response = await fetch(`${fileManager?.directory}save?url=${url}`);
      const eventSource = new EventSource(
        `${fileManager?.directory}save?url=${encodeURIComponent(url)}`
      );
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.percent && data.message) {
          setIngestStatus(`${data.percent}% ${data.message}`);
          setIngestPercent(data.percent);
          setIngestMessage(data.message);
          // updateProgressList(data.percent, data.message);
        }
        if (data.percent == 100) {
          eventSource.close();
          refreshArticleList(dbManager!);
          showMessage("Article saved");

          // if (completedCallback != null)
          //     setTimeout(() => {
          //        completedCallback()
          //     }, 1000);
        }

        // setIngestStatus(event.data);
        console.log(event.data);
      };
      eventSource.onerror = () => {
        console.error("Error connecting to SSE");
        eventSource.close();
      };
    } else {
      if (dbManager !== null && url !== null) {
        await ingestUrl(dbManager, url, () => {
          console.log(`INGESTED URL ${url}`);
        });
      }
    }
  };

  const filteredArticles = articles.filter(
    (article) => article.state === (showArchived ? "archived" : "unread")
  );

  return (
    <PaperProvider theme={colorScheme}>
      <View
        //  style={globalStyles.container}
        style={{
          flex: 1,
          backgroundColor: colorScheme.colors.background,
        }}
      >
        <View style={globalStyles.header}>
          <Tooltip title="Add article" enterTouchDelay={0} leaveTouchDelay={0}>
            <IconButton
              icon="plus-circle"
              onPress={() => {
                setIngestStatus(null);

                setIngestPercent(0);
                setIngestMessage(null);

                setDialogVisible(true);
                setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
              }}
            />
          </Tooltip>
          <IconButton
            icon={showArchived ? "email" : "email-open"}
            onPress={() => setShowArchived(!showArchived)}
          />
          <IconButton icon="cog" onPress={() => router.push("/preferences")} />
        </View>

        <ScrollView>
          <FlatList
            data={filteredArticles}
            // renderItem={renderItem}
            renderItem={({ item }) => (
              <ArticleItem
                item={item}
                fileManager={fileManager}
                dbManager={dbManager}
                refreshArticles={() => refreshArticleList(dbManager!)}
              />
            )}
            keyExtractor={(item) => item.slug}
            style={styles.list}
          />
        </ScrollView>

        {/* <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => {
            setIngestStatus(null);
            setDialogVisible(true);

            setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
          }}
        /> */}

        {/* <AddArticleDialog open={dialogVisible} onClose={() => setDialogVisible(false)} /> */}

        <Portal>
          <Dialog
            visible={dialogVisible}
            onDismiss={() => setDialogVisible(false)}
            style={styles.dialog}
          >
            <Dialog.Title>Add Article</Dialog.Title>
            <Dialog.Content>
              <TextInput label="URL" value={url} onChangeText={setUrl} mode="outlined" />

              {ingestPercent != 0 && (
                <>
                  <Text
                    style={{
                      // textAlign: "center",
                      marginTop: 20,
                      marginBottom: 10,
                    }}
                  >
                    {ingestStatus}
                  </Text>

                  <ProgressBar progress={ingestPercent / 100} />
                </>
              )}
            </Dialog.Content>

            <Dialog.Actions>
              <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
              <Button onPress={handleSubmitUrl}>Save</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  // container: {
  //   flex: 1,
  // },
  list: {
    flex: 1,
    maxWidth: 650,
    alignSelf: "center",
  },
  dialog: {
    width: 500, // TODO: make this a max width somehow
    alignSelf: "center",
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
