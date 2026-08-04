#!/usr/bin/env node
const http = require('http');
const crypto = require('crypto');
const PORT = Number(process.env.PORT || 8080);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPEN = 1;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rooms = new Map();
const clients = new Set();
let nextId = 1;
function send(ws, msg) {
  if (ws.readyState !== OPEN) return;
  const data = Buffer.from(JSON.stringify(msg));
  const header = data.length < 126 ? Buffer.from([0x81, data.length]) : Buffer.from([0x81, 126, data.length >> 8, data.length & 255]);
  ws.socket.write(Buffer.concat([header, data]));
}
function broadcast(room, msg) { for (const client of room.players.values()) send(client, msg); }
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
function makeCode() { for (let i = 0; i < 100; i++) { const code = Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join(''); if (!rooms.has(code)) return code; } throw new Error('room code exhausted'); }
function playerInfo(ws, room) { return { id: ws.id, name: ws.name || 'Jogador', team: ws.team || 'ct', host: room.hostId === ws.id, status: 'conectado' }; }
function playerList(room) { return [...room.players.values()].map(client => playerInfo(client, room)); }
function roomSnapshot(room){ return { roomCode: room.code, hostId: room.hostId, options: room.options, minPlayers: room.minPlayers, maxPlayers: room.maxPlayers, players: playerList(room) }; }
function sendPlayerList(room) { broadcast(room, { type: 'player_list', roomCode: room.code, players: playerList(room), minPlayers: room.minPlayers, maxPlayers: room.maxPlayers }); }
function leaveRoom(ws, notify = true) {
  const room = rooms.get(ws.roomCode); if (!room) { ws.roomCode = null; return; }
  room.players.delete(ws.id); ws.roomCode = null;
  if (room.hostId === ws.id) { broadcast(room, { type: 'room_error', code: 'HOST_LEFT', message: 'Host saiu da sala' }); rooms.delete(room.code); return; }
  if (room.players.size === 0) rooms.delete(room.code); else if (notify) sendPlayerList(room);
}
function roomError(ws, code, message, roomCode = ws.roomCode) { send(ws, { type: 'room_error', code, message, roomCode }); }
function handleMessage(ws, raw) {
  let msg; try { msg = JSON.parse(raw); } catch { return roomError(ws, 'BAD_JSON', 'JSON inválido'); }
  if (msg.type === 'hello') return send(ws, { type: 'hello', playerId: ws.id, protocol: 'cs16plh-signaling-v2' });
  if (msg.type === 'create_room') {
    leaveRoom(ws, false); const code = makeCode(); ws.name = msg.name || ws.name; ws.team = msg.team || 'ct';
    const room = { code, version: msg.version, options: msg.options || {}, hostId: ws.id, maxPlayers: Math.max(2, Math.min(Number(msg.maxPlayers) || 8, 16)), minPlayers: 2, players: new Map([[ws.id, ws]]) };
    ws.roomCode = code; rooms.set(code, room); send(ws, { type: 'room_created', playerId: ws.id, ...roomSnapshot(room) }); return sendPlayerList(room);
  }
  if (msg.type === 'join_room') {
    const code = String(msg.roomCode || '').trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(code)) return roomError(ws, 'INVALID_CODE', 'Código inválido', code);
    const room = rooms.get(code); if (!room) return roomError(ws, 'ROOM_NOT_FOUND', 'Sala inexistente', code);
    if (room.players.size >= room.maxPlayers) return roomError(ws, 'ROOM_FULL', 'Sala cheia', code);
    if (room.version !== msg.version) return roomError(ws, 'VERSION_MISMATCH', 'Versão incompatível', code);
    leaveRoom(ws, false); ws.name = msg.name || ws.name; ws.team = msg.team || 'ct'; room.players.set(ws.id, ws); ws.roomCode = code;
    send(ws, { type: 'room_joined', playerId: ws.id, ...roomSnapshot(room) }); return sendPlayerList(room);
  }
  if (msg.type === 'leave_room') { leaveRoom(ws); return send(ws, { type: 'room_left' }); }
  const room = rooms.get(msg.roomCode || ws.roomCode); if (!room) return roomError(ws, 'ROOM_NOT_FOUND', 'Sala inexistente', msg.roomCode);
  if (msg.type === 'start_match') { if (ws.id !== room.hostId) return roomError(ws, 'NOT_HOST', 'Apenas o host pode iniciar', room.code); if (room.players.size < room.minPlayers) return roomError(ws, 'NOT_ENOUGH_PLAYERS', 'A sala exige pelo menos dois jogadores', room.code); return broadcast(room, { type: 'start_match', roomCode: room.code, options: room.options }); }
  if (msg.type === 'signal') { const target = room.players.get(msg.to); if (target) send(target, { type: 'signal', roomCode: room.code, from: ws.id, signalType: msg.signalType, description: msg.description, candidate: msg.candidate }); }
}
function handleClose(ws) { clients.delete(ws); leaveRoom(ws); }
const server = http.createServer((req,res)=>{ res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify({ok:true, port:PORT, rooms:rooms.size, protocol:'cs16plh-signaling-v2'})); });
server.on('upgrade', (req, socket) => {
  if ((req.headers.upgrade || '').toLowerCase() !== 'websocket') return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${accept}`,'',''].join('\r\n'));
  const ws = { id: `p${nextId++}`, socket, readyState: OPEN, buffer: Buffer.alloc(0), roomCode: null, name: null, team: null };
  clients.add(ws); send(ws, { type: 'hello', playerId: ws.id, protocol: 'cs16plh-signaling-v2' });
  socket.on('data', chunk => decodeFrames(ws, chunk, raw => handleMessage(ws, raw))); socket.on('close', () => handleClose(ws)); socket.on('error', err => { console.error('WebSocket client error:', err.message); handleClose(ws); });
});
if (require.main === module) server.listen(PORT, () => console.log(`CS1.6PLH signaling ws://0.0.0.0:${PORT}`));
module.exports = { server, rooms };
