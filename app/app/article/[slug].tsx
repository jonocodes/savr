import React, { useContext, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams } from 'expo-router';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import { DirectoryContext } from '../../components/DirectoryProvider.tsx';
// import {
//   StorageAccessFramework as SAF
// } from "expo-file-system";
import { generateFileManager } from '../tools.ts';

const htmlSample = `
<div id='article'>
        <h1>Hello World!</h1>
        <p>This is a paragraph of text.</p>
        <img src="https://react-native-async-storage.github.io/async-storage/img/logo.svg" alt="Placeholder" />
</div>
`

// let FM : FileManager | null | undefined = null

export default function ArticleScreen() {

  const { slug } = useLocalSearchParams();

  // const { directoryUri, permissions } = useContext(DirectoryContext);

  const [html, setHtml] = useState("");

  // const [fileManager, setFileManager] = useState<FileManager|null|undefined>(null);

  useEffect(() => {

    console.log(`Platform: ${Platform.OS}`);

    const fetchDir = async () => {
      try {
        const fm = await generateFileManager();
        // setFileManager(fm)

        if (!fm) {
          console.error('FileManager not defined');
          return;
        }
    
        fm.readFile(`saves/${slug}/index.html`).then((data) => { 
          setHtml(data);
    
        }).catch((error) => {
          console.error(error);  
        })

      } catch (e) {
        // error reading value
        console.error(e);
      }
    };

    fetchDir()

  }, []);

  return (
    <>
    <Text>
      Slug: {slug}
    </Text>

    {Platform.OS === 'web' ? (
      <ScrollView>
      <div
          style={{ flex: 1 }}
          dangerouslySetInnerHTML={{ __html: html }}
        /> </ScrollView>
      ):
      <WebView
        originWhitelist={['*']}
        source={{ html: html }}
      />}

    </>
  );
}
