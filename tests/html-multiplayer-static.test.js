const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync('CS1.6PLH.html', 'utf8');
[
  'MULTIPLAYER','Criar sala','Entrar em sala','Aguardando outro jogador','mp-start-match','disabled',
  'RTCDataChannel','RTCPeerConnection','createDataChannel','randomRoomCode','ROOM_NOT_FOUND','ROOM_FULL','VERSION_MISMATCH',
  'sendStateSnapshot','validateDamage','bomb','fire','death','players'
].forEach(token => assert(html.includes(token), `missing ${token}`));
assert(!html.includes('Procurar servidor</button>'), 'old server menu remains');
assert(!html.includes('id="mp-bot'), 'multiplayer bot option should not exist');
console.log('html multiplayer static checks ok');
