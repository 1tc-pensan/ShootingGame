const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let gameState = {
  ball: { x: 400, y: 300, vx: 3, vy: 2, radius: 8 },
  paddle1: { y: 250, score: 0 },
  paddle2: { y: 250, score: 0 },
  paddleWidth: 10,
  paddleHeight: 100,
  width: 800,
  height: 600
};

let clients = [];

wss.on('connection', (ws) => {
  const playerId = clients.length + 1;
  clients.push({ ws, id: playerId });
  
  console.log(`Játékos ${playerId} csatlakozott`);
  
  ws.send(JSON.stringify({ type: 'init', playerId, gameState }));
  
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    if (data.type === 'move') {
      if (data.playerId === 1) {
        gameState.paddle1.y = Math.max(0, Math.min(gameState.height - gameState.paddleHeight, data.y));
      } else if (data.playerId === 2) {
        gameState.paddle2.y = Math.max(0, Math.min(gameState.height - gameState.paddleHeight, data.y));
      }
    }
  });
  
  ws.on('close', () => {
    clients = clients.filter(client => client.ws !== ws);
    console.log(`Játékos ${playerId} kilépett`);
  });
});

function updateGame() {
  // Labda mozgatása
  gameState.ball.x += gameState.ball.vx;
  gameState.ball.y += gameState.ball.vy;
  
  // Felső és alsó fal ütközés
  if (gameState.ball.y - gameState.ball.radius <= 0 || 
      gameState.ball.y + gameState.ball.radius >= gameState.height) {
    gameState.ball.vy *= -1;
  }
  
  // Bal ütő ütközés
  if (gameState.ball.x - gameState.ball.radius <= gameState.paddleWidth) {
    if (gameState.ball.y >= gameState.paddle1.y && 
        gameState.ball.y <= gameState.paddle1.y + gameState.paddleHeight) {
      gameState.ball.vx *= -1;
      gameState.ball.x = gameState.paddleWidth + gameState.ball.radius;
      // Változatosság: ütő közepéhez viszonyított eltérés alapján vy módosítása
      const hitPos = (gameState.ball.y - gameState.paddle1.y - gameState.paddleHeight / 2) / (gameState.paddleHeight / 2);
      gameState.ball.vy = hitPos * 5;
    }
  }
  
  // Jobb ütő ütközés
  if (gameState.ball.x + gameState.ball.radius >= gameState.width - gameState.paddleWidth) {
    if (gameState.ball.y >= gameState.paddle2.y && 
        gameState.ball.y <= gameState.paddle2.y + gameState.paddleHeight) {
      gameState.ball.vx *= -1;
      gameState.ball.x = gameState.width - gameState.paddleWidth - gameState.ball.radius;
      const hitPos = (gameState.ball.y - gameState.paddle2.y - gameState.paddleHeight / 2) / (gameState.paddleHeight / 2);
      gameState.ball.vy = hitPos * 5;
    }
  }
  
  // Pont számolás
  if (gameState.ball.x < 0) {
    gameState.paddle2.score++;
    resetBall();
  } else if (gameState.ball.x > gameState.width) {
    gameState.paddle1.score++;
    resetBall();
  }
  
  // Broadcast állapot
  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: 'update', gameState }));
    }
  });
}

function resetBall() {
  gameState.ball.x = gameState.width / 2;
  gameState.ball.y = gameState.height / 2;
  gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3;
  gameState.ball.vy = (Math.random() - 0.5) * 4;
}

// Játék loop - 60 FPS
setInterval(updateGame, 1000 / 60);

console.log('WebSocket szerver fut a 8080-as porton');
