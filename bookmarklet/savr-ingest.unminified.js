(async function() {

  // NOTE: to turn this into a bookmarklet, use this since it handles comments well:
  //   https://js.do/blog/bookmarklets/

  const savrApp = 'http://localhost:8081';

  var savrWindow = window.open(savrApp, '_blank');

  if (!savrWindow) {
    alert('Could not open SAVR PWA window. Please allow pop-ups for this site.');
    return;
  }

  var currentPageUrl = window.location.href;
  // var currentPageHtml = document.documentElement.outerHTML;

  /* remove javascript */
  const docClone = document.documentElement.cloneNode(true);
  const scripts = docClone.querySelectorAll('script');
  scripts.forEach(s => s.parentNode && s.parentNode.removeChild(s));
  const allElements = docClone.querySelectorAll('*');
  const eventAttrs = [
    'onabort','onafterprint','onbeforeprint','onbeforeunload','onblur','oncancel','oncanplay',
    'oncanplaythrough','onchange','onclick','onclose','oncontextmenu','oncopy','oncuechange',
    'oncut','ondblclick','ondrag','ondragend','ondragenter','ondragexit','ondragleave','ondragover',
    'ondragstart','ondrop','ondurationchange','onemptied','onended','onerror','onfocus','onhashchange',
    'oninput','oninvalid','onkeydown','onkeypress','onkeyup','onload','onloadeddata','onloadedmetadata',
    'onloadstart','onmessage','onmousedown','onmouseenter','onmouseleave','onmousemove','onmouseout',
    'onmouseover','onmouseup','onoffline','ononline','onopen','onpagehide','onpageshow','onpaste',
    'onpause','onplay','onplaying','onpopstate','onprogress','onratechange','onreset','onresize',
    'onscroll','onsearch','onseeked','onseeking','onselect','onshow','onstalled','onstorage','onsubmit',
    'onsuspend','ontimeupdate','ontoggle','onunload','onvolumechange','onwaiting','onwheel'
  ];
  allElements.forEach(el => {
    eventAttrs.forEach(attr => el.removeAttribute(attr));
  });
  const links = Array.from(docClone.querySelectorAll('link[rel="stylesheet"]'));
  const cssContents = await Promise.all(links.map(link =>
    fetch(link.href)
      .then(resp => resp.ok ? resp.text() : '')
      .catch(() => '')
  ));
  const styleTag = docClone.ownerDocument.createElement('style');
  styleTag.textContent = cssContents.join('\n\n');
  if (links.length && links[0].parentNode) {
    links[0].parentNode.insertBefore(styleTag, links[0]);
  } else {
    const head = docClone.querySelector('head');
    head && head.appendChild(styleTag);
  }
  links.forEach(link => link.parentNode && link.parentNode.removeChild(link));
  const htmlString = '<!DOCTYPE html>\n' docClone.outerHTML;
  console.log(htmlString);

  var messageListener = function(event) {
    if (event.source === savrWindow && event.data && event.data.action === 'savr-ready') {
      window.removeEventListener('message', messageListener);

      savrWindow.postMessage({ url: currentPageUrl, html: htmlString }, '*');
    }
  };

  window.addEventListener('message', messageListener);

// Listen for resource requests from PWA and respond with Base64 data URLs
window.addEventListener('message', async function(event) {
  if (event.source === savrWindow && event.data && event.data.action === 'request-resources') {
   console.log('[bookmarklet] request-resources received:', event.data);
    const { messageId, urls } = event.data;
    const resources = await Promise.all(urls.map(async (url) => {
     console.log('[bookmarklet] processing url:', url);
      try {
       // Try using already loaded <img> in DOM
       let dataUrl: string;
       let mimeType = 'image/jpeg';

       const imgElem = document.querySelector(`img[src="${url}"]`) as HTMLImageElement | null;
       if (imgElem && imgElem.complete) {
         const canvas = document.createElement('canvas');
         canvas.width = imgElem.naturalWidth;
         canvas.height = imgElem.naturalHeight;
         const ctx = canvas.getContext('2d');
         ctx?.drawImage(imgElem, 0, 0);
         dataUrl = canvas.toDataURL();
         mimeType = dataUrl.split(';')[0].slice(5);

        // reverse lookup from mimeToExt

         console.log('[bookmarklet] extracted dataUrl from DOM image');
       } else {
         console.log('[bookmarklet] fetching via network:', url);
         const resp = await fetch(url);
         const blob = await resp.blob();
         mimeType = blob.type;
         dataUrl = await new Promise<string>((res) => {
           const reader = new FileReader();
           reader.onload = () => res(reader.result as string);
           reader.readAsDataURL(blob);
         });
       }
        return { url, data: dataUrl, type: mimeType, success: true };
      } catch (err) {
       console.error('[bookmarklet] error processing url:', url, err);
        return { url, error: err.message || String(err), success: false };
      }
    }));
    // Reply back to PWA
    savrWindow.postMessage(
      { source: 'SAVR_BOOKMARKLET', action: 'resource-response', messageId, resources },
      '*'
    );
  }
});
})();
