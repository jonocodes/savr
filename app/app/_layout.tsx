// import { ThemeProvider } from "@react-navigation/native";

import { ThemeProvider } from "styled-components/native";
import { useFonts } from "expo-font";
import { Button, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/useColorScheme";
import { DirectoryProvider } from "@/components/DirectoryProvider";
import {
  PaperProvider,
  useTheme,
  MD3LightTheme as LightTheme,
  MD3DarkTheme as DarkTheme,
  Text,
  Appbar,
  // DefaultTheme as PaperLightTheme,
  // DarkTheme as PaperDarkTheme,
} from "react-native-paper";
import { SnackbarProvider } from "@/components/SnackbarProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadColorScheme } from "./tools";

import { getHeaderTitle } from "@react-navigation/elements";

import { NavigationProp, useNavigation } from "@react-navigation/native";

import { NavigationContainer } from "@react-navigation/native";
// import { createStackNavigator } from '@react-navigation/stack';

// const Stack = createStackNavigator();

// import { getTheme } from "react-native-paper/lib/typescript/core/theming";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// import React from 'react';

interface CustomNavigationBarProps {
  navigation: NavigationProp<any>;
  route: { name: string };
  options: any;
  back?: boolean;
}

export function CustomNavigationBar({
  navigation,
  route,
  options,
  back,
}: CustomNavigationBarProps) {
  const title = getHeaderTitle(options, route.name);

  return (
    <Appbar.Header>
      {back ? <Appbar.BackAction onPress={navigation.goBack} /> : null}
      <Appbar.Content title={title} />
    </Appbar.Header>
  );
}

export default function RootLayout() {
  // const colorScheme = useColorScheme();

  const theme = useTheme();

  const navigation = useNavigation(); // Hook for navigation control

  console.log("theme", theme);

  const systemColorScheme = useColorScheme(); // Get the system's color scheme
  // const [isDarkMode, setIsDarkMode] = useState(systemColorScheme === "dark");

  // const toggleTheme = () => setIsDarkMode((prev) => !prev);

  const [colorScheme, setColorScheme] = useState(
    systemColorScheme === "dark" ? DarkTheme : LightTheme
  );

  const [canGoBack, setCanGoBack] = useState(false);

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
          {/* <Appbar.Header theme={colorScheme}>
            {navigation.canGoBack() && <Appbar.BackAction onPress={() => navigation.goBack()} />}

            <Appbar.BackAction onPress={() => navigation.goBack()} />

            <Appbar.Content title="My App" />
            <Appbar.Action icon="cog" />
            <Appbar.Action icon="information" />
          </Appbar.Header> */}

          {/* <ThemeProvider theme={colorScheme.colors}> */}
          <Stack  screenOptions={{ headerShown: false }}>
            <Stack.Screen name="article/[slug]" />
            <Stack.Screen name="preferences"  />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="auto" />
          {/* </ThemeProvider> */}
        </SnackbarProvider>
      </PaperProvider>
    </DirectoryProvider>
  );
}

// Customize the header options
RootLayout.options = {
  title: "Home",
  headerRight: () => (
    <View style={{ flexDirection: "row", gap: 8, paddingRight: 10 }}>
      <Button title="Settings" onPress={() => alert("Settings")} />
      <Button title="Info" onPress={() => alert("Info")} />
    </View>
  ),
};

export const globalStyles = StyleSheet.create({
  container: {
    flex: 1,
    // color: "inherit",
    // backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    padding: 8,
  },

  tooltipWrapper: {
    position: "relative", // Ensures Tooltip is rendered correctly in this context
    // zIndex: 10, // Raises Tooltip above other UI elements
  },

  tooltip: {
    zIndex: 1000, // Ensures Tooltip overlays properly
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
