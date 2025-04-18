import React, { useEffect, useState } from "react";
import { StyleSheet, ScrollView, Platform } from "react-native";

import {
  List,
  Text,
  PaperProvider,
  // MD3LightTheme, //as LightTheme,
  // MD3DarkTheme, //as DarkTheme,
  Appbar,
  // DefaultTheme as PaperLightTheme,
  // DarkTheme as PaperDarkTheme,
} from "react-native-paper";


import { DarkTheme, getDir, LightTheme, useThemeStore } from "@/app/tools";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { version } from "../package.json" with { type: "json" };
import { router } from "expo-router";
// import { DarkTheme, DefaultTheme } from "@react-navigation/native";

export default function PreferencesScreen() {
  const [dir, setDir] = React.useState<string | null>(null);

    const theme = useThemeStore((state)=>state.theme)
    const setTheme = useThemeStore((state)=>state.setTheme)

  // const currentTheme = useMyStore((state) => state.colorScheme);

  // const toggleTheme = useMyStore((state) => state.toggleTheme);


  useEffect(() => {
    const setup = async () => {
      try {
        setDir(await getDir(Platform.OS));
        // setColorScheme(await loadColorScheme());
      } catch (error) {
        console.error(error);
      }
    };
    setup();
  }, []);

  const togTheme = async () => {

    let newTheme = null;

      if (theme.name == DarkTheme.name)
        newTheme = LightTheme
      else if (theme.name == LightTheme.name)
        newTheme = DarkTheme
      else
        throw new Error(`theme not found ${theme} ... ${theme.name}`,)

    // if (theme == DarkTheme)
    //   newTheme = LightTheme
    // else if (theme == LightTheme)
    //   newTheme = DarkTheme
    // else
    //   throw new Error(`theme not found ${theme} ... ${theme.name}`,)

    console.log("toggling to", newTheme.name)

    await setTheme(newTheme)

  };

  const storeDir = async (value: string) => {
    try {
      await AsyncStorage.setItem("data-directory", value);
    } catch (e) {
      console.error(e);
      // saving error
    }
  };

  // TODO: I should not have to use PaperProvider since its in the layout.
  //  also should not have to set ScrollView style excplicitly or have have to extract the bg only
  return (
      <PaperProvider 
      // theme={theme}
      theme={theme}
      >

        <Appbar.Header 
        theme={theme}
        >

          <Appbar.BackAction
            onPress={
              () => {
                router.push("/");
              }
            }
          />

          <Appbar.Content title="Preferences" />
        </Appbar.Header>

        <ScrollView
    // style={styles.container} 
    // style={colorScheme.colors }
    style={{ 
      backgroundColor: theme.colors.background,
      }}
    // style={currentTheme.colors}
    >

      <List.Section>
        <List.Subheader>Reading</List.Subheader>
        {/* <List.Item
          title="Font Size"
          description="Medium"
          left={(props) => <List.Icon {...props} icon="format-size" />}
        /> */}
        <List.Item
          title="Theme"
          description={
            theme.name.replace(/^./, (char) => char.toUpperCase())
          }
          left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
 
          onPress={async() => {

            // toggleTheme();

            await togTheme();

            // setTheme(currentTheme);

            console.log('loaded persisted theme', theme)

            // const newScheme = currentTheme;

            // await saveColorScheme(currentTheme);

            // console.log("set color scheme", currentTheme.name);
            
          }}
        />
      </List.Section>

      <List.Section>
        <List.Subheader>About</List.Subheader>
        <List.Item
          title="Version"
          description={version}
          left={(props) => <List.Icon {...props} icon="information" />}
        />

        <List.Item
          title="Platform"
          description={Platform.OS}
          left={(props) => <List.Icon {...props} icon="information" />}
        />
      </List.Section>

    </ScrollView>
    {/* </View> */}
      </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // backgroundColor: colo.colors.background 
    // backgroundColor: "#fff",
  },
});
