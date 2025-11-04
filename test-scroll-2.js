// Run this to see current state after latest build
const chat = document.querySelector('.chat-container');

console.log('=== CHAT SCROLL DIAGNOSTIC ===');
console.log('Chat exists:', !!chat);
if (chat) {
  console.log('Chat scrollTop:', chat.scrollTop);
  console.log('Chat clientHeight:', chat.clientHeight);
  console.log('Chat scrollHeight:', chat.scrollHeight);
  console.log('Has overflow:', chat.scrollHeight > chat.clientHeight);
  console.log('Computed overflowY:', getComputedStyle(chat).overflowY);
  
  console.log('\n=== TESTING SCROLL ===');
  chat.scrollTop = 100;
  setTimeout(() => {
    console.log('After setting to 100, scrollTop is:', chat.scrollTop);
    
    if (chat.scrollTop === 0) {
      console.log('❌ SCROLL BLOCKED - Checking parents...');
      let p = chat.parentElement;
      let depth = 0;
      while (p && depth < 10) {
        const cs = getComputedStyle(p);
        if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
          console.log(`🚫 Parent ${depth} BLOCKS SCROLL:`, {
            tag: p.tagName,
            class: p.className.substring(0, 50),
            overflow: cs.overflow,
            overflowY: cs.overflowY,
            height: p.clientHeight
          });
        } else {
          console.log(`✓ Parent ${depth} allows scroll:`, {
            tag: p.tagName, 
            class: p.className.substring(0, 50),
            overflowY: cs.overflowY
          });
        }
        p = p.parentElement;
        depth++;
      }
    } else {
      console.log('✅ SCROLL WORKS');
    }
    
    chat.scrollTop = 0;
  }, 100);
}

