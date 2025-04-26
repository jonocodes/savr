(function() {
  var savrWindow = window.open('http://localhost:8081', '_blank');

  if (!savrWindow) {
    alert('Could not open SAVR PWA window. Please allow pop-ups for this site.');
    return;
  }

  var currentPageUrl = window.location.href;
  var currentPageHtml = document.documentElement.outerHTML;

  var messageListener = function(event) {
    if (event.source === savrWindow && event.data && event.data.action === 'savr-ready') {
      window.removeEventListener('message', messageListener);

      console.log('SAVR PWA is ready. Sending current page data...');

      savrWindow.postMessage({ url: currentPageUrl, html: currentPageHtml }, '*');
    }
  };

  window.addEventListener('message', messageListener);
})();