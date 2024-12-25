import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
import { List, PaperProvider, Text, useTheme } from "react-native-paper";

import { StorageAccessFramework as SAF } from "expo-file-system";

import { generateFileManager, getDir, loadColorScheme, saveColorScheme } from "@/app/tools";
import { FileManager, DbManager, ingestUrl, Article } from "@savr/lib";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { version } from "../package.json" with { type: "json" };
import { useColorScheme } from "@/hooks/useColorScheme.web";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";

export default function PreferencesScreen() {
  const [dir, setDir] = React.useState<string | null>(null);

  // const [colorScheme, setColorScheme] = React.useState("light");

    const systemColorScheme = useColorScheme();

    const [colorScheme, setColorScheme] = useState(
      systemColorScheme === "dark" ? DarkTheme : DefaultTheme
    );

  // const theme = useTheme();

  useEffect(() => {
    const setup = async () => {
      try {
        setDir(await getDir(Platform.OS));
        setColorScheme(await loadColorScheme());
      } catch (error) {
        console.error(error);
      }
    };
    setup();
  }, []);

  const storeDir = async (value: string) => {
    try {
      await AsyncStorage.setItem("data-directory", value);
    } catch (e) {
      console.error(e);
      // saving error
    }
  };

  const handleChooseDir = async () => {
    if (Platform.OS === "web") {
      return;
    }

    const permission = await SAF.requestDirectoryPermissionsAsync();
    if (permission.granted) {
      const dir = permission.directoryUri;

      console.log(`SAF DIR CHOSEN: ${dir}`);

      try {
        const volAndPath = dir.split(":")[1].split("/").at(-1);
        const saf_data_dir = `${dir}/document/${volAndPath}%2F`;
        // setChosenDir(saf_data_dir);

        await storeDir(saf_data_dir);

        const fm = await generateFileManager(Platform.OS);

        if (!fm) {
          console.error("FileManager not defined");
          throw new Error("FileManager not defined");
        }
        // const dbManager = fm.generateJsonDbManager();

        // setFileManager(fm);
        // setDbManager(dbManager);

        // const articles = await dbManager.getArticles();

        // console.log("SAF loaded articles:", articles);

        // const slugs: string[] = articles.map((item) => item.slug);

        // // setDirContents(slugs);

        // console.log(`SAF DIR CONTENTS: ${slugs}`);
        // setDirContents(slugs);
      } catch (error) {
        console.error(error);
      }
    } else {
      console.log("SAF DIR Permission denied");
    }
  };

  return (
    <ScrollView 
    style={styles.container} 
    // style={colorScheme}
    >

      <Text style={{ color: colorScheme.colors.text }}>
        Why is the background following the color scheme change, but the text color is not?
      </Text>


      <List.Section>
        <List.Subheader>Reading</List.Subheader>
        <List.Item
          title="Font Size"
          description="Medium"
          left={(props) => <List.Icon {...props} icon="format-size" />}
        />
        <List.Item
          title="Theme"
          description={colorScheme === DarkTheme ? "Dark" : "Light"}
          left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
 
          onPress={() => {
            // const colorScheme = useColorScheme();
            const newSchemeStr = colorScheme === DarkTheme ? "light" : "dark";

            const newScheme = colorScheme === DarkTheme ? DefaultTheme : DarkTheme;

            setColorScheme(newScheme);

            saveColorScheme(newSchemeStr);
            // AsyncStorage.setItem("color-scheme", newScheme);

            console.log("set color scheme", newScheme);
            
            // PaperProvider.setTheme({ dark: newScheme });
          }}
        />
      </List.Section>

      <List.Section>
        <List.Subheader>Storage</List.Subheader>
        <List.Item
          title="Choose data directory"
          description={dir || "Not set"}
          left={(props) => <List.Icon {...props} icon="folder" />}
          onPress={handleChooseDir}
        />
      </List.Section>

      <List.Section>
        <List.Subheader>About</List.Subheader>
        <List.Item
          title="Version"
          description={version}
          left={(props) => <List.Icon {...props} icon="information" />}
        />
      </List.Section>

      <Text>Platform: {Platform.OS}</Text>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: "#fff",
  },
});
