# Multiplayer CS1.6PLH

A base multiplayer usa WebRTC `RTCDataChannel` para dados de partida e um servidor separado Node.js/WebSocket apenas para sinalização: criação de sala, entrada, ofertas/respostas ICE e avisos de saída.

## Executar o servidor

```bash
npm install
PORT=8080 npm run signaling
```

O servidor responde em `ws://SEU_HOST:8080` e também expõe um health check HTTP simples na mesma porta.

## Configurar a URL no HTML

Antes de abrir `CS1.6PLH.html`, defina no console ou em um pequeno arquivo carregado antes do jogo:

```html
<script>window.CS16PLH_SIGNALING_URL = "wss://seu-dominio.example/ws";</script>
```

Para testes locais no mesmo computador, o padrão é `ws://localhost:8080`. Não há senhas nem chaves privadas no HTML.

## Testar com dois celulares

1. Publique o HTML em HTTPS ou sirva-o em uma rede local acessível pelos celulares.
2. Execute o servidor de sinalização em um host acessível pelos dois aparelhos.
3. Configure `window.CS16PLH_SIGNALING_URL` para o endereço `ws://` ou `wss://` desse host.
4. No celular A: abra **MULTIPLAYER**, clique **Criar sala**, copie o código de 6 caracteres.
5. No celular B: abra **MULTIPLAYER**, clique **Entrar em sala**, digite o código e entre.
6. Confirme que a lista mostra dois jogadores e que o botão **Iniciar partida** fica liberado no host.
7. Inicie e mova/dispare em um cliente para observar mensagens de estado pelo `RTCDataChannel`.
8. Feche um cliente para validar o aviso de desconexão.
9. Digite um código inexistente para validar a mensagem **Sala inexistente**.

## O que exige internet

WebRTC entre redes diferentes normalmente precisa de conectividade pública e pode precisar de STUN/TURN. Esta base configura STUN público do Google, portanto requer internet global para descoberta de candidatos fora da rede local. O servidor de sinalização também precisa estar acessível pelos dois aparelhos.

## Rede local futura

Para rede local, execute `PORT=8080 npm run signaling` em um computador da LAN e configure os celulares para `ws://IP_DO_COMPUTADOR:8080`. Não afirme funcionamento sem internet global a menos que todos os aparelhos estejam na mesma rede e o servidor local esteja acessível. Para produção, adicione HTTPS/WSS e um TURN próprio.

## Autoridade e sincronização

O host é autoritativo para dano, eliminações, rodadas, placar, respawn, vitória e bomba. O mapa não é enviado pela rede: cada cliente constrói `de_dust2` localmente e troca mensagens compactas de posição, rotação, animação, vida, tiros, dano, morte, equipe, placar, tempo, rodada, espectador e bomba quando disponível.
