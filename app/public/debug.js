// Debug script to inspect deployed directory
// Access this at: https://mysite.pages.dev/debug.js

console.log('Debug script loaded');
console.log('Current location:', window.location.href);
console.log('Origin:', window.location.origin);

// Test if bookmarklet-client.js is accessible
fetch('/bookmarklet-client.js')
  .then(response => {
    console.log('bookmarklet-client.js status:', response.status);
    console.log('bookmarklet-client.js headers:', response.headers);
    return response.text();
  })
  .then(text => {
    console.log('bookmarklet-client.js content length:', text.length);
    console.log('First 100 chars:', text.substring(0, 100));
  })
  .catch(error => {
    console.error('Error fetching bookmarklet-client.js:', error);
  });

// Test other common files
['index.html', 'metadata.json', 'manifest.json', 'sw.js', 'pwa-register.js', 'offline.html'].forEach(file => {
  fetch('/' + file)
    .then(response => {
      console.log(`${file} status:`, response.status);
    })
    .catch(error => {
      console.error(`Error fetching ${file}:`, error);
    });
});

// Test PWA features
console.log('PWA Features Test:');
console.log('Service Worker supported:', 'serviceWorker' in navigator);
console.log('Push Manager supported:', 'PushManager' in window);
console.log('Notification supported:', 'Notification' in window);
console.log('Install prompt supported:', 'beforeinstallprompt' in window); 