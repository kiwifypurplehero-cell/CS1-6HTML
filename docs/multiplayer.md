# Multiplayer CS1.6PLH

A base multiplayer reutiliza o servidor Node.js/WebSocket em `signaling/server.js` para criação, entrada, saída e lista de jogadores das salas. O WebRTC `RTCDataChannel` continua sendo usado para dados em tempo real da partida; o WebSocket transporta apenas sinalização e controle da sala.

## Executar o servidor

```bash
npm install
PORT=8080 npm run signaling
```

O comando `npm run signaling` é definido em `package.json` e inicia o servidor na porta `PORT` ou, por padrão, `8080`. O processo imprime `CS1.6PLH signaling ws://0.0.0.0:8080` e também responde a um health check HTTP na mesma porta.

## Configurar a URL no HTML

O HTML centraliza a URL em `MULTIPLAYER_CONFIG`:

```js
const MULTIPLAYER_CONFIG = {
  signalingUrl: window.CS16PLH_SIGNALING_URL || localStorage.getItem("cs16plh-signaling-url") || "ws://localhost:8080"
};
```

Para testes locais no mesmo computador, `ws://localhost:8080` funciona. Para jogadores em aparelhos diferentes, não use `localhost` como endereço final: hospede o signaling em um host acessível a todos e configure `window.CS16PLH_SIGNALING_URL` ou `localStorage` com `ws://IP_OU_HOST:8080`. Em produção pública, use HTTPS para o HTML e uma URL segura `wss://seu-dominio.example/ws`.

## Protocolo de mensagens

Cliente e servidor usam os mesmos nomes e campos principais:

- `hello`: saudação do servidor com `playerId` e `protocol`.
- `create_room`: cliente pede criação; o código não é enviado pelo HTML.
- `room_created`: servidor confirma e devolve `roomCode`, `playerId`, `hostId`, `options` e `players`.
- `join_room`: cliente pede entrada com `roomCode`, `version`, `name` e `team`.
- `room_joined`: servidor confirma entrada.
- `room_error`: servidor rejeita código inválido, sala inexistente/cheia, versão incompatível ou partida com menos de dois jogadores.
- `player_list`: servidor envia a lista autoritativa de jogadores para todos na sala.
- `leave_room`: cliente sai da sala e o servidor atualiza todos.
- `start_match`: host solicita início; o servidor exige pelo menos dois jogadores.
- `signal`: envelope para oferta, resposta e ICE do WebRTC, com `signalType`, `to`, `from`, `description` ou `candidate`.

## Estados de interface

A interface exibe `Conectando ao servidor`, `Servidor conectado` e `Servidor indisponível`. O botão **Criar** fica desativado enquanto o WebSocket não está conectado, e o código da sala só aparece após `room_created`.

A reconexão é controlada: no máximo três tentativas com intervalo progressivo, canceladas ao sair da tela/sala multiplayer.

## Testar com dois celulares

1. Publique o HTML em HTTPS ou sirva-o em uma rede local acessível pelos celulares.
2. Execute o servidor de sinalização em um host acessível pelos dois aparelhos.
3. Configure `window.CS16PLH_SIGNALING_URL` para o endereço `ws://` ou `wss://` desse host.
4. No celular A: abra **MULTIPLAYER**, aguarde **Servidor conectado**, clique **Criar sala**, copie o código confirmado pelo servidor.
5. No celular B: abra **MULTIPLAYER**, aguarde **Servidor conectado**, clique **Entrar em sala**, digite o código e entre.
6. Confirme que a lista enviada pelo servidor mostra dois jogadores e que **Iniciar partida** fica liberado no host.
7. Digite um código inexistente para validar a mensagem **Sala não encontrada**.
8. Saia de um cliente para confirmar a atualização da lista.
9. Pare o servidor para validar **Servidor indisponível** e os erros claros no console.

## O que exige internet

WebRTC entre redes diferentes normalmente precisa de conectividade pública e pode precisar de STUN/TURN. Esta base configura STUN público do Google, portanto requer internet global para descoberta de candidatos fora da rede local. O servidor de sinalização também precisa estar acessível pelos dois aparelhos.
