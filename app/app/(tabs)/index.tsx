import { Image, StyleSheet, Platform, Button, Linking, Text, FlatList, TouchableOpacity } from 'react-native';
// import DocumentPicker from 'react-native-document-picker';
// import { DocumentPickerOptions } from 'react-native-document-picker';

import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as fs from 'fs';
// import * as FileSystem from 'expo-file-system';
import {
  StorageAccessFramework as SAF
} from "expo-file-system";

// import { URI } from 'expo-uri';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useContext, useEffect, useState } from 'react';
import { Link } from 'expo-router';
// import { DirectoryContext } from '@/components/DirectoryProvider';

import { generateFileManager } from '@/app/tools';

export default function HomeScreen() {


  const [chosenDir, setChosenDir] = useState<string|null>(null);
  const [dirContents, setDirContents] = useState<string[]|null>(null);

  // const { setDirectoryUri, setPermissions } = useContext(DirectoryContext);


  useEffect(() => {

    console.log(`Platform: ${Platform.OS}`);

    if (Platform.OS === 'web') {
      const dataDir = process.env.EXPO_PUBLIC_DATA_DIR;
      const service = process.env.EXPO_PUBLIC_SAVR_SERVICE;

      console.log(`DATA_DIR: ${dataDir}`);
      console.log(`SAVR_SERVICE: ${service}`);

      if (service) {
        getContents();
      }

      // if (dataDir) {
      //   setChosenDir(dataDir);
      //   const getContents = async () => {
      //     try {
            
      //       // const contents = await fs.promises.readdir(dataDir);
      //       // setDirContents(contents.map((item) => (item )));
      //       const contents = await FileSystem.readDirectoryAsync(dataDir);

      //       setDirContents(contents);
      //     } catch (error) {
      //       console.error(error);
      //     }
      //   };
      //   getContents();
      // }
    }
  }, []);

  const getContents = async () => {

    if (!process.env.EXPO_PUBLIC_SAVR_SERVICE) {
      console.error('SAVR_SERVICE is not defined');
      return;
    }

    const fm = generateFileManager(Platform.OS);

    // const fm = new FileManager({
    //   directory: process.env.EXPO_PUBLIC_SAVR_SERVICE,})

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SAVR_SERVICE}db`);
      // const data = await response.json();
      // const slugs = data.map(item => item.slug);
      const data: Record<string, string>[] = await response.json();
      const slugs: string[] = data.map(item => item['slug']);

      // const data: object[] = await response.json();
      // const slugs: string[] = data.map(item => item.slug);

      setDirContents(slugs);
      // setDirContents(response);
    } catch (error) {
      console.error(error);
    }
  };

  // const extractSAFVolume = (uri: string) => {
  //   try {
  //     // SAF URIs typically look like: content://com.android.externalstorage.documents/tree/primary%3ADocuments
  //     const match = uri.match(/tree\/([^:%]*)/); // Extract the "primary" or volume part
  //     return match ? match[1] : null;
  //   } catch (error) {
  //     console.error('Error extracting volume:', error);
  //     return null;
  //   }
  // };

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
      return;
    }

    const permission = await SAF.requestDirectoryPermissionsAsync();
    if (permission.granted) {
      const dir = permission.directoryUri
      // setChosenDir(dir);
      // const dir = await SAF.pickDirectoryAsync();
      console.log(`SAF DIR CHOSEN: ${dir}`);

      try {

        // const dirContents = await SAF.readDirectoryAsync(dir);
        // console.log(`SAF DIR CONTENTS: ${dirContents}`);

        const volAndPath = dir.split(':')[1].split('/').at(-1)
        const saf_data_dir = `${dir}/document/${volAndPath}%2F`
        setChosenDir(saf_data_dir);

        storeDir(saf_data_dir);

        // setDirectoryUri(saf_data_dir);

        const uri = `${saf_data_dir}${encodeURIComponent('db.json')}`;

        console.log(`SAF URI: ${uri}`);
        const contents = await SAF.readAsStringAsync(uri);

        console.log(`SAF CONTENTS: ${contents}`);

        // const contents = await FileSystem.readAsStringAsync(`${dir}/db.json`);
        const data: Record<string, string>[] = JSON.parse(contents)['articles'];

        console.log(`SAF DATA: ${data[0]}`);
        const slugs: string[] = data.map(item => item['slug']);
        console.log(`SAF DIR CONTENTS: ${slugs}`);
        setDirContents(slugs);
      } catch (error) {
        console.error(error);
      }

      // const contents = await FileSystem.readAsStringAsync(`${dir}/db.json`);
      // const data: Record<string, string>[] = JSON.parse(contents);
      // const slugs: string[] = data.map(item => item['slug']);
      // console.log(`SAF DIR CONTENTS: ${slugs}`);
      // setDirContents(slugs);

    } else {
      console.log('SAF DIR Permission denied');
    }
  };
  // const handleChooseDir = async () => {
  //   const directory = await FileSystem.getInfoAsync('/');
  //   const files = await FileSystem.readDirectoryAsync(directory.uri);

  //   // Filter out files and show only directories
  //   const dirs = files.filter((file) => file.isDirectory);

  //   // Show the list of directories to the user
  //   // and let them select one

  //   // For example, you could use a modal or a bottom sheet to show the list of directories

  //   // When the user selects a directory, you can get its URI and do something with it
  //   const selectedDir = await FileSystem.getInfoAsync(dirs[0].uri);

  //   console.log(selectedDir.uri);
  // };


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
