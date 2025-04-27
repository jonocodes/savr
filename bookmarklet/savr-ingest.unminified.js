javascript:(async function() {
  const savrApp = 'http://localhost:8081';

  var savrWindow = window.open(savrApp, '_blank');

  if (!savrWindow) {
    alert('Could not open SAVR PWA window. Please allow pop-ups for this site.');
    return;
  }

  // ok, ok 
  var currentPageUrl = window.location.href;
  var currentPageHtml = document.documentElement.outerHTML;

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
})();
