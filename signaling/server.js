#!/usr/bin/env node
const http = require('http');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 8080);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPEN = 1;
const rooms = new Map();
const clients = new Set();
let nextId = 1;
function send(ws, msg) {
  if (ws.readyState !== OPEN) return;
  const data = Buffer.from(JSON.stringify(msg));
  const header = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  ws.socket.write(Buffer.concat([header, data]));
}
function close(ws) { if (ws.readyState !== OPEN) return; ws.readyState = 3; try { ws.socket.end(Buffer.from([0x88, 0])); } catch {} }
function decodeFrames(ws, chunk, onMessage) {
  ws.buffer = Buffer.concat([ws.buffer, chunk]);
  while (ws.buffer.length >= 2) {
    const b1 = ws.buffer[0], b2 = ws.buffer[1]; let len = b2 & 127, off = 2;
    if (len === 126) { if (ws.buffer.length < 4) return; len = ws.buffer.readUInt16BE(2); off = 4; }
    if (len === 127) return close(ws);
    const masked = Boolean(b2 & 0x80); const maskOff = off; if (masked) off += 4;
    if (ws.buffer.length < off + len) return;
    if ((b1 & 0x0f) === 0x8) { close(ws); return; }
    let payload = ws.buffer.subarray(off, off + len);
    if (masked) { const mask = ws.buffer.subarray(maskOff, maskOff + 4); payload = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4])); }
    ws.buffer = ws.buffer.subarray(off + len);
    if ((b1 & 0x0f) === 0x1) onMessage(payload.toString('utf8'));
  }
}
function roomSnapshot(room){ return { roomCode: room.code, hostId: room.hostId, options: room.options, players: [...room.players.keys()] }; }
function handleMessage(ws, raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return send(ws,{type:'error', code:'BAD_JSON', message:'JSON inválido'}); }
  if (msg.type === 'create-room') {
    const code = String(msg.roomCode || '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) return send(ws,{type:'error', code:'BAD_CODE', message:'Código inválido'});
    if (rooms.has(code)) return send(ws,{type:'error', code:'ROOM_EXISTS', message:'Sala já existe'});
    const room = { code, version: msg.version, options: msg.options, host: ws, hostId: ws.id, maxPlayers: msg.maxPlayers || 8, players: new Map([[ws.id, ws]]) };
    ws.roomCode = code; rooms.set(code, room); return send(ws,{type:'created', playerId: ws.id, ...roomSnapshot(room)});
  }
  if (msg.type === 'join-room') {
    const code = String(msg.roomCode || '').toUpperCase(); const room = rooms.get(code);
    if (!room) return send(ws,{type:'error', code:'ROOM_NOT_FOUND', message:'Sala inexistente'});
    if (room.players.size >= room.maxPlayers) return send(ws,{type:'error', code:'ROOM_FULL', message:'Sala cheia'});
    if (room.version !== msg.version) return send(ws,{type:'error', code:'VERSION_MISMATCH', message:'Versão incompatível'});
    room.players.set(ws.id, ws); ws.roomCode = code; send(ws,{type:'joined', playerId: ws.id, ...roomSnapshot(room)}); return send(room.host,{type:'peer-joined', playerId: ws.id, name: msg.name, team: msg.team});
  }
  const room = rooms.get(msg.roomCode || ws.roomCode); if (!room) return send(ws,{type:'error', code:'ROOM_NOT_FOUND', message:'Sala inexistente'});
  if (['offer','answer','ice'].includes(msg.type)) { const target = room.players.get(msg.to); if (target) send(target, {...msg, from: ws.id}); }
}
function handleClose(ws) {
  clients.delete(ws); const room = rooms.get(ws.roomCode); if (!room) return;
  room.players.delete(ws.id);
  if (room.host === ws) { for (const client of room.players.values()) send(client,{type:'host-left'}); rooms.delete(room.code); }
  else { send(room.host,{type:'peer-left', playerId: ws.id}); if (room.players.size === 0) rooms.delete(room.code); }
}
const server = http.createServer((req,res)=>{ res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ok:true, rooms:rooms.size, protocol:'cs16plh-signaling-v1'})); });
server.on('upgrade', (req, socket) => {
  if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${accept}`,'',''].join('\r\n'));
  const ws = { id: `p${nextId++}`, socket, readyState: OPEN, buffer: Buffer.alloc(0), roomCode: null };
  clients.add(ws); socket.on('data', chunk => decodeFrames(ws, chunk, raw => handleMessage(ws, raw))); socket.on('close', () => handleClose(ws)); socket.on('error', () => handleClose(ws));
});
if (require.main === module) server.listen(PORT, () => console.log(`CS1.6PLH signaling ws://0.0.0.0:${PORT}`));
module.exports = { server, rooms };
