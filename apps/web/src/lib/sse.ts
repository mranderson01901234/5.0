export async function* readSSE(resp: Response) {
  const reader = resp.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf += dec.decode(value,{stream:true});
    let idx;
    while((idx = buf.indexOf("\n\n"))>=0){
      const frame = buf.slice(0, idx); buf = buf.slice(idx+2);
      yield frame;
    }
  }
}

