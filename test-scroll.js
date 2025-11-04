// Run this in browser console to see WHAT is actually scrolling
console.log('=== WHAT IS SCROLLING? ===');

const main = document.getElementById('main');
const splitContainer = document.querySelector('.flex.h-full.w-full');
const chat = document.querySelector('.chat-container');
const artifactPane = document.querySelector('.artifact-pane');
const artifactScroll = document.getElementById('artifact-scroll');

console.log('main:', {
  exists: !!main,
  overflow: main ? getComputedStyle(main).overflow : 'N/A',
  overflowY: main ? getComputedStyle(main).overflowY : 'N/A',
  scrollHeight: main?.scrollHeight,
  clientHeight: main?.clientHeight,
  canScroll: main ? main.scrollHeight > main.clientHeight : false
});

console.log('splitContainer:', {
  exists: !!splitContainer,
  overflow: splitContainer ? getComputedStyle(splitContainer).overflow : 'N/A',
  overflowY: splitContainer ? getComputedStyle(splitContainer).overflowY : 'N/A',
  scrollHeight: splitContainer?.scrollHeight,
  clientHeight: splitContainer?.clientHeight,
  canScroll: splitContainer ? splitContainer.scrollHeight > splitContainer.clientHeight : false
});

console.log('chat container:', {
  exists: !!chat,
  overflowY: chat ? getComputedStyle(chat).overflowY : 'N/A',
  scrollHeight: chat?.scrollHeight,
  clientHeight: chat?.clientHeight,
  canScroll: chat ? chat.scrollHeight > chat.clientHeight : false
});

console.log('artifact pane:', {
  exists: !!artifactPane,
  overflowY: artifactPane ? getComputedStyle(artifactPane).overflowY : 'N/A',
  scrollHeight: artifactPane?.scrollHeight,
  clientHeight: artifactPane?.clientHeight
});

console.log('artifact scroll:', {
  exists: !!artifactScroll,
  overflowY: artifactScroll ? getComputedStyle(artifactScroll).overflowY : 'N/A',
  scrollHeight: artifactScroll?.scrollHeight,
  clientHeight: artifactScroll?.clientHeight,
  canScroll: artifactScroll ? artifactScroll.scrollHeight > artifactScroll.clientHeight : false
});

// Find what's ACTUALLY scrolling
console.log('\n=== FINDING ACTUAL SCROLL CONTAINER ===');
let allScrollable = [...document.querySelectorAll('*')].filter(e => {
  const cs = getComputedStyle(e);
  return e.scrollHeight > e.clientHeight && (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflow === 'auto' || cs.overflow === 'scroll');
});

console.log('Elements that can scroll:', allScrollable.map(e => ({
  tag: e.tagName,
  id: e.id || 'N/A',
  class: e.className.substring(0, 50),
  scrollHeight: e.scrollHeight,
  clientHeight: e.clientHeight,
  overflowY: getComputedStyle(e).overflowY
})));

