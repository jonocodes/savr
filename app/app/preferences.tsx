import React, { useEffect, useState } from "react";
import { StyleSheet, ScrollView, Platform } from "react-native";

import {
  List,
  Text,
  PaperProvider,
  // MD3LightTheme, //as LightTheme,
  // MD3DarkTheme, //as DarkTheme,
  Appbar,
  TextInput,
  // DefaultTheme as PaperLightTheme,
  // DarkTheme as PaperDarkTheme,
} from "react-native-paper";


import { DarkTheme, getDir, LightTheme, useMyStore, useThemeStore } from "@/app/tools";

import { version } from "../package.json" with { type: "json" };
import { router } from "expo-router";
// import { DarkTheme, DefaultTheme } from "@react-navigation/native";

export default function PreferencesScreen() {
  // const [dir, setDir] = React.useState<string | null>(null);

    const theme = useThemeStore((state)=>state.theme)
    const setTheme = useThemeStore((state)=>state.setTheme)

    const corsProxy = useMyStore((state) => state.corsProxy);

    const setCorsProxy = useMyStore((state) => state.setCorsProxy);


  // const currentTheme = useMyStore((state) => state.colorScheme);

  // const toggleTheme = useMyStore((state) => state.toggleTheme);


  useEffect(() => {
    const setup = async () => {
      try {
        // setDir(await getDir(Platform.OS));
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

  // const storeDir = async (value: string) => {
  //   try {
  //     await AsyncStorage.setItem("data-directory", value);
  //   } catch (e) {
  //     console.error(e);
  //     // saving error
  //   }
  // };

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
        <List.Subheader>Fetching content</List.Subheader>

      <List.Item
          title="Bookmarklet"
          description={
            "drag this link to your bookmarks bar ->"
          }
          left={(props) => <List.Icon {...props} icon="bookmark-plus-outline" />}

          right={() => (
            <a href="javascript:(function()%7B(async%20function()%20%7Bvar%20savrWindow%20%3D%20window.open('http%3A%2F%2Flocalhost%3A8081'%2C%20'_blank')%3Bif%20(!savrWindow)%20%7Balert('Could%20not%20open%20SAVR%20PWA%20window.%20Please%20allow%20pop-ups%20for%20this%20site.')%3Breturn%3B%7Dvar%20currentPageUrl%20%3D%20window.location.href%3Bvar%20currentPageHtml%20%3D%20document.documentElement.outerHTML%3Bconst%20docClone%20%3D%20document.documentElement.cloneNode(true)%3Bconst%20scripts%20%3D%20docClone.querySelectorAll('script')%3Bscripts.forEach(s%20%3D%3E%20s.parentNode%20%26%26%20s.parentNode.removeChild(s))%3Bconst%20allElements%20%3D%20docClone.querySelectorAll('*')%3Bconst%20eventAttrs%20%3D%20%5B'onabort'%2C'onafterprint'%2C'onbeforeprint'%2C'onbeforeunload'%2C'onblur'%2C'oncancel'%2C'oncanplay'%2C'oncanplaythrough'%2C'onchange'%2C'onclick'%2C'onclose'%2C'oncontextmenu'%2C'oncopy'%2C'oncuechange'%2C'oncut'%2C'ondblclick'%2C'ondrag'%2C'ondragend'%2C'ondragenter'%2C'ondragexit'%2C'ondragleave'%2C'ondragover'%2C'ondragstart'%2C'ondrop'%2C'ondurationchange'%2C'onemptied'%2C'onended'%2C'onerror'%2C'onfocus'%2C'onhashchange'%2C'oninput'%2C'oninvalid'%2C'onkeydown'%2C'onkeypress'%2C'onkeyup'%2C'onload'%2C'onloadeddata'%2C'onloadedmetadata'%2C'onloadstart'%2C'onmessage'%2C'onmousedown'%2C'onmouseenter'%2C'onmouseleave'%2C'onmousemove'%2C'onmouseout'%2C'onmouseover'%2C'onmouseup'%2C'onoffline'%2C'ononline'%2C'onopen'%2C'onpagehide'%2C'onpageshow'%2C'onpaste'%2C'onpause'%2C'onplay'%2C'onplaying'%2C'onpopstate'%2C'onprogress'%2C'onratechange'%2C'onreset'%2C'onresize'%2C'onscroll'%2C'onsearch'%2C'onseeked'%2C'onseeking'%2C'onselect'%2C'onshow'%2C'onstalled'%2C'onstorage'%2C'onsubmit'%2C'onsuspend'%2C'ontimeupdate'%2C'ontoggle'%2C'onunload'%2C'onvolumechange'%2C'onwaiting'%2C'onwheel'%5D%3BallElements.forEach(el%20%3D%3E%20%7BeventAttrs.forEach(attr%20%3D%3E%20el.removeAttribute(attr))%3B%7D)%3Bconst%20links%20%3D%20Array.from(docClone.querySelectorAll('link%5Brel%3D%22stylesheet%22%5D'))%3Bconst%20cssContents%20%3D%20await%20Promise.all(links.map(link%20%3D%3Efetch(link.href).then(resp%20%3D%3E%20resp.ok%20%3F%20resp.text()%20%3A%20'').catch(()%20%3D%3E%20'')))%3Bconst%20styleTag%20%3D%20docClone.ownerDocument.createElement('style')%3BstyleTag.textContent%20%3D%20cssContents.join('%5Cn%5Cn')%3Bif%20(links.length%20%26%26%20links%5B0%5D.parentNode)%20%7Blinks%5B0%5D.parentNode.insertBefore(styleTag%2C%20links%5B0%5D)%3B%7D%20else%20%7Bconst%20head%20%3D%20docClone.querySelector('head')%3Bhead%20%26%26%20head.appendChild(styleTag)%3B%7Dlinks.forEach(link%20%3D%3E%20link.parentNode%20%26%26%20link.parentNode.removeChild(link))%3Bconst%20htmlString%20%3D%20'%3C!DOCTYPE%20html%3E%5Cn'%20%2B%20docClone.outerHTML%3Bconsole.log(htmlString)%3Bvar%20messageListener%20%3D%20function(event)%20%7Bif%20(event.source%20%3D%3D%3D%20savrWindow%20%26%26%20event.data%20%26%26%20event.data.action%20%3D%3D%3D%20'savr-ready')%20%7Bwindow.removeEventListener('message'%2C%20messageListener)%3BsavrWindow.postMessage(%7B%20url%3A%20currentPageUrl%2C%20html%3A%20htmlString%20%7D%2C%20'*')%3B%7D%7D%3Bwindow.addEventListener('message'%2C%20messageListener)%3B%7D)()%7D)()">savr save</a>
          )}

        />


<List.Item
          title="CORS Proxy"
          description={
            corsProxy
          }
          left={(props) => <List.Icon {...props} icon="web-plus" />}

          right={() => (
            <TextInput
              value={corsProxy}
              onChangeText={setCorsProxy}
              placeholder="https://"
              // style={styles.input}
              // mode="outlined"
              // dense
              // underlineColor="transparent"
              // theme={{ roundness: 8 }}
            />
          )}

        />



      </List.Section>
      

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
