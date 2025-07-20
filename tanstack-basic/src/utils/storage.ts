// import { openDB } from "idb";
import RemoteStorage from "remotestoragejs";
import BaseClient from "remotestoragejs/release/types/baseclient";
import { minimatch } from "minimatch";
import { db } from "./db";
import { Article } from "../../../lib/src/models";
import extensionConnector from "./extensionConnector"; // Import the extension connector
import { environmentConfig } from "~/config/environment";

declare global {
  interface Window {
    extensionConnector: typeof extensionConnector;
  }
}

let store;

function init() {
  if (!store) {
    const setup = async () => {
      const remoteStorage = await initRemote();

      const client = remoteStorage.scope("/savr/");

      return { remoteStorage, client };
    };
    return setup();
  }
  return store;
}

let remotePrms;

async function recursiveList(client: BaseClient, path = ""): Promise<string[]> {
  const listing = await client.getListing(path);
  let files: string[] = [];
  for (const [name, isFolder] of Object.entries(listing as Record<string, boolean>)) {
    // Type assertion here
    if (name.endsWith("/")) {
      // Recursively list subfolder
      const subFiles = await recursiveList(client, path + name);
      files = files.concat(subFiles);
    } else {
      files.push(path + name);
    }
  }
  return files;
}

async function glob(client: BaseClient, pattern: string, basePath = ""): Promise<string[]> {
  const allFiles = await recursiveList(client, basePath);
  return allFiles.filter((filePath: string) => minimatch(filePath, pattern));
}

function initRemote() {
  remotePrms = new Promise<RemoteStorage>((resolve) => {
    const remoteStorage = new RemoteStorage({
      logging: true,
      // cache: false
      //   modules: ["sync"],
    });
    remoteStorage.setApiKeys({
      googledrive: environmentConfig.apiKeys.googleDrive,
      dropbox: environmentConfig.apiKeys.dropbox,
    });
    remoteStorage.access.claim("savr", "rw");

    const client = remoteStorage.scope("/savr/");

    remoteStorage.caching.enable("/savr/");

    remoteStorage.on("ready", function () {
      console.info("remoteStorage ready");
      resolve(remoteStorage);

      // Initialize the extension connector when remote storage is ready
      if (typeof window !== "undefined") {
        window.extensionConnector = extensionConnector;
        console.log("SAVR PWA: ExtensionConnector initialized and available globally");
      }

      //   remoteStorage.documents.subscribe(changeHandler);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`remoteStorage connected to “${userAddress}”`);

      client.getListing("").then((listing) => console.log(listing));

      console.log("creating db");

      const files = await recursiveList(client, "");

      console.log(files);

      const matches = await glob(client, "saves/*/article.json");

      console.log("Matched files:", matches);

      for (const path of matches) {
        console.log(path);

        const file = (await client.getFile(path)) as { data: string }; // Type assertion here

        const article: Article = JSON.parse(file.data);

        // put => upsert
        const ins = await db.articles.put(article);
      }
    });

    remoteStorage.on("not-connected", function () {
      console.info("remoteStorage not-connected (anonymous mode)");
    });

    remoteStorage.on("disconnected", function () {
      console.info("remoteStorage disconnected", arguments);
    });

    let lastNotificationTime = 0;
    let lastSyncErrTime = 0;
    const INITIAL_NOTIFICATION_TIMEOUT = 60_000;
    let notificationTimeout = INITIAL_NOTIFICATION_TIMEOUT;
    const TEN_MINUTES = 10 * 60 * 1000;

    remoteStorage.on("error", function (err) {
      console.error(`unforeseen remoteStorage error:`, err);

      //   if ('Unauthorized' === err?.name) { return; }
      //   if ("SyncError" === err?.name) {
      //     const timeDiff = Date.now() - lastNotificationTime + 8000;
      //     if (timeDiff > notificationTimeout) {
      //       transientMsg(extractUserMessage(err), 'warning');
      //       lastNotificationTime = Date.now();

      //       if (Date.now() - lastSyncErrTime > TEN_MINUTES) {
      //         notificationTimeout = INITIAL_NOTIFICATION_TIMEOUT;
      //       } else {
      //         notificationTimeout = Math.min(notificationTimeout * 2, TEN_MINUTES);
      //       }
      //     }
      //     lastSyncErrTime = Date.now();
      //   } else {
      //     console.error(`unforeseen remoteStorage error:`, err);
      //     transientMsg(extractUserMessage(err));
      //   }
    });

    remoteStorage.on("network-offline", () => {
      console.debug(`remoteStorage offline now.`);
    });

    remoteStorage.on("network-online", () => {
      console.debug(`remoteStorage back online.`);
    });
  });

  return remotePrms;
}

// const isBusy = new Map();   // per-ID
// const queue  = new Map();   // queue of length one per ID

// /**
//  * Inserts or updates a note in IDB and (if needed) RemoteStorage.
//  * @param {NodeNote} nodeNote should have been created by NodeNote constructor
//  * @param {string} initiator
//  * @returns {Promise<NodeNote|SerializedNote>} NodeNote if busy, SerializedNote if not
//  */
// async function upsertNote(nodeNote, initiator) {
//   const id = nodeNote.id;
//   queue.set(id, {note: NodeNote.clone(nodeNote), initiator});   // when busy, overwrites any previous value
//   return await storeQueued(id);   // return expected to be serialized note
// }

export { init, glob };
