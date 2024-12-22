import React, { useState, useEffect } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { List, IconButton, FAB, Portal, Dialog, TextInput, Button, Text } from "react-native-paper";
// import { useNavigation } from "@react-navigation/native";
// import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
// import { RootStackParamList } from '../../App';
// import { Article, ArticleDatabase } from '../types';

// import db from '../../assets/db.json';
// import { Article } from "../../lib/src/models";
// import { RootStackParamList } from "./App";

import { Image, Platform, Linking, TouchableOpacity } from "react-native";

// import DocumentPicker from 'react-native-document-picker';
// import { DocumentPickerOptions } from 'react-native-document-picker';

import AsyncStorage from "@react-native-async-storage/async-storage";

import { StorageAccessFramework as SAF } from "expo-file-system";

import { Link, router } from "expo-router";
// import { DirectoryContext } from '@/components/DirectoryProvider';

import { generateFileManager } from "@/app/tools";
import { FileManager, DbManager, ingestUrl, Article } from "@savr/lib";

// type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AddArticleDialog: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [url, setUrl] = useState(
    "https://www.freecodecamp.org/news/javascript-typeof-how-to-check-the-type-of-a-variable-or-object-in-js/"
  );

  const handleSave = () => {
    // TODO: Implement article saving
    alert("Article saving not yet implemented");
    // setUrl("");
    onClose();
  };

  return (
    <Portal>
      <Dialog visible={open} onDismiss={onClose}>
        <Dialog.Title>Add Article</Dialog.Title>
        <Dialog.Content>
          <TextInput label="URL" value={url} onChangeText={setUrl} mode="outlined" />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onClose}>Cancel</Button>
          <Button onPress={handleSave}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default function ArticleListScreen() {
  // const navigation = useNavigation<NavigationProp>();
  const [articles, setArticles] = useState<Article[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);

  const [ingestStatus, setIngestStatus] = useState<string | null>(null);

  const [dirContents, setDirContents] = useState<string[] | null>(null);

  const [fileManager, setFileManager] = useState<FileManager | null>(null);

  const [dbManager, setDbManager] = useState<DbManager | null>(null);

  const [url, setUrl] = useState<string>(
    "https://www.freecodecamp.org/news/javascript-typeof-how-to-check-the-type-of-a-variable-or-object-in-js/"
  );

  useEffect(() => {
    const setManagers = async () => {
      try {
        const fm = await generateFileManager(Platform.OS);

        if (!fm) {
          console.error("FileManager not defined");
          throw new Error("FileManager not defined");
        }
        const dbManager = fm.generateJsonDbManager();

        setFileManager(fm);
        setDbManager(dbManager);

        console.log(`Platform: ${Platform.OS}`);

        if (Platform.OS === "web") {
          const dataDir = process.env.EXPO_PUBLIC_DATA_DIR;
          const service = process.env.EXPO_PUBLIC_SAVR_SERVICE;

          console.log(`DATA_DIR: ${dataDir}`);
          console.log(`SAVR_SERVICE: ${service}`);

          if (service) {
            getContentsWeb(dbManager);
          }
        }
      } catch (error) {
        console.error(error);
      }
    };
    setManagers();
  }, []);

  const getContentsWeb = async (db: DbManager) => {
    if (!db) {
      console.error("dbManager is null");
      throw new Error("dbManager is null");
    }

    const articles = await db.getArticles();

    setArticles(articles);

    try {
      const slugs: string[] = articles.map((item) => item.slug);

      setDirContents(slugs);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmitUrl = async () => {
    console.log(url);

    if (Platform.OS === "web") {
      // const response = await fetch(`${fileManager?.directory}save?url=${url}`);
      const eventSource = new EventSource(
        `${fileManager?.directory}save?url=${encodeURIComponent(url)}`
      );
      eventSource.onmessage = (event) => {
        setIngestStatus(event.data);
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

  const renderItem = ({ item }: { item: Article }) => (
    <List.Item
      title={item.title}
      description={item.slug}
      // description={new Date(item.publishedDate).toLocaleDateString()}
      left={(props) => <List.Icon {...props} icon="file-document-outline" />}
      onPress={() => router.push(`/article/${item.slug}`)}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon={showArchived ? "email" : "email-open"}
          onPress={() => setShowArchived(!showArchived)}
        />
        <IconButton
          icon="cog"
          onPress={() => router.push("/preferences")}
          // onPress={() => navigation.navigate("Preferences")}
        />
      </View>
      <FlatList
        data={filteredArticles}
        renderItem={renderItem}
        keyExtractor={(item) => item.slug}
        style={styles.list}
      />

      <FAB icon="plus" style={styles.fab} onPress={() => setDialogVisible(true)} />

      {/* <AddArticleDialog open={dialogVisible} onClose={() => setDialogVisible(false)} /> */}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Add Article</Dialog.Title>
          <Dialog.Content>
            <TextInput label="URL" value={url} onChangeText={setUrl} mode="outlined" />

            <Text>
              <br />
              {ingestStatus}
            </Text>
          </Dialog.Content>

          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSubmitUrl}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
  },
  list: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
  },
});
