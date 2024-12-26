import { useFonts } from "expo-font";
import { Button, Platform, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { DirectoryProvider } from "@/components/DirectoryProvider";
import {
  PaperProvider,
  // MD3LightTheme as LightTheme,
  // MD3DarkTheme as DarkTheme,
} from "react-native-paper";
import { SnackbarProvider } from "@/components/SnackbarProvider";
import { generateFileManager, loadColorScheme, useMyStore } from "./tools";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  
  const currentTheme = useMyStore((state) => state.colorScheme);

  const setColorScheme = useMyStore((state) => state.setColorScheme);

  // const fileManager = useMyStore((state) => state.fileManager);

  const setFileManager = useMyStore((state) => state.setFileManager);

  // const dbManager = useMyStore((state) => state.dbManager);

  const setDbManager = useMyStore((state) => state.setDbManager);

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }

    const setup = async () => {

      setColorScheme(await loadColorScheme());

      const fm = await generateFileManager(Platform.OS);

      if (fm) {
        const dbManager = fm.generateJsonDbManager();
        setFileManager(fm);
        setDbManager(dbManager);
      }
    };

    setup();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <DirectoryProvider>
      <PaperProvider theme={currentTheme}>
        <SnackbarProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="article/[slug]" />
            <Stack.Screen name="preferences" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
        </SnackbarProvider>
      </PaperProvider>
    </DirectoryProvider>
  );
}

// Customize the header options
// RootLayout.options = {
//   title: "Home",
//   headerRight: () => (
//     <View style={{ flexDirection: "row", gap: 8, paddingRight: 10 }}>
//       <Button title="Settings" onPress={() => alert("Settings")} />
//       <Button title="Info" onPress={() => alert("Info")} />
//     </View>
//   ),
// };

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
  },

  // tooltipWrapper: {
  //   position: "relative", // Ensures Tooltip is rendered correctly in this context
  //   // zIndex: 10, // Raises Tooltip above other UI elements
  // },

  // tooltip: {
  //   zIndex: 1000, // Ensures Tooltip overlays properly
  // },
});
