import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { useFonts } from "expo-font";
import { StyleSheet } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { DirectoryProvider } from "@/components/DirectoryProvider";
import { PaperProvider, useTheme } from "react-native-paper";
import { SnackbarProvider } from "@/components/SnackbarProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadColorScheme } from "./tools";
// import { getTheme } from "react-native-paper/lib/typescript/core/theming";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // const colorScheme = useColorScheme();

  const theme = useTheme();

  console.log("theme", theme);

  const systemColorScheme = useColorScheme(); // Get the system's color scheme
  // const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  // const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const [colorScheme, setColorScheme] = useState(
    systemColorScheme === "dark" ? DarkTheme : DefaultTheme
  );

  // const theme = isDarkMode ? darkTheme : lightTheme;

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  // PaperProvider.getTheme
  // const th = getTheme();
  // console.log("getTheme", th);

  // const readTheme = async () => {
  //   try {
  //     return await AsyncStorage.getItem("color-scheme");
  //   } catch (e) {
  //     console.error(e);
  //     // saving error
  //   }
  // };

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }

    const setup = async () => {
      setColorScheme(await loadColorScheme());

      // try {
      //   const color = await AsyncStorage.getItem("color-scheme");

      //   const theme = color === "dark" ? DarkTheme : DefaultTheme;

      //   console.log("color", color);

      //   setColorScheme(theme);
      // } catch (error) {
      //   console.error(error);
      // }
    };

    setup();
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <DirectoryProvider>
      <PaperProvider theme={colorScheme}>
        <SnackbarProvider>
          <ThemeProvider value={colorScheme}>
            <Stack style={colorScheme}>
              <Stack.Screen name="article/[slug]" />
              <Stack.Screen name="preferences" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <StatusBar style="auto" />
          </ThemeProvider>
        </SnackbarProvider>
      </PaperProvider>
    </DirectoryProvider>
  );
}

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    color: "inherit",
    // backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
  },
  // htmtTextDark: {
  //   color: DarkTheme.colors.text,
  // },
  // list: {
  //   flex: 1,
  // },
  // fab: {
  //   position: "absolute",
  //   margin: 16,
  //   right: 0,
  //   bottom: 0,
  // },
});
