# Savr

Savr is an app for saving online content to read later. It is [file-centric, offline first, future proof](#offline-use), and [favors decentralization](#how-to-use-it). Read about the design and motivation in the [FAQ](#faq).

When reading an article in a browser, share it to Savr. Then open Savr later to read it. For the most part, Savr is a free, hosted or self hosted, progressive web app. You can also install it on your phone for offline use.

# Features

- Save articles for reading later
- Remove distractions like advertisements
- Read content and images without an internet connection
- No dependency on a service/company to do the scraping or storage
- Authorization and cross device synchronization optional (using your Dropbox or Google Drive)
- Open source, cross platform (mobile and desktop/web)
- Use the free hosted version, or self host it
- Non-proprietary since it integrates with any browser and does not need specific extensions installed (see bookmarklet)

# Comparison

| Feature                          | Savr        | Pocket 2024 (pre shutdown) | Omnivore | Wallabag | Shiori |
| -------------------------------- | ----------- | -------------------------- | -------- | -------- | ------ |
| Open Source                      | ☑️          | 🔴                         | ☑️       | ☑️       | ☑️     |
| Requires minimal tech knowledge  | ☑️          | ☑️                         | 🔴       | 🔴       | 🔴     |
| Own/Control Your Data            | ☑️          | 🔴                         | ☑️       | ☑️       | ☑️     |
| Offline content including images | ☑️          | sometimes cached           | 🔴       | 🔴       | 🔴     |
| Tagging and search               | 🔴          | ☑️                         | ☑️       | ☑️       | ☑️     |
| Other Content Types              | in progress | 🔴                         | ☑️       | ☑️       | 🔴     |
| Offline mobile                   | ☑️          | sometimes                  | ☑️       | ☑️       | 🔴     |
| Cross Platform (+mobile/browser) | ☑️          | ☑️                         | ☑️       | ☑️       | ☑️     |
| Cross Browser Extension          | ☑️          | 🔴 (chrome/FF)             | 🔴       | 🔴       | 🔴     |
| Does not require and account     | ☑️          | ☑️                         | ☑️       | ☑️       | ☑️     |

# Progress

- [x] offline content and image sync
- [x] browser bookmarklet
- [x] thumbnail generation
- [ ] pwa share action
- [ ] info edit - so you can fix a missing title
- [x] remember scroll position
- [ ] offline sync using remoteStorage.js
  - [x] 5apps
  - [x] dropbox
  - [ ] google drive
- [ ] advanced image handling
  - [ ] scrape lazy loaded images
  - [ ] discover uncommon tags (ie - srcset and background images)
  - [ ] allow for deferred image loading at view time
- [ ] multiline url imports
- [ ] additional document types (ie - markdown, plain text, pdf)
- [ ] media types (solo images, audio, video)
- [ ] content summarization
- [ ] import/export catalog

# How to "install" it

Savr is a PWA (progressive web app) which means it primarily runs in a browser, but it can also be "installed" as an app on your phone. There it will work offline like your other mobile apps.

https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing

# How to save articles

## In app

When on the main screen you can always click the '+' button and enter a URL.

## Bookmarklet

The bookmarklet is the recommended way to save when using a desktop browser. Once you install it, you can click its link when you are on a page you want to save.

(show screen shot of bookmarklet link)

You should also be able to use the bookmarklet in your mobile web browser if you want.

## Android (share to)

If you have "installed" the mobile app, you can send articles to it. Once you visit an article in a mobile browser you can use the browsers "share" button to send it to your installed Savr app.

## iOS

iOS does not allow for sharing to progressive web apps. So use one of the other methods mentioned above.

# Synchronization

If you want to read and save articles on multiple devices you can authorize your cloud service provider (typically Dropbox or Google), to sync your articles. This is optional, and if you don't want to sync you don't need to create any account to use Savr.

Note that you don't need to sync your articles to a cloud service for them to be available offline. They are automatically saved to your device either way.

# How it works

Savr is designed to work like a desktop app. It runs locally and minimizes the need for backend web services. This means that there is no Savr server that stores your info or content. It functions as a desktop app like your calculator or image editor in that you don't need to log in to use it. All content is on your device.

Savr runs entirely as a frontend app so if you want to self host you can use static hosting like github pages.

OK, I lied. You do need to use a CORS proxy server to help fetch new articles, but that is a generic service that has no knowledge of Savr.

(TODO: add more about architecture and article saving flow diagram)

[See this diagram](https://remotestorage.io/unhosted.html) showing how this type of architecture differs from traditional web apps.

# Current state of development

Basic features have been implemented, but I would consider this in a beta stage. While in the 0.x version number range, features will be stabilizing, along with the API contract and database schema.

# Mobile

![screenshot](./screenshots/screenshots.png)

# Development

This is a front end react app. Run like so:

> npm install
>
> npm run dev

Then visit https://localhost:3000

# Security

All content is stored locally on your device. Savr has no server side storage. This makes it so we don't need to host any data, and so it can more simply be hosted by you if you want.

This also make it such that there is no login or account creation to use Savr. If you decide to synchronize your data across devices you will need to bring a cloud service. But that authentication is brokered through your browser and does not go through Savr's servers. In the browser your are authenticating directly to the cloud provider only.

# Bookmarklet

<div align="center" width="100%">

![bookmarklet](./screenshots/bookmarklet.png)

</div>

# Offline Use

The Savr apps do not need an internet connection to read content, since it has all been downloaded. Additionally you don't even need the app to read the articles since the HTML archive is self contained.

</div>

Of course you wont be able to modify your collection when the app is not running. Have a look at your data directory. It is simply organized so you can copy out single articles if needed.

# FAQ

## Why another read-it-later app?

TODO: refer to https://0data.app/, https://unhosted.org/ and https://lofi.so/ apps, as concepts.

I consider myself a self-hosting enthusiast, who does not like to self-host :smile:. I love open source and open formats, but I don't think every single purpose app should require a custom backend for it.

After using Pocket for 10+ years I decided it was time to take control of my own content collection. But why does Pocket need a special backend? Yes, it helps scrape the articles, but for the most part its just an API that handles authorization and storing content. Moving the scraping into the mobile app makes the backend no longer necessary.

Good examples of apps that work well with filesystems and open data formats are [Obsidian](https://obsidian.md/) (for notes) and [Keepass](https://keepass.info/) (for passwords). You can run them on mobile, or desktop. All the functionality is in the app and a server is not required.

Of course you can bring in a sync service if you want, but its up to you how you want to store things. Syncing would happen outside the app, which adds flexibility. My preference is to use Syncthing which provides a decentralized solution to sync data across my devices/machines.

Generally, **I would like more apps that exist in this space**. Like:
calendar, contacts, [bookmark manager](https://github.com/sissbruecker/linkding), [inventory](https://inventree.org/), [physical document management](https://docs.paperless-ngx.com/), and yes - another todo app.

## Why not use an existing open source project?

There are some great projects like [Wallabag](https://wallabag.org/) and [Omnivore](https://github.com/omnivore-app/omnivore), but they require centralized hosting. Doing away with the server lets you not have to worry about:

- security
- certificates
- passwords
- redundancy
- uptime
- firewalls
- DNS
- authorization
- all the other things that come with system administration

## What is CORS

CORS (Cross-Origin Resource Sharing) is a security feature implemented by web browsers that prevents websites from making requests to different domains. This is a security measure to protect users from malicious websites that might try to access data from other sites.

**Why does Savr need it?**
When you save an article, Savr needs to fetch the content from the original website. However, due to CORS restrictions, many websites tell thew browser they want content blocked if loaded from a different domain. This often prevents Savr from fetching content and images.

**How does Savr solve this?**
Savr uses a CORS proxy server that acts as a middleman. Instead of your browser directly requesting content from the original website, it requests it through the proxy server, which then fetches the content and sends it back to Savr.

**Why bring your own proxy?**
While Savr provides a default proxy, you can configure your own CORS proxy server for:

- **Better reliability**: Public proxies can be unstable or go down
- **Faster performance**: Your own proxy is typically faster than shared public ones
- **More control**: You can configure it exactly how you need it
- **Privacy**: Your requests aren't going through a third-party service

You can learn more about CORS on [Wikipedia](https://en.wikipedia.org/wiki/Cross-origin_resource_sharing).

## What is a PWA

A PWA (Progressive Web App) is a web application that can be installed on your device like a native app. PWAs work offline, can send notifications, and provide an app-like experience while running in your browser. You can "install" them from your browser's menu, and they'll appear in your app launcher alongside other apps.

Learn more about PWAs on [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps).

## What is a bookmarklet

A bookmarklet is a small piece of JavaScript code stored as a bookmark in your browser. When you click on it, it runs the JavaScript code on the current page. In Savr's case, the bookmarklet extracts the current page's URL and opens Savr with that URL ready to be saved.

Bookmarklets work across all browsers and don't require any extensions or special permissions. They're a simple, lightweight way to add functionality to any website.

Learn more about bookmarklets on [Wikipedia](https://en.wikipedia.org/wiki/Bookmarklet).
