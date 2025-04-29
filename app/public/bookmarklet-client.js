(async function() {

    // using the IIFE (Immediately Invoked Function Expression) pattern

    // the bookmarklet used will fetch and execute this code. so in effect this will be run on the article page being collected and communicate to the PWA


    // TODO: typescriptify this, and compile


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

    function findImageByAbsoluteUrl(url) {
      return Array.from(document.images).find(img => img.src === url);
    }
    
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
    const htmlString = '<!DOCTYPE html>\n' + docClone.outerHTML;
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
      const { messageId, slug, urls } = event.data;
      const resources = await Promise.all(urls.map(async (url) => {
      //  console.log(`[bookmarklet] (${slug}) processing url: ${url}`);
        try {
         // Try using already loaded <img> in DOM
         let dataUrl;
         let mimeType = 'image/jpeg';

        //  const imgElem = document.querySelector(`img[src="${url}"]`);
         const imgElem = findImageByAbsoluteUrl(url);

          // TODO: remove this. not used
          if (imgElem && imgElem.src.startsWith('data:')) {

            console.log('[bookmarklet] found base64 image in DOM. skipping');
            alert('weird skip')
            return;
          }

          console.log(`[bookmarklet] (${slug}) processing url: ${url}   ${imgElem}`);
  
         if (imgElem && imgElem.complete) {
           try {
             const canvas = document.createElement('canvas');
             canvas.width = imgElem.naturalWidth;
             canvas.height = imgElem.naturalHeight;
             const ctx = canvas.getContext('2d');
             ctx?.drawImage(imgElem, 0, 0);
             dataUrl = canvas.toDataURL();
             mimeType = dataUrl.split(';')[0].slice(5);
             console.log('[bookmarklet] extracted dataUrl from DOM image');
           } catch (e) {

            alert("error", e)
              
             console.warn('[bookmarklet] CORS canvas draw error, fallback to network fetch:', e);
             // Fallback to network fetch
             const resp = await fetch(url);
             const blob = await resp.blob();
             mimeType = blob.type;
             if (mimeType === 'image/svg+xml') {
               const svgText = await blob.text();
               dataUrl = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(svgText);
               console.log('[bookmarklet] inlined SVG');
             } else {
               dataUrl = await new Promise((res) => {
                 const reader = new FileReader();
                 reader.onload = () => res(reader.result);
                 reader.readAsDataURL(blob);
               });
             }
           }
         } else {
           console.log('[bookmarklet] fetching via network:', url);
           const resp = await fetch(url);
           const blob = await resp.blob();
           mimeType = blob.type;
           if (mimeType === 'image/svg+xml') {
             // Inline SVG to preserve vector data
             const svgText = await blob.text();
             dataUrl = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(svgText);
           } else {
             dataUrl = await new Promise((res) => {
               const reader = new FileReader();
               reader.onload = () => res(reader.result);
               reader.readAsDataURL(blob);
             });
           }
         }
          return { url, data: dataUrl, type: mimeType, success: true };
        } catch (err) {
          this.alert('error processing url', url, err);
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
  