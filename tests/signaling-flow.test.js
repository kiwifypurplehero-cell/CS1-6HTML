const assert = require('assert');
const { server } = require('../signaling/server');
function open(url){ return new Promise((resolve,reject)=>{ const ws = new WebSocket(url); ws.messages = []; ws.addEventListener('message', e => ws.messages.push(JSON.parse(e.data))); ws.addEventListener('open',()=>resolve(ws),{once:true}); ws.addEventListener('error',reject,{once:true}); }); }
function send(ws,msg){ ws.send(JSON.stringify(msg)); }
function wait(ws, filter = () => true) { return new Promise((resolve, reject) => { const existing = ws.messages.findIndex(filter); if (existing >= 0) return resolve(ws.messages.splice(existing, 1)[0]); const timer = setTimeout(() => reject(new Error('timeout waiting for message')), 3000); const onMsg = () => { const index = ws.messages.findIndex(filter); if (index >= 0) { clearTimeout(timer); ws.removeEventListener('message', onMsg); resolve(ws.messages.splice(index, 1)[0]); } }; ws.addEventListener('message', onMsg); }); }
async function main(){
  await new Promise(resolve => server.listen(0, resolve));
  const url = `ws://127.0.0.1:${server.address().port}`;
  const host = await open(url);
  send(host,{type:'create_room', playerName:'Host', settings:{mode:'tdm',map:'de_dust2',roundTime:'3 minutos',bestOf:'3',matchTime:'10 minutos'}, maxPlayers:2});
  const created = await wait(host, m => m.type === 'room_created'); assert.match(created.roomCode, /^[A-Z0-9]{6}$/);
  assert.equal(created.room.hostId, created.playerId);
  assert.equal(created.room.players.length, 1);
  assert.equal(created.room.players[0].host, true);
  assert.equal(created.room.settings.map, 'de_dust2');
  const initialList = await wait(host, m => m.type === 'player_list'); assert.equal(initialList.players.length, 1);
  send(host, { type: 'start_match' }); assert.equal((await wait(host, m => m.type === 'room_error')).code, 'NOT_ENOUGH_PLAYERS');
  const guest = await open(url);
  send(guest,{type:'join_room', roomCode:created.roomCode, version:'cs16plh-mp-1', name:'Guest', team:'tr'});
  const joined = await wait(guest, m => m.type === 'room_joined'); assert.equal(joined.hostId, created.playerId);
  const hostList = await wait(host, m => m.type === 'player_list' && m.players.length === 2); assert.deepEqual(hostList.players.map(p => p.name).sort(), ['Guest','Host']);
  const guestList = await wait(guest, m => m.type === 'player_list' && m.players.length === 2); assert.equal(guestList.minPlayers, 2);
  send(host, { type: 'offer', roomCode: created.roomCode, to: joined.playerId, description: { type: 'offer', sdp: 'fake' } }); assert.equal((await wait(guest, m => m.type === 'offer')).from, created.playerId);
  send(guest, { type: 'answer', roomCode: created.roomCode, to: created.playerId, description: { type: 'answer', sdp: 'fake' } }); assert.equal((await wait(host, m => m.type === 'answer')).from, joined.playerId);
  send(guest, { type: 'ice_candidate', roomCode: created.roomCode, to: created.playerId, candidate: { candidate: 'candidate:1 1 udp 1 0.0.0.0 9 typ relay' } }); assert.equal((await wait(host, m => m.type === 'ice_candidate')).from, joined.playerId);
  send(host, { type: 'ping' }); assert.equal((await wait(host, m => m.type === 'pong')).type, 'pong');
  send(host, { type: 'start_match' }); assert.equal((await wait(host, m => m.type === 'start_match')).roomCode, created.roomCode); assert.equal((await wait(guest, m => m.type === 'start_match')).roomCode, created.roomCode);
  const full = await open(url); send(full,{type:'join_room', roomCode:created.roomCode, version:'cs16plh-mp-1'}); assert.equal((await wait(full, m => m.type === 'room_error')).code, 'ROOM_FULL');
  const invalid = await open(url); send(invalid,{type:'join_room', roomCode:'NOPE99', version:'cs16plh-mp-1'}); assert.equal((await wait(invalid, m => m.type === 'room_error')).code, 'ROOM_NOT_FOUND');
  send(guest, { type: 'leave_room' }); assert.equal((await wait(guest, m => m.type === 'room_left')).type, 'room_left');
  const afterLeave = await wait(host, m => m.type === 'player_list' && m.players.length === 1); assert.equal(afterLeave.players[0].name, 'Host');
  send(host, { type: 'start_match' }); assert.equal((await wait(host, m => m.type === 'room_error')).code, 'NOT_ENOUGH_PLAYERS');
  host.close(); guest.close(); full.close(); invalid.close(); await new Promise(resolve => server.close(resolve));
}
main().then(()=>{console.log('signaling flow ok'); process.exit(0);}).catch(err=>{ console.error(err); process.exit(1); });
