import React, { useState, useEffect } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Modal,
  TouchableOpacity,
} from "react-native";
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
  SegmentedButtons,
} from "react-native-paper";

import { useLiveQuery } from "dexie-react-hooks";

import { Image, Platform, Linking } from "react-native";

// import RemoteStorage from "remotestoragejs";
// import Widget from "remotestorage-widget";

import type { ImageSourcePropType } from "react-native";

import { router } from "expo-router";

import {
  // generateFileManager,
  loadColorScheme,
  removeArticle,
  updateArticleState,
  useMyStore,
  useThemeStore,
} from "@/tools";
import { Article, generateInfoForCard } from "@savr/lib";
import { useSnackbar } from "@/components/SnackbarProvider";
import { globalStyles } from "./_layout";
import { ThemedText } from "@/components/ThemedText";
import { useRemoteStorage } from "@/components/RemoteStorageProvider";
import { ingestUrl2, readabilityToArticle } from "../../lib/src/ingestion";
import { db } from "@/db";
import extensionConnector from "../utils/extensionConnector";

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

// TODO: this file should not be stored in app assets. it should get them from lib
const fallbackSource = require("../assets/article_bw.webp");

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

function ArticleItem(props: { item: Article }) {
  const item = props.item;

  const storage = useRemoteStorage();

  const [visible, setVisible] = React.useState(false);

  const openMenu = () => setVisible(true);

  const closeMenu = () => setVisible(false);

  const { showMessage } = useSnackbar();

  // const currentTheme = useMyStore((state) => state.colorScheme);

  const theme = useThemeStore((state) => state.theme);

  const deleteArticle = async (article: Article) => {
    console.log(`Deleting ${item.slug}`);

    try {
      // TODO: this should probably delete the dir instead. no need to keep it.

      await removeArticle(storage.client!, article.slug);

      // updateArticleState(client!, article.slug, "deleted");

      // await fileManager?.deleteDir(`saves/${article.slug}`);

      showMessage("Article deleted");
    } catch (e) {
      console.error(e);

      showMessage("Error deleting article", true);
    }
  };

  const archiveArticle = async (article: Article) => {
    console.log(`Archiving ${item.slug}`);

    try {
      updateArticleState(storage.client!, article.slug, "archived");

      showMessage("Article archived");
    } catch (e) {
      console.error(e);

      showMessage("Error archiving article", true);
    }
  };

  const unarchiveArticle = async (article: Article) => {
    console.log(`Unarchiving ${item.slug}`);

    try {
      updateArticleState(storage.client!, article.slug, "unread");

      showMessage("Article unarchived");
    } catch (e) {
      console.error(e);

      showMessage("Error unarchiving article", true);
    }
  };

  let imgSrc = { uri: "xxx" };

  // TODO: figure this part out
  // imgSrc = { uri: `${fileManager?.directory}saves/${item.slug}/thumbnail.webp` };

  return (
    <List.Item
      title={(props) => (
        <ThemedText
          style={{
            flexWrap: "wrap",
            width: "80%",
            fontWeight: "bold",
            color: theme.colors.onBackground,
          }}
        >
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
              if (item.url) {
                navigator.clipboard.writeText(item.url);
                alert("Url copied to clipboard: " + item.url);
              }

              closeMenu();
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
  // const [articles, setArticles] = useState<Article[]>([]);
  // const [showArchived, setShowArchived] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const articles = useLiveQuery(() => db.articles.orderBy("ingestDate").reverse().toArray());

  const corsProxy = useMyStore((state) => state.corsProxy);

  // const articles2 = useLiveQuery(() => db.articles.sortBy("ingestDate").toArray());

  const { remoteStorage, client, widget } = useRemoteStorage();

  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const [ingestPercent, setIngestPercent] = useState<number>(0);

  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const { showMessage } = useSnackbar();

  const [filter, setFilter] = React.useState("unread");

  const [url, setUrl] = useState<string>("");

  // const currentTheme = useMyStore((state) => state.colorScheme);

  const theme = useThemeStore((state) => state.theme);

  // const getThemeName = useMyStore((state) => state.getThemeName);

  // console.log("theme in index", theme);

  useEffect(() => {
    // Set the storage client in the extension connector
    if (client) {
      // alert("set storage client");
      extensionConnector.setStorageClient(client);

      // Set the progress callback for the extension connector
      extensionConnector.setProgressCallback((percent, message) => {
        if (percent !== null) {
          setIngestStatus(message);
          setIngestPercent(percent);
          // Show the dialog when ingestion starts
          if (!dialogVisible) {
            setDialogVisible(true);
          }
        }
        // Optionally hide the dialog when ingestion is complete (percent is 100)
        if (percent === 100) {
          setTimeout(() => {
            setDialogVisible(false);
          }, 2000); // Hide after 2 seconds
        }
      });
    }
  }, [client, dialogVisible]); // Run this effect when the client or dialogVisible changes

  const saveUrl = async () => {
    // TODO: pass in headers/cookies for downloading

    // This function is now primarily for the manual URL input in the dialog.
    // The bookmarklet ingestion will use the progress callback set in useEffect.
    await ingestUrl2(client, corsProxy, url, (percent: number | null, message: string | null) => {
      if (percent !== null) {
        setIngestStatus(message);
        setIngestPercent(percent);
      }
      console.log(`INGESTED URL ${url}`);
    })
      .then((article) => {
        db.articles.put(article);
        showMessage("Article saved");

        // wait a bit before closing the dialog
        setTimeout(() => {
          setDialogVisible(false);
        }, 4000);
      })
      .catch((error) => {
        console.error(error);
        showMessage("Error saving article", true);
      });
  };

  // const handleSubmitUrl2 = async () => {
  //   console.log(url);

  //   if (Platform.OS === "web") {
  //     ingestUrl2(client, url, () => {
  //       console.log(`INGESTED URL ${url}`);
  //     });

  //     // const response = await fetch(`${fileManager?.directory}save?url=${url}`);
  //     const eventSource = new EventSource(
  //       `${fileManager?.directory}save?url=${encodeURIComponent(url)}`
  //     );
  //     eventSource.onmessage = (event) => {
  //       const data = JSON.parse(event.data);
  //       if (data.percent && data.message) {
  //         setIngestStatus(`${data.percent}% ${data.message}`);
  //         setIngestPercent(data.percent);
  //         setIngestMessage(data.message);
  //         // updateProgressList(data.percent, data.message);
  //       }
  //       if (data.percent == 100) {
  //         eventSource.close();
  //         refreshArticleList();
  //         showMessage("Article saved");
  //       }

  //       console.log(event.data);
  //     };
  //     eventSource.onerror = () => {
  //       console.error("Error connecting to SSE");
  //       eventSource.close();
  //     };
  //   } else {
  //     if (dbManager !== null && url !== null) {
  //       await ingestUrl(dbManager, url, () => {
  //         console.log(`INGESTED URL ${url}`);
  //       });
  //     }
  //   }
  // };

  const filteredArticles = articles?.filter((article: Article) => article.state === filter);

  return (
    <PaperProvider theme={theme}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
        }}
      >
        <View style={globalStyles.header}>
          <Tooltip title="Add article" enterTouchDelay={0} leaveTouchDelay={0}>
            <IconButton
              icon="plus-circle"
              onPress={() => {
                // Reset ingestion status when opening the dialog manually
                setIngestStatus(null);
                setIngestPercent(0);
                setIngestMessage(null);
                setDialogVisible(true);
                setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
              }}
            />
          </Tooltip>

          <SafeAreaView
            style={{
              flex: 1,
              alignItems: "center",
            }}
          >
            <SegmentedButtons
              value={filter}
              // onValueChange={setSegment}

              onValueChange={setFilter}
              style={{
                // fontSize: 14,
                paddingHorizontal: 8,
                // textAlign: "center",
              }}
              buttons={[
                {
                  value: "unread",
                  label: "Saves",
                  icon: "file-document-multiple",
                  // style: { flexShrink: 1 },
                },
                {
                  value: "archived",
                  label: "Archive",
                  icon: "archive",
                  // style: {
                  //   flex: 1,
                  //   flexShrink: 1,
                  // },
                },
              ]}
            />
          </SafeAreaView>

          {/* <IconButton
            icon={showArchived ? "email" : "email-open"}
            onPress={() => setShowArchived(!showArchived)}
          /> */}
          <IconButton icon="cog" onPress={() => router.push("/preferences")} />
        </View>

        <View
          style={{
            backgroundColor: theme.colors.surface,
            flex: 1,
          }}
        >
          {filteredArticles && filteredArticles.length > 0 ? (
            <View style={{ backgroundColor: "red", flex: 1, paddingRight: 0 }}>
              <View style={{ maxWidth: 650, alignSelf: "center", width: "100%" }}>
                {filteredArticles.map((item) => (
                  <ArticleItem key={item.slug} item={item} />
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <View style={styles.emptyState}>
                <Text style={[styles.emptyStateTitle, { color: theme.colors.onSurface }]}>
                  Welcome to Savr
                </Text>
                <Text style={[styles.emptyStateSubtitle, { color: theme.colors.onSurface }]}>
                  {filter === "unread"
                    ? "Start saving articles to see them here"
                    : "No archived articles yet"}
                </Text>
                <Button
                  mode="contained"
                  onPress={() => {
                    setDialogVisible(true);
                    setUrl(sampleArticleUrls[Math.floor(Math.random() * sampleArticleUrls.length)]);
                  }}
                  style={styles.addFirstButton}
                >
                  Add Your First Article
                </Button>
              </View>
            </View>
          )}
        </View>

        <Modal
          visible={dialogVisible}
          onRequestClose={() => setDialogVisible(false)}
          transparent={true}
          animationType="fade"
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setDialogVisible(false)}
          >
            <TouchableOpacity
              style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
                Add Article
              </Text>
              <TextInput
                label="URL"
                value={url}
                onChangeText={setUrl}
                mode="outlined"
                style={styles.textInput}
              />

              {ingestPercent != 0 && (
                <>
                  <Text style={[styles.progressText, { color: theme.colors.onSurface }]}>
                    {ingestStatus}
                  </Text>
                  <ProgressBar progress={ingestPercent / 100} />
                </>
              )}

              <View style={styles.modalActions}>
                <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
                <Button onPress={saveUrl}>Save</Button>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
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
  },
  dialog: {
    width: 500, // TODO: make this a max width somehow
    alignSelf: "center",
  },
  portalContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 1000,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 8,
    padding: 20,
    width: 500,
    maxWidth: "90%",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 20,
  },
  textInput: {
    marginBottom: 20,
  },
  progressText: {
    marginTop: 20,
    marginBottom: 10,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
  },
  emptyState: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
    opacity: 0.7,
  },
  addFirstButton: {
    marginTop: 8,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
