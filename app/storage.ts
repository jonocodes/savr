// storage.js - abstraction for for RemoteStorage and IndexedDB for Notes Together
// Copyright © 2021–2024 Doug Reeder

import RemoteStorage from "remotestoragejs";

let store;
let initPrms;
let isFirstLaunch;
let persistenceAttempted = false;

function init() {
  if (!store) {
    const setup = async () => {
      const remoteStorage = await initRemote();

      // const client = remoteStorage.scope("/foo/");

      const client = remoteStorage.scope("/savr/");

      //   client.getListing("").then((listing) => console.log(listing));

      //   const content = "<h1>The most simple things</h1>";
      //   client
      //     .storeFile("text/html", "bar.html", content)
      //     .then(() => console.log("data has been saved"));

      return {remoteStorage, client};
    };
    return setup();
  }
  return store;
}

let remotePrms;

function initRemote() {
  remotePrms = new Promise<RemoteStorage>((resolve) => {
    const remoteStorage = new RemoteStorage({
      logging: true,
      // cache: false
      //   modules: ["sync"],
    });
    remoteStorage.setApiKeys({
      //   googledrive: "?????1058o7k4p0f5rvuv2.apps.googleusercontent.com",
      dropbox: "c53glfgceos23cj",
    });
    remoteStorage.access.claim("savr", "rw");

    const client = remoteStorage.scope("/savr/");

    remoteStorage.caching.enable("/savr/");

    // client
    //   .storeFile(
    //     "application/json",
    //     "john-doe2.json",
    //     JSON.stringify({
    //       firstName: "John",
    //       lastName: "Doe",
    //     })
    //   )
    //   .then(() => {
    //     console.log("Contact saved successfully!");
    //   })
    //   .catch((error) => {
    //     console.error("Error saving contact:", error);
    //   });

    // contacts.getFile('john-doe.json').then(file => {
    //   const contact = JSON.parse(file.data);
    //   console.log('Retrieved contact:', contact);
    // }).catch(error => {
    //   console.error('Error retrieving contact:', error);
    // });
    //   });

    // const client = remoteStorage.scope("/foo/");

    // List all items in the "foo/" category/folder
    client.getListing("").then((listing) => console.log(listing));

    const content = "<h1>The most simple things</h1>";
    client
      .storeFile("text/html", "the-google-willow-thing/index.html", content)
      .then(() => console.log("data has been saved"));

    remoteStorage.on("ready", function () {
      console.info("remoteStorage ready");
      resolve(remoteStorage);

      //   remoteStorage.documents.subscribe(changeHandler);
    });

    remoteStorage.on("connected", async () => {
      const userAddress = remoteStorage.remote.userAddress;
      console.info(`remoteStorage connected to “${userAddress}”`);
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

export { init };
