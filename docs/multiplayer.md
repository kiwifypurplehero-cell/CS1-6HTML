# Multiplayer CS1.6PLH

O multiplayer usa um servidor público de sinalização WebSocket (`signaling/server.js`) e WebRTC `RTCDataChannel` para os dados da partida. O HTML não gera códigos falsos: o cliente envia `create_room`, o servidor gera um código único e responde com `room_created`.

## Iniciar o servidor

```bash
npm install
PORT=8080 npm run signaling
```

- Porta padrão: `8080`.
- Variável `PORT`: altera a porta HTTP/WebSocket.
- Health check HTTP: `GET /` retorna JSON com `ok`, `port`, `rooms` e `protocol`.
- WebSocket: publique o mesmo serviço atrás de HTTPS e use `wss://SEU_DOMINIO` no cliente.
- CORS/origin: use `ALLOWED_ORIGINS="https://seu-jogo.example,https://outro.example"`. O padrão `*` é útil para teste.

## Configuração do cliente

A configuração central fica em `CS1.6PLH.html`:

```js
const MULTIPLAYER_CONFIG = {
  signalingUrl: "wss://URL_PUBLICA_DO_SERVIDOR",
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:URL_DO_TURN:3478",
      username: "USUARIO_CONFIGURADO_NO_SERVIDOR",
      credential: "CREDENCIAL_CONFIGURADA_NO_SERVIDOR"
    }
  ]
};
```

Não coloque credenciais TURN privadas em repositório público. Injete a URL do signaling via `window.CS16PLH_SIGNALING_URL` ou `localStorage` apenas em ambientes controlados. `localhost` deve ser usado somente para teste local, por exemplo `localStorage.setItem("cs16plh-signaling-url", "ws://127.0.0.1:8080")`.

## STUN/TURN

- STUN público do Google já está configurado para descoberta de candidatos.
- Para redes móveis, CGNAT ou firewalls restritivos, configure um TURN público próprio (por exemplo coturn) com TLS quando possível.
- Para validar TURN, force a política `relay` no navegador durante teste ou use uma rede que bloqueie conexão direta e confirme o estado **Usando retransmissão TURN**.

## Protocolo suportado

O servidor suporta: `create_room`, `room_created`, `join_room`, `room_joined`, `room_state`, `player_list`, `leave_room`, `start_match`, `offer`, `answer`, `ice_candidate`, `room_error`, `ping` e `pong`. O envelope legado `signal` também é aceito para compatibilidade.

## Fluxo esperado

1. Host abre MULTIPLAYER e aguarda **Servidor conectado**.
2. Host clica **Criar sala**; o botão fica desativado se `socket.readyState !== WebSocket.OPEN`.
3. Servidor responde `room_created`; a sala abre imediatamente com código e host.
4. Visitante envia `join_room` com o código.
5. Servidor envia `room_joined` e atualiza `player_list` para todos.
6. Host cria ofertas WebRTC, visitantes respondem com `answer`, e ambos trocam `ice_candidate`.
7. Quando o `RTCDataChannel` abre, a UI mostra **Conexão P2P estabelecida**.
8. O servidor só permite `start_match` com pelo menos dois jogadores.

## Produção pública

Hospede o HTML em HTTPS e o signaling atrás de proxy/reverse proxy que aceite upgrade WebSocket. A URL final para `signalingUrl` deve ser `wss://SEU_DOMINIO` (ou caminho equivalente, como `wss://SEU_DOMINIO/ws`, se o proxy encaminhar esse caminho ao Node). Sem HTTPS/WSS, navegadores podem bloquear recursos e redes diferentes terão falhas mais frequentes.
