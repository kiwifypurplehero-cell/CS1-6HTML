const assert = require('assert');
const { server } = require('../signaling/server');
function open(url){ return new Promise((resolve,reject)=>{ const ws = new WebSocket(url); ws.addEventListener('open',()=>resolve(ws),{once:true}); ws.addEventListener('error',reject,{once:true}); }); }
function send(ws,msg){ ws.send(JSON.stringify(msg)); }
function wait(ws, filter = () => true) { return new Promise(resolve => { const onMsg = event => { const msg = JSON.parse(event.data); if (filter(msg)) { ws.removeEventListener('message', onMsg); resolve(msg); } }; ws.addEventListener('message', onMsg); }); }
async function main(){
  await new Promise(resolve => server.listen(0, resolve));
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = await open(url);
  send(host,{type:'create-room', roomCode:'ABC123', version:'cs16plh-mp-1', options:{mode:'tdm',map:'de_dust2'}, name:'Host', maxPlayers:2});
  const created = await wait(host, m => m.type === 'created'); assert.equal(created.roomCode, 'ABC123');
  const guest = await open(url);
  send(guest,{type:'join-room', roomCode:'ABC123', version:'cs16plh-mp-1', name:'Guest', team:'tr'});
  const joined = await wait(guest, m => m.type === 'joined'); assert.equal(joined.hostId, created.playerId);
  const peerJoined = await wait(host, m => m.type === 'peer-joined'); assert.equal(peerJoined.playerId, joined.playerId);
  const full = await open(url); send(full,{type:'join-room', roomCode:'ABC123', version:'cs16plh-mp-1'}); assert.equal((await wait(full)).code, 'ROOM_FULL');
  const invalid = await open(url); send(invalid,{type:'join-room', roomCode:'NOPE99', version:'cs16plh-mp-1'}); assert.equal((await wait(invalid)).code, 'ROOM_NOT_FOUND');
  guest.close(); host.close(); full.close(); invalid.close(); server.close();
}
main().then(()=>console.log('signaling flow ok')).catch(err=>{ console.error(err); process.exit(1); });
