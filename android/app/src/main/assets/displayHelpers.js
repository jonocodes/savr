var cont

function darkMode() {

    document.body.style.backgroundColor = "rgb(21, 23, 24)"
    document.body.style.color = "white"

//    TODO: There has got to be a better way to do this without a loop
    var links = document.getElementsByTagName("a");
    for(var i=0;i<links.length;i++) {
        if(links[i].href){
            links[i].style.color = "rgb(83, 162, 255)";
        }
    }
}

function lightMode() {
    document.body.style.backgroundColor = "white"
    document.body.style.color = "black"
}

function changeSizeByBtn(size) {
  cont.style.fontSize = size + "px";
}

function changeSizeBySlider() {
  var slider = document.getElementById("slider");
  cont.style.fontSize = slider.value + "px";
}

function fontSizeModify(amount) {
  style = window.getComputedStyle(cont),
  currentSize = style.getPropertyValue('font-size');
  newSize = calcSize(currentSize, amount, 10, 40)
  console.log("current size: " + currentSize);
  console.log("new size: " + newSize);
  cont.style.fontSize = newSize + "px";
  changeSizeByBtn(newSize);
  console.log("now: " + cont.style.fontSize);
}

function smaller() {
  console.log("smaller");
  style = window.getComputedStyle(cont),
  currentSize = style.getPropertyValue('font-size');
  newSize = calcSize(currentSize, -1, 10, 40)
  console.log("current size: " + currentSize);
  console.log("new size: " + newSize);
  cont.style.fontSize = newSize + "px";
  changeSizeByBtn(newSize);
  console.log("now: " + cont.style.fontSize);
}

function bigger() {
  style = window.getComputedStyle(cont),
  currentSize = style.getPropertyValue('font-size');
  newSize = calcSize(currentSize, 1, 10, 40)
  console.log("bigger");
  console.log("current size: " + currentSize);
  console.log("new size: " + newSize);
  cont.style.fontSize = newSize + "px";
  changeSizeByBtn(newSize);
  console.log("now: " + cont.style.fontSize);
}

function calcSize(currentSize, incr, min, max) {
  fSize = (parseFloat(currentSize) + incr)
  console.log(parseFloat(currentSize) + incr)
  if (min > fSize || max < fSize) {
    console.log('hit bounds')
    return currentSize;
  }

  return fSize;
}

cont = document.getElementById("savr-root");

// return value goes here, in case we need it
"done"
