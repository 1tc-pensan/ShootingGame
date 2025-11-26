import { Component, OnInit, OnDestroy, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { interval, Subscription, fromEvent } from 'rxjs';

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  invulnerable: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromPlayer: boolean;
}

interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  speed: number;
  type: 'basic' | 'fast' | 'tank' | 'shooter' | 'boss';
  shootTimer: number;
  movePattern: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="game-container" [class.game-over]="gameOver">
      <div class="hud">
        <div class="health-bar">
          <div class="health-label">HP</div>
          <div class="health-bg">
            <div class="health-fill" [style.width.%]="(player.health / player.maxHealth) * 100"></div>
          </div>
          <div class="health-text">{{ player.health }} / {{ player.maxHealth }}</div>
        </div>
        
        <div class="stats">
          <div class="stat">
            <span class="label">SCORE:</span>
            <span class="value">{{ score }}</span>
          </div>
          <div class="stat">
            <span class="label">WAVE:</span>
            <span class="value">{{ wave }}</span>
          </div>
          <div class="stat">
            <span class="label">KILLS:</span>
            <span class="value">{{ kills }}</span>
          </div>
        </div>
      </div>
      
      <canvas 
        #gameCanvas 
        [width]="canvasWidth" 
        [height]="canvasHeight">
      </canvas>
      
      <div class="game-over-screen" *ngIf="gameOver">
        <h1>GAME OVER</h1>
        <div class="final-stats">
          <p>Final Score: <strong>{{ score }}</strong></p>
          <p>Wave Reached: <strong>{{ wave }}</strong></p>
          <p>Enemies Killed: <strong>{{ kills }}</strong></p>
        </div>
        <button (click)="restart()" class="restart-btn">RESTART</button>
      </div>
      
      <div class="instructions" *ngIf="!gameStarted && !gameOver">
        <h1>🎮 BULLET HELL SURVIVOR 🎮</h1>
        <div class="controls">
          <h2>Controls:</h2>
          <p><strong>W A S D</strong> or <strong>Arrow Keys</strong> - Move</p>
          <p><strong>SPACE</strong> - Shoot</p>
          <p><strong>Mouse</strong> - Aim direction</p>
        </div>
        <div class="enemy-types">
          <h2>Enemy Types:</h2>
          <p><span class="enemy-basic">█</span> Basic - Slow, weak</p>
          <p><span class="enemy-fast">█</span> Fast - Quick, low HP</p>
          <p><span class="enemy-tank">█</span> Tank - Slow, high HP</p>
          <p><span class="enemy-shooter">█</span> Shooter - Shoots at you!</p>
          <p><span class="enemy-boss">█</span> Boss - Massive HP, shoots patterns</p>
        </div>
        <button (click)="startGame()" class="start-btn">START GAME</button>
      </div>
    </div>
  `,
  styles: [`
    .game-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #0a0a0a;
      min-height: 100vh;
      font-family: 'Courier New', monospace;
      position: relative;
      overflow: hidden;
    }
    
    .game-container.game-over {
      background: #1a0000;
    }
    
    .hud {
      width: 900px;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(20, 20, 30, 0.9);
      border-bottom: 3px solid #00ff00;
      box-shadow: 0 4px 20px rgba(0, 255, 0, 0.3);
    }
    
    .health-bar {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .health-label {
      color: #00ff00;
      font-size: 18px;
      font-weight: bold;
      text-shadow: 0 0 10px #00ff00;
    }
    
    .health-bg {
      width: 200px;
      height: 24px;
      background: #1a1a2a;
      border: 2px solid #00ff00;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.5);
    }
    
    .health-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff0000, #00ff00);
      transition: width 0.3s ease;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.8);
    }
    
    .health-text {
      color: #fff;
      font-size: 14px;
      min-width: 80px;
    }
    
    .stats {
      display: flex;
      gap: 30px;
    }
    
    .stat {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .stat .label {
      color: #00ffff;
      font-size: 12px;
      text-shadow: 0 0 5px #00ffff;
    }
    
    .stat .value {
      color: #fff;
      font-size: 24px;
      font-weight: bold;
      text-shadow: 0 0 10px #fff;
    }
    
    canvas {
      border: 3px solid #00ff00;
      background: #000;
      box-shadow: 0 0 30px rgba(0, 255, 0, 0.5);
      cursor: crosshair;
    }
    
    .game-over-screen {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 10, 10, 0.95);
      padding: 50px;
      border: 4px solid #ff0000;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 0 50px rgba(255, 0, 0, 0.8);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { box-shadow: 0 0 50px rgba(255, 0, 0, 0.8); }
      50% { box-shadow: 0 0 80px rgba(255, 0, 0, 1); }
    }
    
    .game-over-screen h1 {
      color: #ff0000;
      font-size: 4em;
      margin: 0 0 30px 0;
      text-shadow: 0 0 20px #ff0000;
    }
    
    .final-stats {
      margin: 30px 0;
      color: #fff;
      font-size: 1.5em;
    }
    
    .final-stats p {
      margin: 15px 0;
    }
    
    .final-stats strong {
      color: #00ff00;
      text-shadow: 0 0 10px #00ff00;
    }
    
    .restart-btn {
      background: linear-gradient(135deg, #ff0000, #ff6600);
      color: white;
      border: none;
      padding: 20px 50px;
      font-size: 1.5em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 20px rgba(255, 0, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .restart-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 30px rgba(255, 0, 0, 0.8);
    }
    
    .instructions {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 10, 30, 0.95);
      padding: 50px;
      border: 4px solid #00ff00;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 0 50px rgba(0, 255, 0, 0.5);
      color: white;
      max-width: 600px;
    }
    
    .instructions h1 {
      color: #00ff00;
      font-size: 2.5em;
      margin-bottom: 30px;
      text-shadow: 0 0 20px #00ff00;
    }
    
    .instructions h2 {
      color: #00ffff;
      margin: 20px 0 10px 0;
      text-shadow: 0 0 10px #00ffff;
    }
    
    .instructions p {
      margin: 8px 0;
      font-size: 1.1em;
    }
    
    .controls, .enemy-types {
      margin: 20px 0;
      text-align: left;
    }
    
    .enemy-basic { color: #888; }
    .enemy-fast { color: #ff00ff; }
    .enemy-tank { color: #ffaa00; }
    .enemy-shooter { color: #ff0000; }
    .enemy-boss { color: #ff0000; font-size: 1.5em; }
    
    .start-btn {
      background: linear-gradient(135deg, #00ff00, #00cc00);
      color: #000;
      border: none;
      padding: 20px 60px;
      font-size: 2em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 20px rgba(0, 255, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      margin-top: 30px;
    }
    
    .start-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 30px rgba(0, 255, 0, 0.8);
    }
  `]
})
export class GameComponent implements OnInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  private subscriptions = new Subscription();
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  
  canvasWidth = 900;
  canvasHeight = 700;
  
  player: Player = {
    x: 450,
    y: 600,
    width: 40,
    height: 40,
    speed: 6,
    health: 100,
    maxHealth: 100,
    invulnerable: 0
  };
  
  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  particles: Particle[] = [];
  
  keys: { [key: string]: boolean } = {};
  mouseX: number = 0;
  mouseY: number = 0;
  
  score: number = 0;
  wave: number = 1;
  kills: number = 0;
  gameOver: boolean = false;
  gameStarted: boolean = false;
  
  lastShot: number = 0;
  shootCooldown: number = 150;
  waveSpawnTimer: number = 0;
  bossSpawned: boolean = false;
  
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    this.keys[event.key.toLowerCase()] = true;
    if (event.key === ' ' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.shootBullet();
    }
  }
  
  @HostListener('window:keyup', ['$event'])
  handleKeyUp(event: KeyboardEvent) {
    this.keys[event.key.toLowerCase()] = false;
  }
  
  @HostListener('window:mousemove', ['$event'])
  handleMouseMove(event: MouseEvent) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouseX = event.clientX - rect.left;
    this.mouseY = event.clientY - rect.top;
  }
  
  ngOnInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.render();
  }
  
  startGame() {
    this.gameStarted = true;
    this.resetGame();
    this.gameLoop();
  }
  
  resetGame() {
    this.player = {
      x: 450,
      y: 600,
      width: 40,
      height: 40,
      speed: 6,
      health: 100,
      maxHealth: 100,
      invulnerable: 0
    };
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.score = 0;
    this.wave = 1;
    this.kills = 0;
    this.gameOver = false;
    this.waveSpawnTimer = 0;
    this.bossSpawned = false;
  }
  
  restart() {
    this.startGame();
  }
  
  gameLoop() {
    if (this.gameOver) return;
    
    this.update();
    this.render();
    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Player movement
    if (this.keys['w'] || this.keys['arrowup']) {
      this.player.y = Math.max(0, this.player.y - this.player.speed);
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      this.player.y = Math.min(this.canvasHeight - this.player.height, this.player.y + this.player.speed);
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      this.player.x = Math.max(0, this.player.x - this.player.speed);
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      this.player.x = Math.min(this.canvasWidth - this.player.width, this.player.x + this.player.speed);
    }
    
    if (this.player.invulnerable > 0) {
      this.player.invulnerable--;
    }
    
    // Auto shoot
    if (this.keys[' ']) {
      this.shootBullet();
    }
    
    // Update bullets
    this.bullets = this.bullets.filter(bullet => {
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;
      return bullet.x > 0 && bullet.x < this.canvasWidth && 
             bullet.y > 0 && bullet.y < this.canvasHeight;
    });
    
    // Update enemies
    this.enemies.forEach(enemy => {
      this.updateEnemy(enemy);
    });
    
    // Spawn enemies
    this.spawnWave();
    
    // Check collisions
    this.checkCollisions();
    
    // Update particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.vy += 0.2; // gravity
      return p.life > 0;
    });
    
    // Check game over
    if (this.player.health <= 0) {
      this.gameOver = true;
    }
  }
  
  updateEnemy(enemy: Enemy) {
    const dx = this.player.x + this.player.width / 2 - enemy.x;
    const dy = this.player.y + this.player.height / 2 - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    switch (enemy.type) {
      case 'basic':
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;
        break;
        
      case 'fast':
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;
        break;
        
      case 'tank':
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;
        break;
        
      case 'shooter':
        // Move slower and shoot
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;
        enemy.shootTimer++;
        if (enemy.shootTimer > 90) {
          this.enemyShoot(enemy);
          enemy.shootTimer = 0;
        }
        break;
        
      case 'boss':
        // Circular pattern
        enemy.movePattern += 0.03;
        enemy.x += Math.cos(enemy.movePattern) * 2;
        enemy.y = Math.min(200, enemy.y + 0.5);
        
        enemy.shootTimer++;
        if (enemy.shootTimer > 30) {
          this.bossShootPattern(enemy);
          enemy.shootTimer = 0;
        }
        break;
    }
  }
  
  enemyShoot(enemy: Enemy) {
    const dx = this.player.x + this.player.width / 2 - enemy.x;
    const dy = this.player.y + this.player.height / 2 - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    this.bullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: (dx / dist) * 4,
      vy: (dy / dist) * 4,
      radius: 5,
      damage: 15,
      fromPlayer: false
    });
  }
  
  bossShootPattern(enemy: Enemy) {
    // Shoot in 8 directions
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      this.bullets.push({
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        radius: 6,
        damage: 20,
        fromPlayer: false
      });
    }
  }
  
  shootBullet() {
    const now = Date.now();
    if (now - this.lastShot < this.shootCooldown) return;
    
    const dx = this.mouseX - (this.player.x + this.player.width / 2);
    const dy = this.mouseY - (this.player.y + this.player.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      this.bullets.push({
        x: this.player.x + this.player.width / 2,
        y: this.player.y + this.player.height / 2,
        vx: (dx / dist) * 12,
        vy: (dy / dist) * 12,
        radius: 4,
        damage: 25,
        fromPlayer: true
      });
      
      this.lastShot = now;
    }
  }
  
  spawnWave() {
    if (this.enemies.length > 0) return;
    
    this.waveSpawnTimer++;
    if (this.waveSpawnTimer < 120) return;
    
    this.waveSpawnTimer = 0;
    
    // Boss every 5 waves
    if (this.wave % 5 === 0 && !this.bossSpawned) {
      this.spawnBoss();
      this.bossSpawned = true;
      return;
    }
    
    this.bossSpawned = false;
    const enemyCount = 3 + this.wave * 2;
    
    for (let i = 0; i < enemyCount; i++) {
      const rand = Math.random();
      let type: Enemy['type'] = 'basic';
      
      if (rand < 0.3) type = 'basic';
      else if (rand < 0.5) type = 'fast';
      else if (rand < 0.7) type = 'tank';
      else type = 'shooter';
      
      this.spawnEnemy(type);
    }
    
    this.wave++;
  }
  
  spawnEnemy(type: Exclude<Enemy['type'], 'boss'>) {
    const configs = {
      basic: { width: 30, height: 30, health: 50, speed: 1.5 },
      fast: { width: 25, height: 25, health: 30, speed: 3 },
      tank: { width: 50, height: 50, health: 150, speed: 0.8 },
      shooter: { width: 35, height: 35, health: 60, speed: 1 }
    };
    
    const config = configs[type];
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    
    switch (side) {
      case 0: x = Math.random() * this.canvasWidth; y = -config.height; break;
      case 1: x = this.canvasWidth; y = Math.random() * this.canvasHeight; break;
      case 2: x = Math.random() * this.canvasWidth; y = this.canvasHeight; break;
      case 3: x = -config.width; y = Math.random() * this.canvasHeight; break;
    }
    
    this.enemies.push({
      x, y,
      width: config.width,
      height: config.height,
      health: config.health,
      maxHealth: config.health,
      speed: config.speed,
      type,
      shootTimer: 0,
      movePattern: 0
    });
  }
  
  spawnBoss() {
    this.enemies.push({
      x: this.canvasWidth / 2 - 75,
      y: -150,
      width: 150,
      height: 150,
      health: 1000 + this.wave * 200,
      maxHealth: 1000 + this.wave * 200,
      speed: 1,
      type: 'boss',
      shootTimer: 0,
      movePattern: 0
    });
  }
  
  checkCollisions() {
    // Bullets vs Enemies
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const bullet = this.bullets[i];
      
      if (bullet.fromPlayer) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const enemy = this.enemies[j];
          
          if (this.circleRectCollision(bullet.x, bullet.y, bullet.radius, 
                                       enemy.x, enemy.y, enemy.width, enemy.height)) {
            enemy.health -= bullet.damage;
            this.bullets.splice(i, 1);
            this.createParticles(bullet.x, bullet.y, '#ffff00');
            
            if (enemy.health <= 0) {
              this.enemies.splice(j, 1);
              this.kills++;
              this.score += enemy.type === 'boss' ? 1000 : 
                           enemy.type === 'tank' ? 100 : 
                           enemy.type === 'shooter' ? 75 : 
                           enemy.type === 'fast' ? 50 : 25;
              this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000', 20);
            }
            break;
          }
        }
      } else {
        // Enemy bullet vs Player
        if (this.circleRectCollision(bullet.x, bullet.y, bullet.radius,
                                     this.player.x, this.player.y, 
                                     this.player.width, this.player.height)) {
          if (this.player.invulnerable === 0) {
            this.player.health -= bullet.damage;
            this.player.invulnerable = 60;
            this.createParticles(bullet.x, bullet.y, '#ff0000', 15);
          }
          this.bullets.splice(i, 1);
        }
      }
    }
    
    // Enemies vs Player
    if (this.player.invulnerable === 0) {
      for (const enemy of this.enemies) {
        if (this.rectCollision(this.player.x, this.player.y, this.player.width, this.player.height,
                               enemy.x, enemy.y, enemy.width, enemy.height)) {
          this.player.health -= 25;
          this.player.invulnerable = 60;
          this.createParticles(this.player.x + this.player.width / 2, 
                             this.player.y + this.player.height / 2, '#ff0000', 20);
        }
      }
    }
  }
  
  circleRectCollision(cx: number, cy: number, cr: number, 
                     rx: number, ry: number, rw: number, rh: number): boolean {
    const testX = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    const testY = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    const distX = cx - testX;
    const distY = cy - testY;
    return (distX * distX + distY * distY) < (cr * cr);
  }
  
  rectCollision(x1: number, y1: number, w1: number, h1: number,
               x2: number, y2: number, w2: number, h2: number): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }
  
  createParticles(x: number, y: number, color: string, count: number = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 30 + Math.random() * 30,
        color,
        size: Math.random() * 4 + 2
      });
    }
  }
  
  render() {
    // Clear
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    
    // Grid background
    this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < this.canvasWidth; i += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, 0);
      this.ctx.lineTo(i, this.canvasHeight);
      this.ctx.stroke();
    }
    for (let i = 0; i < this.canvasHeight; i += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, i);
      this.ctx.lineTo(this.canvasWidth, i);
      this.ctx.stroke();
    }
    
    // Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / 60;
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    this.ctx.globalAlpha = 1;
    
    // Player
    if (this.player.invulnerable > 0 && Math.floor(this.player.invulnerable / 5) % 2 === 0) {
      this.ctx.globalAlpha = 0.5;
    }
    this.ctx.fillStyle = '#00ff00';
    this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
    this.ctx.strokeStyle = '#00ff00';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(this.player.x - 2, this.player.y - 2, 
                       this.player.width + 4, this.player.height + 4);
    this.ctx.globalAlpha = 1;
    
    // Aim line
    if (this.gameStarted && !this.gameOver) {
      this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(this.player.x + this.player.width / 2, 
                     this.player.y + this.player.height / 2);
      this.ctx.lineTo(this.mouseX, this.mouseY);
      this.ctx.stroke();
    }
    
    // Bullets
    this.bullets.forEach(bullet => {
      this.ctx.fillStyle = bullet.fromPlayer ? '#00ffff' : '#ff0000';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = bullet.fromPlayer ? '#00ffff' : '#ff0000';
      this.ctx.beginPath();
      this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    });
    
    // Enemies
    this.enemies.forEach(enemy => {
      const colors = {
        basic: '#888888',
        fast: '#ff00ff',
        tank: '#ffaa00',
        shooter: '#ff0000',
        boss: '#ff0000'
      };
      
      this.ctx.fillStyle = colors[enemy.type];
      this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      
      // Health bar
      const healthPercent = enemy.health / enemy.maxHealth;
      this.ctx.fillStyle = '#300';
      this.ctx.fillRect(enemy.x, enemy.y - 8, enemy.width, 4);
      this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
      this.ctx.fillRect(enemy.x, enemy.y - 8, enemy.width * healthPercent, 4);
      
      // Glow effect
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = colors[enemy.type];
      this.ctx.strokeStyle = colors[enemy.type];
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
      this.ctx.shadowBlur = 0;
    });
  }
  
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
