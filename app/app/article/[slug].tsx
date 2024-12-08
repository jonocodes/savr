import React, { useContext, useEffect, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLocalSearchParams } from 'expo-router';
import { generateFileManager } from '../tools';


export default function ArticleScreen() {

  const { slug } = useLocalSearchParams();

  if (typeof slug !== 'string') {
    throw new Error('Slug is not a string');
  }

  const [html, setHtml] = useState("");

  // const [fileManager, setFileManager] = useState<FileManager|null|undefined>(null);

  useEffect(() => {

    console.log(`Platform: ${Platform.OS}`);

    const fetchDir = async () => {
      try {
        const fm = await generateFileManager(Platform.OS);
        // setFileManager(fm)

        if (!fm) {
          console.error('FileManager not defined');
          return;
        }

        const dbManager = fm.generateJsonDbManager()

        fm.readTextFile(`saves/${slug}/index.html`).then((data) => { 
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
