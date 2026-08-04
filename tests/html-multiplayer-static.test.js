const assert = require('assert');
const fs = require('fs');
const html = fs.readFileSync('CS1.6PLH.html', 'utf8');
[
  'MULTIPLAYER','Criar sala','Entrar em sala','Aguardando jogadores','mp-start-match','disabled',
  'RTCPeerConnection','createDataChannel','MULTIPLAYER_CONFIG','create_room','room_created','join_room','room_joined','room_error','player_list','leave_room','start_match','signal','ROOM_NOT_FOUND','ROOM_FULL','VERSION_MISMATCH',
  'sendStateSnapshot','validateDamage','bomb','fire','death','players'
].forEach(token => assert(html.includes(token), `missing ${token}`));
assert(!html.includes('Procurar servidor</button>'), 'old server menu remains');
assert(!html.includes('id="mp-bot'), 'multiplayer bot option should not exist');
console.log('html multiplayer static checks ok');
