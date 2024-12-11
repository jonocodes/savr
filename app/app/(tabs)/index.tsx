import { Image, StyleSheet, Platform, Button, Linking, Text, FlatList, TouchableOpacity, TextInput } from 'react-native';
// import DocumentPicker from 'react-native-document-picker';
// import { DocumentPickerOptions } from 'react-native-document-picker';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  StorageAccessFramework as SAF
} from "expo-file-system";


import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'expo-router';
// import { DirectoryContext } from '@/components/DirectoryProvider';

import { generateFileManager } from '@/app/tools';
import { FileManager, DbManager, ingestUrl } from '@savr/lib';

// import {
//   ingestUrl,
//   setState,
// } from "@savr/lib/ingestion";



export default function HomeScreen() {


  const [chosenDir, setChosenDir] = useState<string|null>(null);
  const [dirContents, setDirContents] = useState<string[]|null>(null);


  const [fileManager, setFileManager] = useState<FileManager|null>(null);

  const [dbManager, setDbManager] = useState<DbManager|null>(null);

  const [url, setUrl] = useState<string|null>("https://www.freecodecamp.org/news/javascript-typeof-how-to-check-the-type-of-a-variable-or-object-in-js/");


  useEffect(() => {

    const setManagers = async () => {
      try {
        const fm = await generateFileManager(Platform.OS);

        if (!fm) {  
          console.error('FileManager not defined');
          throw new Error('FileManager not defined');
        }
        const dbManager = fm.generateJsonDbManager();

        setFileManager(fm);
        setDbManager(dbManager);

        console.log(`Platform: ${Platform.OS}`);

        if (Platform.OS === 'web') {
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
      console.error('dbManager is null');
      throw new Error('dbManager is null');
    }

    const articles = await db.getArticles();

    try {
      const slugs: string[] = articles.map(item => item.slug);

      setDirContents(slugs);
    } catch (error) {
      console.error(error);
    }
  };

  const storeDir = async (value: string) => {
    try {
      await AsyncStorage.setItem('data-directory', value);
    } catch (e) {
      console.error(e);
      // saving error
    }
  };
  
  
  const handleChooseDir = async () => {

    if (Platform.OS === 'web') {
      return
    }

    const permission = await SAF.requestDirectoryPermissionsAsync();
    if (permission.granted) {
      const dir = permission.directoryUri

      console.log(`SAF DIR CHOSEN: ${dir}`);

      try {

        const volAndPath = dir.split(':')[1].split('/').at(-1)
        const saf_data_dir = `${dir}/document/${volAndPath}%2F`
        setChosenDir(saf_data_dir);

        await storeDir(saf_data_dir);

        const fm = await generateFileManager(Platform.OS);

        if (!fm) {  
          console.error('FileManager not defined');
          throw new Error('FileManager not defined');
        }
        const dbManager = fm.generateJsonDbManager();

        setFileManager(fm);
        setDbManager(dbManager);

        const articles = await dbManager.getArticles();

        const slugs: string[] = articles.map(item => item.slug);
  
        setDirContents(slugs);

        console.log(`SAF DIR CONTENTS: ${slugs}`);
        setDirContents(slugs);
      } catch (error) {
        console.error(error);
      }


    } else {
      console.log('SAF DIR Permission denied');
    }
  };


  const handleSubmitUrl = async () => {
    console.log(url);

    if (Platform.OS === 'web') {
      const response = await fetch(`${fileManager?.directory}save?url=${url}`);
    } else {
      if (dbManager !== null && url !== null) {
        await ingestUrl(dbManager, url, ()=>{
          console.log(`INGESTED URL ${url}`);
        });
      }
    }
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Welcome! Jono3</ThemedText>
        <HelloWave />
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Enter URL</ThemedText>
        <TextInput
          // style={styles.input}
          placeholder="Enter a URL"
          onChangeText={text => setUrl(text)}
          value={url || ""}
        />
        <Button title="Submit" onPress={handleSubmitUrl} />
      </ThemedView>


      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">Step 1: Try it</ThemedText>
        <ThemedText>
          Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
          Press{' '}
          <ThemedText type="defaultSemiBold">
            {Platform.select({
              ios: 'cmd + d',
              android: 'cmd + m',
              web: 'F12'
            })}
          </ThemedText>{' '}
          to open developer tools.
        </ThemedText>
      </ThemedView>
      
      {Platform.OS === 'android' && (
        <ThemedView style={styles.stepContainer}>
          <Button title="Choose Dir" onPress={handleChooseDir} />
        </ThemedView>
      )}

      <Text>Platform: {Platform.OS}</Text>
      {chosenDir ? (
        <Text>Chosen Directory: {chosenDir}</Text>
      ) : (
        <Text>No directory chosen</Text>
      )}
      {dirContents ? (
        <Text>Directory Contents:</Text>
      ) : <Text>No directory contents</Text>}
      {dirContents ? (
        dirContents.map((slug, index) => (
          <Link key={slug} href={`/article/${slug}`}>
          <Text>{slug}</Text>
        </Link>

          // <Text key={index}>{item}</Text>
        ))
      ) : null}
      {/* <Button title="Choose Directory" onPress={handleChooseDir} /> */}

    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
