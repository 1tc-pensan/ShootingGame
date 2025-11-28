import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription, fromEvent } from 'rxjs';
import { AuthService } from '../auth/auth.service';

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  invulnerable: number;
  color: string;
  shape: 'square' | 'circle' | 'triangle' | 'diamond';
}

interface PlayerCustomization {
  color: string;
  shape: 'square' | 'circle' | 'triangle' | 'diamond';
  backgroundColor: string;
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
  type: 'basic' | 'fast' | 'tank' | 'shooter' | 'boss' | 'boss_tank' | 'boss_speed' | 'boss_sniper' | 'healer' | 'exploder' | 'dodger' | 'miniboss';
  shootTimer: number;
  movePattern: number;
  bossType?: 'normal' | 'tank' | 'speed' | 'sniper';
  dodgeTimer?: number;
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

interface LeaderboardEntry {
  name: string;
  score: number;
  wave: number;
  kills: number;
  date: string;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  condition: (stats: GameStats) => boolean;
}

interface GameStats {
  score: number;
  wave: number;
  kills: number;
  totalGamesPlayed: number;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'health' | 'speed' | 'firerate' | 'shield';
  size: number;
  lifetime: number;
}

interface ComboSystem {
  count: number;
  multiplier: number;
  timer: number;
}

interface DamageNumber {
  x: number;
  y: number;
  value: number;
  life: number;
  vy: number;
  color: string;
}

interface SpawnWarning {
  x: number;
  y: number;
  life: number;
  type: Enemy['type'];
}

interface WeaponUpgrade {
  level: number;
  bulletCount: number;
  bulletSpread: number;
  bulletSize: number;
}

interface Weapon {
  id: string;
  name: string;
  description: string;
  fireRate: number;
  bulletCount: number;
  bulletSpeed: number;
  bulletSize: number;
  damage: number;
  spreadAngle: number;
  color: string;
  specialEffect?: 'explosive' | 'pierce' | 'homing' | 'freeze';
}

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  currentLevel: number;
  cost: number;
  effect: SkillEffect;
}

interface SkillEffect {
  type: 'damage' | 'health' | 'speed' | 'firerate' | 'crit' | 'regen' | 'dodge' | 'vampirism' | 'pierce' | 'explosion';
  value: number;
  perLevel: number;
}

interface ColorOption {
  name: string;
  value: string;
  glowColor: string;
}

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="game-container" [class.game-over]="gameOver">
      <!-- Google AdSense Banner Top -->
      <div class="ad-banner-top" id="ad-banner-top">
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-5062569894299417"
             data-ad-slot="1234567890"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
      </div>
      
      <div class="hud">
        <div class="health-bar">
          <div class="health-label">HP</div>
          <div class="health-bg">
            <div class="health-fill" [style.width.%]="Math.max(0, (player.health / player.maxHealth) * 100)"></div>
          </div>
          <div class="health-text">{{ Math.max(0, player.health) }} / {{ player.maxHealth }}</div>
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
          <div class="stat" *ngIf="combo.count > 1">
            <span class="label">COMBO:</span>
            <span class="value combo-value">{{ combo.count }}x</span>
          </div>
        </div>
        
        <div class="ultimate-bar">
          <div class="ultimate-label">⚡ ULTIMATE</div>
          <div class="ultimate-bg">
            <div class="ultimate-fill" [style.width.%]="(ultimateCharge / ultimateMaxCharge) * 100"></div>
          </div>
          <div class="ultimate-key" [class.ready]="ultimateCharge >= ultimateMaxCharge && ultimateCooldown === 0">
            <span *ngIf="ultimateCooldown > 0">Q - CD: {{ (ultimateCooldown / 60).toFixed(1) }}s</span>
            <span *ngIf="ultimateCooldown === 0 && ultimateCharge >= ultimateMaxCharge">Q - READY!</span>
            <span *ngIf="ultimateCooldown === 0 && ultimateCharge < ultimateMaxCharge">Q - {{ ultimateCharge }}/{{ ultimateMaxCharge }}</span>
          </div>
        </div>
      </div>
      
      <!-- Global Announcement Banner -->
      <div class="announcement-banner" *ngIf="globalAnnouncement">
        <span class="announce-icon">📢</span>
        <span class="announce-text">{{globalAnnouncement}}</span>
        <span class="announce-icon">📢</span>
      </div>
      
      <div class="active-powerups" *ngIf="activePowerUps.length > 0">
        <div *ngFor="let powerup of activePowerUps" class="powerup-indicator" [class]="'powerup-' + powerup.type">
          <span class="powerup-icon">{{ getPowerUpIcon(powerup.type) }}</span>
          <span class="powerup-time">{{ (powerup.duration / 60).toFixed(1) }}s</span>
        </div>
      </div>
      
      <div class="weapon-info">
        <div class="weapon-current">{{ currentWeapon.name }}</div>
        <div class="weapon-level">🔫 WEAPON LV.{{ weaponLevel }}</div>
        <div class="kill-streak" *ngIf="killStreak >= 5">
          🔥 {{ killStreak }} KILL STREAK!
        </div>
        <div class="slow-motion-info" *ngIf="killStreak >= 10">
          <span *ngIf="slowMotionCooldown > 0">⏱️ E - CD: {{ (slowMotionCooldown / 60).toFixed(1) }}s</span>
          <span *ngIf="slowMotionCooldown === 0" class="ready">⏱️ E - READY!</span>
        </div>
      </div>
      
      <div class="mini-map">
        <div class="mini-map-title">RADAR</div>
        <canvas #miniMapCanvas width="150" height="150"></canvas>
      </div>
      
      <canvas 
        #gameCanvas 
        [width]="canvasWidth" 
        [height]="canvasHeight">
      </canvas>
      
      <div class="game-over-screen" *ngIf="gameOver">
        <h1>GAME OVER</h1>
        
        <!-- Interstitial Ad -->
        <div class="ad-interstitial" id="ad-interstitial">
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="ca-pub-5062569894299417"
               data-ad-slot="9876543210"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <button class="ad-close" [class.active]="adTimer <= 0" (click)="closeAd()">
            {{ adTimer > 0 ? 'Skip Ad (' + adTimer + 's)' : 'Close Ad' }}
          </button>
        </div>
        
        <div class="final-stats">
          <p>Final Score: <strong>{{ score }}</strong></p>
          <p>Wave Reached: <strong>{{ wave }}</strong></p>
          <p>Enemies Killed: <strong>{{ kills }}</strong></p>
          <p *ngIf="isLoggedIn">Player: <strong>{{ currentUsername }}</strong></p>
        </div>
        <div class="submit-score-section" *ngIf="!playerNameSubmitted">
          <button (click)="submitScore()" class="submit-btn" *ngIf="isLoggedIn">
            💾 SAVE SCORE
          </button>
          <p class="auth-warning" *ngIf="!isLoggedIn">
            ⚠️ Bejelentkezés szükséges a pontszám mentéséhez!
          </p>
        </div>
        <button (click)="watchAdForContinue()" class="rewarded-ad-btn" *ngIf="!adWatched">
          📺 Watch Ad to Continue
        </button>
        <button (click)="restart()" class="restart-btn">RESTART</button>
      </div>
      
      <div class="leaderboard" *ngIf="showLeaderboard">
        <div class="leaderboard-header">
          <h2>🏆 LEADERBOARD 🏆</h2>
          <button (click)="toggleLeaderboard()" class="close-btn">✕</button>
        </div>
        <div class="leaderboard-tabs">
          <button 
            class="tab-btn" 
            [class.active]="leaderboardType === '24h'"
            (click)="switchLeaderboardType('24h')">
            📅 24 HOURS
          </button>
          <button 
            class="tab-btn" 
            [class.active]="leaderboardType === 'alltime'"
            (click)="switchLeaderboardType('alltime')">
            ⏳ ALL TIME
          </button>
        </div>
        <div class="leaderboard-list">
          <div class="leaderboard-entry header-entry">
            <span class="rank">#</span>
            <span class="name">NAME</span>
            <span class="score-col">SCORE</span>
            <span class="wave-col">WAVE</span>
            <span class="kills-col">KILLS</span>
            <span class="action-col" *ngIf="authService.isAdmin"></span>
          </div>
          <div 
            *ngFor="let entry of (leaderboardType === '24h' ? leaderboard24h : leaderboardAllTime); let i = index" 
            class="leaderboard-entry"
            [class.highlight]="entry.name === currentUsername && justSubmitted"
            [class.current-player]="entry.name.toLowerCase() === currentUsername.toLowerCase()">
            <span class="rank">{{ i + 1 }}</span>
            <span class="name">
              {{ entry.name }}
              <span class="you-badge" *ngIf="entry.name.toLowerCase() === currentUsername.toLowerCase()"> (YOU)</span>
            </span>
            <span class="score-col">{{ entry.score }}</span>
            <span class="wave-col">{{ entry.wave }}</span>
            <span class="kills-col">{{ entry.kills }}</span>
            <span class="action-col" *ngIf="authService.isAdmin">
              <button class="edit-score-btn" (click)="openEditScoreModal(entry)" title="Edit Score">✏️</button>
            </span>
          </div>
        </div>
      </div>

      <!-- Edit Score Modal -->
      <div class="edit-score-modal" *ngIf="showEditScoreModal && authService.isAdmin">
        <div class="edit-score-content">
          <h2>✏️ Edit Score</h2>
          <div class="edit-form">
            <label>
              Player: <strong>{{ editingScore?.name }}</strong>
            </label>
            <label>
              Score:
              <input type="number" [(ngModel)]="editScoreData.score" placeholder="Score">
            </label>
            <label>
              Wave:
              <input type="number" [(ngModel)]="editScoreData.wave" placeholder="Wave">
            </label>
            <label>
              Kills:
              <input type="number" [(ngModel)]="editScoreData.kills" placeholder="Kills">
            </label>
          </div>
          <div class="edit-actions">
            <button class="save-btn" (click)="saveEditedScore()">💾 Save</button>
            <button class="cancel-btn" (click)="closeEditScoreModal()">❌ Cancel</button>
          </div>
        </div>
      </div>
      
      <button 
        *ngIf="!showLeaderboard && gameStarted" 
        (click)="toggleLeaderboard()" 
        class="leaderboard-toggle">
        🏆 LEADERBOARD
      </button>
      
      <button 
        *ngIf="!showAchievements && gameStarted" 
        (click)="toggleAchievements()" 
        class="achievements-toggle">
        🎖️ ACHIEVEMENTS
      </button>
      
      <button 
        *ngIf="!showSkills && gameStarted" 
        (click)="toggleSkills()" 
        class="skills-toggle">
        🌟 SKILLS
      </button>
      
      <button 
        *ngIf="!showAdminPanel && authService.isAdmin" 
        (click)="toggleAdminPanel()" 
        class="admin-toggle">
        ⚙️ ADMIN
      </button>
      
      <a 
        href="https://ko-fi.com/szeretemakiflit" 
        target="_blank"
        *ngIf="gameStarted"
        class="support-btn">
        ☕ SUPPORT ME
      </a>
      
      <button 
        *ngIf="gameStarted && !gameOver" 
        (click)="togglePause()" 
        class="pause-btn">
        {{ isPaused ? '▶️' : '⏸️' }}
      </button>
      
      <div class="pause-overlay" *ngIf="isPaused && !gameOver">
        <div class="pause-menu">
          <h1>⏸️ PAUSED</h1>
          <p>Press ESC or click Resume to continue</p>
          <button (click)="togglePause()" class="resume-btn">▶️ RESUME</button>
          <button (click)="restart()" class="restart-btn-pause">🔄 RESTART</button>
        </div>
      </div>
      
      <div class="achievement-notification" *ngIf="currentUnlockNotification">
        <div class="achievement-badge">
          <div class="achievement-icon">{{ currentUnlockNotification.icon }}</div>
          <div class="achievement-info">
            <div class="achievement-title">🎉 ACHIEVEMENT UNLOCKED!</div>
            <div class="achievement-name">{{ currentUnlockNotification.title }}</div>
            <div class="achievement-desc">{{ currentUnlockNotification.description }}</div>
          </div>
        </div>
      </div>
      
      <div class="achievements-panel" *ngIf="showAchievements">
        <div class="achievements-header">
          <h2>🎖️ ACHIEVEMENTS 🎖️</h2>
          <button (click)="toggleAchievements()" class="close-btn">✕</button>
        </div>
        <div class="achievements-progress">
          <span>{{ unlockedCount }} / {{ achievements.length }} Unlocked</span>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="(unlockedCount / achievements.length) * 100"></div>
          </div>
        </div>
        <div class="achievements-list">
          <div 
            *ngFor="let achievement of achievements" 
            class="achievement-item"
            [class.unlocked]="achievement.unlocked"
            [class.locked]="!achievement.unlocked">
            <div class="achievement-item-icon">{{ achievement.icon }}</div>
            <div class="achievement-item-info">
              <div class="achievement-item-title">{{ achievement.title }}</div>
              <div class="achievement-item-desc">{{ achievement.description }}</div>
            </div>
            <div class="achievement-status">
              {{ achievement.unlocked ? '✓' : '🔒' }}
            </div>
          </div>
        </div>
      </div>

      <!-- Skills Panel -->
      <div class="skills-panel" *ngIf="showSkills">
        <div class="skills-header">
          <h2>🌟 SKILLS 🌟</h2>
          <button (click)="toggleSkills()" class="close-btn">✕</button>
        </div>
        <div class="skills-points">
          <span>Available Points: <span class="points-value">{{skillPoints}}</span></span>
        </div>
        <div class="skills-list">
          <div *ngFor="let skill of skills" class="skill-item">
            <div class="skill-icon">{{skill.icon}}</div>
            <div class="skill-info">
              <div class="skill-name">{{skill.name}}</div>
              <div class="skill-desc">{{skill.description}}</div>
              <div class="skill-level">
                <span class="level-text">Level: {{skill.currentLevel}}/{{skill.maxLevel}}</span>
                <div class="level-bar">
                  <div class="level-fill" [style.width.%]="(skill.currentLevel / skill.maxLevel) * 100"></div>
                </div>
              </div>
            </div>
            <button 
              class="upgrade-btn" 
              (click)="upgradeSkill(skill.id)"
              [disabled]="skill.currentLevel >= skill.maxLevel || skillPoints < skill.cost">
              <span *ngIf="skill.currentLevel < skill.maxLevel">↑ {{skill.cost}}</span>
              <span *ngIf="skill.currentLevel >= skill.maxLevel">MAX</span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Admin Panel -->
      <div class="admin-panel" *ngIf="showAdminPanel && authService.isAdmin">
        <div class="admin-header">
          <h2>⚙️ ADMIN PANEL ⚙️</h2>
          <button (click)="toggleAdminPanel()" class="close-btn">✕</button>
        </div>
        
        <div class="admin-tabs">
          <button 
            class="admin-tab-btn" 
            [class.active]="adminTab === 'stats'"
            (click)="adminTab = 'stats'; loadAdminStats()">
            📊 STATS
          </button>
          <button 
            class="admin-tab-btn" 
            [class.active]="adminTab === 'users'"
            (click)="adminTab = 'users'; loadAdminUsers()">
            👥 USERS
          </button>
          <button 
            class="admin-tab-btn" 
            [class.active]="adminTab === 'scores'"
            (click)="adminTab = 'scores'; loadAdminScores()">
            🏆 SCORES
          </button>
          <button 
            class="admin-tab-btn" 
            [class.active]="adminTab === 'announce'"
            (click)="adminTab = 'announce'">
            📢 ANNOUNCE
          </button>
        </div>
        
        <div class="admin-content">
          <!-- Stats Tab -->
          <div *ngIf="adminTab === 'stats'" class="admin-stats">
            <div class="stat-grid">
              <div class="stat-card">
                <div class="stat-icon">👥</div>
                <div class="stat-value">{{adminStats.totalUsers}}</div>
                <div class="stat-label">Total Users</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">🎮</div>
                <div class="stat-value">{{adminStats.totalScores}}</div>
                <div class="stat-label">Total Games</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">⭐</div>
                <div class="stat-value">{{adminStats.topScore}}</div>
                <div class="stat-label">Top Score</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">💀</div>
                <div class="stat-value">{{adminStats.totalKills}}</div>
                <div class="stat-label">Total Kills</div>
              </div>
              <div class="stat-card">
                <div class="stat-icon">🌊</div>
                <div class="stat-value">{{adminStats.maxWave}}</div>
                <div class="stat-label">Max Wave</div>
              </div>
            </div>
            
            <h3>🚨 Suspicious Scores</h3>
            <div class="suspicious-list">
              <div *ngFor="let score of adminStats.suspiciousScores" class="suspicious-item">
                <span>{{score.username}}</span>
                <span>Score: {{score.score}}</span>
                <span>Wave: {{score.wave}}</span>
                <button (click)="deleteScore(score.id)" class="delete-btn">🗑️</button>
              </div>
            </div>
          </div>
          
          <!-- Users Tab -->
          <div *ngIf="adminTab === 'users'" class="admin-users">
            <div class="user-list">
              <div *ngFor="let user of adminUsers" class="user-item">
                <div class="user-info-admin">
                  <span class="user-id">#{{user.id}}</span>
                  <span class="user-name">{{user.username}}</span>
                  <span class="user-email">{{user.email || 'No email'}}</span>
                  <span class="user-scores">{{user.score_count}} games</span>
                  <span class="user-best">Best: {{user.best_score || 0}}</span>
                </div>
                <button 
                  *ngIf="user.id !== 1" 
                  (click)="deleteUser(user.id)" 
                  class="delete-btn">
                  🗑️ DELETE
                </button>
              </div>
            </div>
          </div>
          
          <!-- Scores Tab -->
          <div *ngIf="adminTab === 'scores'" class="admin-scores">
            <div class="score-list">
              <div *ngFor="let score of adminScores" class="score-item">
                <span>{{score.username}}</span>
                <span>{{score.score}} pts</span>
                <span>W{{score.wave}}</span>
                <span>{{score.kills}} kills</span>
                <button (click)="deleteScore(score.id)" class="delete-btn">🗑️</button>
              </div>
            </div>
            <div class="pagination">
              <button (click)="adminScorePage = adminScorePage - 1; loadAdminScores()" 
                      [disabled]="adminScorePage === 1">
                ◀ Prev
              </button>
              <span>Page {{adminScorePage}} / {{adminScoreTotalPages}}</span>
              <button (click)="adminScorePage = adminScorePage + 1; loadAdminScores()" 
                      [disabled]="adminScorePage >= adminScoreTotalPages">
                Next ▶
              </button>
            </div>
          </div>
          
          <!-- Announcement Tab -->
          <div *ngIf="adminTab === 'announce'" class="admin-announce">
            <h3>📢 Global Announcement</h3>
            <textarea 
              [(ngModel)]="announcementText" 
              placeholder="Enter announcement message..."
              class="announce-textarea"></textarea>
            <div class="announce-buttons">
              <button (click)="setAnnouncement()" class="set-announce-btn">📢 SET ANNOUNCEMENT</button>
              <button (click)="clearAnnouncement()" class="clear-announce-btn">❌ CLEAR</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="instructions" *ngIf="!gameStarted && !gameOver">
        <h1>🎮 BULLET HELL SURVIVOR 🎮</h1>
        <div class="game-description">
          <p><strong>Kemény bullet hell akció!</strong> Élj túl végtelen ellenséges hullámokat!</p>
          <p>🎯 Különböző ellenség típusok • 💪 Boss minden 5. hullámban • ⚡ Power-upok és fejlesztések</p>
        </div>

        <!-- Login/Register Section -->
        <div class="auth-section" *ngIf="!isLoggedIn">
          <h2>🔐 Bejelentkezés / Regisztráció</h2>
          <div class="auth-tabs">
            <button 
              class="auth-tab-btn" 
              [class.active]="authMode === 'login'"
              (click)="authMode = 'login'">
              BEJELENTKEZÉS
            </button>
            <button 
              class="auth-tab-btn" 
              [class.active]="authMode === 'register'"
              (click)="authMode = 'register'">
              REGISZTRÁCIÓ
            </button>
          </div>
          
          <div class="auth-form">
            <div class="auth-error" *ngIf="authError">{{ authError }}</div>
            
            <input 
              type="text" 
              [(ngModel)]="authUsername" 
              placeholder="Felhasználónév"
              class="auth-input"
              maxlength="15">
            
            <input 
              type="password" 
              [(ngModel)]="authPassword" 
              placeholder="Jelszó"
              class="auth-input"
              (keyup.enter)="handleAuth()">
            
            <input 
              *ngIf="authMode === 'register'"
              type="email" 
              [(ngModel)]="authEmail" 
              placeholder="Email (opcionális)"
              class="auth-input">
            
            <button (click)="handleAuth()" class="auth-submit-btn">
              {{ authMode === 'login' ? 'BEJELENTKEZÉS' : 'REGISZTRÁCIÓ' }}
            </button>
            
            <p class="auth-info">A ranglista mentéséhez bejelentkezés szükséges!</p>
          </div>
        </div>
        
        <div class="user-info" *ngIf="isLoggedIn">
          <p>
            👤 Bejelentkezve: <strong>{{ currentUsername }}</strong>
            <span class="admin-badge" *ngIf="authService.isAdmin">⭐ ADMIN</span>
          </p>
          <button (click)="handleLogout()" class="logout-btn">Kijelentkezés</button>
        </div>
        
        <!-- Character Customization -->
        <div class="customization-section">
          <h2>🎨 Karakter Testreszabás</h2>
          <div class="customization-grid">
            <div class="customization-option">
              <h3>Karakter Szín:</h3>
              <div class="color-options">
                <button 
                  *ngFor="let color of colorOptions"
                  class="color-btn"
                  [style.background]="color.value"
                  [style.box-shadow]="'0 0 10px ' + color.glowColor"
                  [class.selected]="playerCustomization.color === color.value"
                  (click)="selectColor(color.value)"
                  [title]="color.name">
                  {{ playerCustomization.color === color.value ? '✓' : '' }}
                </button>
              </div>
            </div>
            <div class="customization-option">
              <h3>Forma:</h3>
              <div class="shape-options">
                <button 
                  class="shape-btn"
                  [class.selected]="playerCustomization.shape === 'square'"
                  (click)="selectShape('square')">
                  ⬛ Négyzet
                </button>
                <button 
                  class="shape-btn"
                  [class.selected]="playerCustomization.shape === 'circle'"
                  (click)="selectShape('circle')">
                  ⭕ Kör
                </button>
                <button 
                  class="shape-btn"
                  [class.selected]="playerCustomization.shape === 'triangle'"
                  (click)="selectShape('triangle')">
                  🔺 Háromszög
                </button>
                <button 
                  class="shape-btn"
                  [class.selected]="playerCustomization.shape === 'diamond'"
                  (click)="selectShape('diamond')">
                  💎 Gyémánt
                </button>
              </div>
            </div>
            <div class="customization-option full-width">
              <h3>Háttér Szín:</h3>
              <div class="color-options">
                <button 
                  *ngFor="let bgColor of backgroundColorOptions"
                  class="color-btn"
                  [style.background]="bgColor.value"
                  [style.box-shadow]="'0 0 10px ' + bgColor.glowColor"
                  [class.selected]="playerCustomization.backgroundColor === bgColor.value"
                  (click)="selectBackgroundColor(bgColor.value)"
                  [title]="bgColor.name">
                  {{ playerCustomization.backgroundColor === bgColor.value ? '✓' : '' }}
                </button>
              </div>
            </div>
          </div>
          <div class="customization-preview">
            <p>Előnézet:</p>
            <canvas #previewCanvas width="100" height="100"></canvas>
          </div>
        </div>
        
        <div class="controls">
          <h2>Controls:</h2>
          <p><strong>W A S D</strong> or <strong>Arrow Keys</strong> - Move</p>
          <p><strong>SPACE</strong> - Shoot</p>
          <p><strong>Mouse</strong> - Aim direction</p>
          <p><strong>Q</strong> - Ultimate (15s cooldown)</p>
          <p><strong>Shift</strong> - Dash</p>
          <p><strong>E</strong> - Slow Motion (10+ kill streak)</p>
        </div>
        <div class="gameplay-info">
          <h2>Gameplay:</h2>
          <p>• Ölj ellenségeket és szerezz pontokat</p>
          <p>• Minden 25 kill után fejlődik a fegyvered (max 5 shot)</p>
          <p>• Tartsd fenn a combót a magasabb pontszámért (max 5x)</p>
          <p>• Boss minden 5. hullámban - nehezedő kihívás!</p>
          <p>• Power-upok: ❤️ Élet, ⚡ Sebesség, 🔫 Tűzgyorsaság, 🛡️ Pajzs</p>
          <p>• A nehézség minden hullámmal nő (+20% HP, +8% sebesség)</p>
        </div>
        <div class="enemy-types">
          <h2>Enemy Types:</h2>
          <p><span class="enemy-basic">█</span> Basic - Slow, weak</p>
          <p><span class="enemy-fast">█</span> Fast - Quick, low HP</p>
          <p><span class="enemy-tank">█</span> Tank - Slow, high HP</p>
          <p><span class="enemy-shooter">█</span> Shooter - Shoots at you!</p>
          <p><span class="enemy-boss">█</span> Boss - Massive HP, shoots patterns</p>
        </div>
        
        <div class="weapon-selection-menu">
          <h2>🔫 Válassz fegyvert!</h2>
          <div class="weapon-grid">
            <button *ngFor="let weapon of weapons" 
                    (click)="selectWeapon(weapon)"
                    [class.selected]="currentWeapon.id === weapon.id"
                    class="weapon-card">
              <div class="weapon-name">{{ weapon.name }}</div>
              <div class="weapon-desc">{{ weapon.description }}</div>
              <div class="weapon-stats">
                <span>⚡ {{ 1000 / weapon.fireRate | number:'1.1-1' }}/s</span>
                <span>💥 {{ weapon.damage }}</span>
                <span>🎯 {{ weapon.bulletCount }}</span>
              </div>
            </button>
          </div>
        </div>
        
        <button (click)="startGame()" class="start-btn">START GAME</button>
        <div class="copyright">
          <p>© 2025 Bullet Hell Survivor. All rights reserved.</p>
          <p>Made with ❤️ by <a href="https://ko-fi.com/szeretemakiflit" target="_blank">szeretemakiflit</a></p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .game-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      min-height: -webkit-fill-available;
      font-family: 'Courier New', monospace;
      position: relative;
      overflow: hidden;
      overflow-x: hidden;
      width: 100%;
      max-width: 100vw;
    }
    
    .ad-banner-top {
      width: 100%;
      max-width: 1200px;
      min-height: 90px;
      background: rgba(0, 0, 0, 0.9);
      border-bottom: 2px solid #333;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 10px;
    }
    
    .ad-interstitial {
      position: relative;
      width: 100%;
      max-width: 728px;
      min-height: 250px;
      background: rgba(0, 0, 0, 0.95);
      border: 2px solid #ffaa00;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .ad-close {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(100, 100, 100, 0.8);
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 5px;
      cursor: not-allowed;
      font-size: 0.9em;
      font-weight: bold;
    }
    
    .ad-close.active {
      background: #00ff00;
      cursor: pointer;
      box-shadow: 0 0 10px #00ff00;
    }
    
    .rewarded-ad-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: 2px solid #fff;
      padding: 15px 30px;
      font-size: 1.1em;
      border-radius: 10px;
      cursor: pointer;
      margin: 10px;
      font-weight: bold;
      box-shadow: 0 0 20px rgba(102, 126, 234, 0.5);
      transition: all 0.3s;
    }
    
    .rewarded-ad-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 0 30px rgba(102, 126, 234, 0.8);
    }
    
    .game-container.game-over {
      background: #1a0000;
    }
    
    .hud {
      width: 100%;
      max-width: 1200px;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(20, 20, 30, 0.9);
      border-bottom: 3px solid #00ff00;
      box-shadow: 0 4px 20px rgba(0, 255, 0, 0.3);
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .ultimate-bar {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .ultimate-label {
      color: #ffaa00;
      font-size: 16px;
      font-weight: bold;
      text-shadow: 0 0 10px #ffaa00;
      min-width: 120px;
    }
    
    .ultimate-bg {
      flex: 1;
      height: 20px;
      background: #1a1a2a;
      border: 2px solid #ffaa00;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.5);
    }
    
    .ultimate-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff6600, #ffaa00, #ffd700);
      transition: width 0.3s ease;
      box-shadow: 0 0 15px rgba(255, 170, 0, 0.9);
      animation: shimmer 2s infinite;
    }
    
    @keyframes shimmer {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 1; }
    }
    
    .ultimate-key {
      color: #888;
      font-size: 14px;
      font-weight: bold;
      min-width: 150px;
      text-align: right;
    }
    
    .ultimate-key.ready {
      color: #ffd700;
      text-shadow: 0 0 15px #ffd700;
      animation: pulse 0.5s ease-in-out infinite;
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
    
    .combo-value {
      color: #ff00ff;
      text-shadow: 0 0 15px #ff00ff;
      animation: pulse 0.5s ease-in-out infinite;
    }
    
    .active-powerups {
      position: absolute;
      top: 100px;
      left: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 100;
    }
    
    .powerup-indicator {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 15px;
      border-radius: 10px;
      font-weight: bold;
      box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);
      animation: pulse 1s ease-in-out infinite;
    }
    
    .powerup-health {
      background: rgba(0, 255, 0, 0.3);
      border: 2px solid #00ff00;
      color: #00ff00;
    }
    
    .powerup-speed {
      background: rgba(0, 255, 255, 0.3);
      border: 2px solid #00ffff;
      color: #00ffff;
    }
    
    .powerup-firerate {
      background: rgba(255, 165, 0, 0.3);
      border: 2px solid #ffa500;
      color: #ffa500;
    }
    
    .powerup-shield {
      background: rgba(138, 43, 226, 0.3);
      border: 2px solid #8a2be2;
      color: #8a2be2;
    }
    
    .powerup-icon {
      font-size: 1.5em;
    }
    
    .powerup-time {
      font-family: 'Courier New', monospace;
    }
    
    .weapon-info {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 100;
    }
    
    .weapon-level {
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid #ffaa00;
      color: #ffaa00;
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 1.2em;
      text-shadow: 0 0 10px #ffaa00;
      box-shadow: 0 0 15px rgba(255, 170, 0, 0.5);
    }
    
    .kill-streak {
      background: rgba(255, 0, 0, 0.8);
      border: 2px solid #ff0000;
      color: #fff;
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 1.1em;
      text-shadow: 0 0 10px #ff0000;
      box-shadow: 0 0 15px rgba(255, 0, 0, 0.5);
      animation: pulse 0.5s ease-in-out infinite;
    }
    
    .slow-motion-info {
      background: rgba(0, 255, 255, 0.8);
      border: 2px solid #00ffff;
      color: #fff;
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 1em;
      text-shadow: 0 0 10px #00ffff;
      box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
      margin-top: 10px;
    }
    
    .slow-motion-info .ready {
      color: #00ff00;
      text-shadow: 0 0 15px #00ff00;
      animation: pulse 0.5s ease-in-out infinite;
    }
    
    .weapon-current {
      background: rgba(0, 255, 255, 0.2);
      border: 2px solid #00ffff;
      color: #00ffff;
      padding: 10px 20px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 1.1em;
      text-shadow: 0 0 10px #00ffff;
      box-shadow: 0 0 15px rgba(0, 255, 255, 0.5);
      margin-bottom: 10px;
      text-align: center;
    }
    
    .mini-map {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.95);
      border: 3px solid #00ff00;
      border-radius: 10px;
      padding: 10px;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
      z-index: 100;
      transition: all 0.3s ease;
    }
    
    .mini-map:hover {
      box-shadow: 0 0 30px rgba(0, 255, 0, 0.8);
      transform: scale(1.05);
    }
    
    .mini-map-title {
      color: #00ff00;
      font-weight: bold;
      text-align: center;
      margin-bottom: 5px;
      font-size: 0.9em;
      text-shadow: 0 0 5px #00ff00;
      letter-spacing: 2px;
    }
    
    .mini-map canvas {
      border: 1px solid #00ff00;
      background: #000;
      display: block;
      image-rendering: pixelated;
      image-rendering: crisp-edges;
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
      padding: 30px;
      border: 4px solid #00ff00;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 0 50px rgba(0, 255, 0, 0.5);
      color: white;
      max-width: 600px;
      max-height: 85vh;
      overflow-y: auto;
    }
    
    .instructions::-webkit-scrollbar {
      width: 10px;
    }
    
    .instructions::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.5);
      border-radius: 10px;
    }
    
    .instructions::-webkit-scrollbar-thumb {
      background: #00ff00;
      border-radius: 10px;
      box-shadow: 0 0 10px #00ff00;
    }
    
    .instructions::-webkit-scrollbar-thumb:hover {
      background: #00ff00;
      box-shadow: 0 0 20px #00ff00;
    }
    
    .instructions h1 {
      color: #00ff00;
      font-size: 2em;
      margin-bottom: 20px;
      text-shadow: 0 0 20px #00ff00;
    }
    
    .instructions h2 {
      color: #00ffff;
      margin: 15px 0 8px 0;
      font-size: 1.3em;
      text-shadow: 0 0 10px #00ffff;
    }
    
    .instructions p {
      margin: 6px 0;
      font-size: 0.95em;
    }
    
    .game-description {
      background: rgba(0, 255, 0, 0.1);
      border: 2px solid #00ff00;
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .game-description p {
      margin: 5px 0;
      font-size: 1em;
    }
    
    .game-description strong {
      color: #00ff00;
    }
    
    .controls, .enemy-types, .gameplay-info {
      margin: 20px 0;
      text-align: left;
    }
    
    .gameplay-info {
      background: rgba(0, 255, 255, 0.05);
      border: 2px solid #00ffff;
      border-radius: 10px;
      padding: 15px;
    }
    
    .gameplay-info p {
      font-size: 0.95em;
    }
    
    .enemy-basic { color: #888; }
    .enemy-fast { color: #ff00ff; }
    .enemy-tank { color: #ffaa00; }
    .enemy-shooter { color: #ff0000; }
    .enemy-boss { color: #ff0000; font-size: 1.5em; }
    
    .weapon-selection-menu {
      margin: 30px 0;
      width: 100%;
      max-width: 900px;
    }
    
    .weapon-selection-menu h2 {
      color: #00ffff;
      text-align: center;
      font-size: 2em;
      margin-bottom: 20px;
      text-shadow: 0 0 20px #00ffff;
      animation: pulse 2s ease-in-out infinite;
    }
    
    .weapon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      padding: 20px;
    }
    
    .weapon-card {
      background: rgba(0, 0, 0, 0.8);
      border: 2px solid #666;
      border-radius: 10px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: center;
    }
    
    .weapon-card:hover {
      border-color: #00ffff;
      box-shadow: 0 0 20px rgba(0, 255, 255, 0.5);
      transform: translateY(-5px);
    }
    
    .weapon-card.selected {
      border-color: #00ff00;
      background: rgba(0, 255, 0, 0.1);
      box-shadow: 0 0 30px rgba(0, 255, 0, 0.8);
    }
    
    .weapon-name {
      font-size: 1.5em;
      font-weight: bold;
      color: #fff;
      margin-bottom: 10px;
    }
    
    .weapon-desc {
      color: #aaa;
      font-size: 0.9em;
      margin-bottom: 15px;
      min-height: 40px;
    }
    
    .weapon-stats {
      display: flex;
      justify-content: space-around;
      color: #00ffff;
      font-size: 0.85em;
      font-weight: bold;
    }
    
    .weapon-stats span {
      padding: 5px 10px;
      background: rgba(0, 255, 255, 0.1);
      border-radius: 5px;
    }
    
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
    
    .copyright {
      margin-top: 30px;
      padding: 20px;
      text-align: center;
      color: #00ff00;
      font-size: 0.85em;
      opacity: 0.8;
      border-top: 1px solid rgba(0, 255, 0, 0.3);
    }
    
    .copyright p {
      margin: 5px 0;
      text-shadow: 0 0 5px rgba(0, 255, 0, 0.5);
    }
    
    .copyright a {
      color: #00ff00;
      text-decoration: none;
      font-weight: bold;
      transition: all 0.3s;
    }
    
    .copyright a:hover {
      color: #00ffff;
      text-shadow: 0 0 10px rgba(0, 255, 255, 0.8);
    }
    
    .customization-section {
      margin: 20px 0;
      padding: 20px;
      background: rgba(0, 255, 0, 0.05);
      border: 2px solid rgba(0, 255, 0, 0.3);
      border-radius: 10px;
    }
    
    .customization-section h2 {
      color: #00ff00;
      text-shadow: 0 0 10px #00ff00;
      margin-bottom: 15px;
    }
    
    .customization-section h3 {
      color: #00ff00;
      font-size: 0.9em;
      margin-bottom: 10px;
    }
    
    .customization-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    
    .customization-option.full-width {
      grid-column: 1 / -1;
    }
    
    .customization-option {
      text-align: center;
    }
    
    .color-options {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: center;
    }
    
    .color-btn {
      width: 40px;
      height: 40px;
      border: 2px solid #333;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.3s;
      position: relative;
      font-size: 1.2em;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #000;
      font-weight: bold;
    }
    
    .color-btn:hover {
      transform: scale(1.2);
    }
    
    .color-btn.selected {
      border-width: 4px;
      border-color: #fff;
      transform: scale(1.3);
    }
    
    .shape-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .shape-btn {
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      border: 2px solid rgba(0, 255, 0, 0.3);
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.9em;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .shape-btn:hover {
      background: rgba(0, 255, 0, 0.1);
      border-color: #00ff00;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    }
    
    .shape-btn.selected {
      background: rgba(0, 255, 0, 0.2);
      border-color: #00ff00;
      box-shadow: 0 0 15px rgba(0, 255, 0, 0.8);
      font-weight: bold;
    }
    
    .customization-preview {
      text-align: center;
      padding: 15px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 10px;
    }
    
    .customization-preview p {
      color: #00ff00;
      margin-bottom: 10px;
      font-weight: bold;
    }
    
    .customization-preview canvas {
      border: 2px solid #00ff00;
      border-radius: 5px;
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
    }
    
    .auth-section {
      margin: 20px 0;
      padding: 20px;
      background: rgba(0, 100, 255, 0.05);
      border: 2px solid rgba(0, 100, 255, 0.3);
      border-radius: 10px;
    }
    
    .auth-section h2 {
      color: #00aaff;
      text-shadow: 0 0 10px #00aaff;
      margin-bottom: 15px;
    }
    
    .auth-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .auth-tab-btn {
      flex: 1;
      padding: 10px 20px;
      font-size: 0.9em;
      font-weight: bold;
      border: 2px solid #00aaff;
      background: rgba(0, 0, 0, 0.5);
      color: #888;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .auth-tab-btn:hover {
      background: rgba(0, 100, 255, 0.1);
      color: #00aaff;
    }
    
    .auth-tab-btn.active {
      background: linear-gradient(135deg, #00aaff, #0066ff);
      color: #fff;
      box-shadow: 0 0 15px rgba(0, 170, 255, 0.6);
      border-color: #00aaff;
    }
    
    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .auth-input {
      padding: 12px 15px;
      font-size: 1em;
      border: 2px solid rgba(0, 170, 255, 0.5);
      background: rgba(0, 0, 0, 0.7);
      color: #00ff00;
      border-radius: 5px;
      font-family: 'Courier New', monospace;
      outline: none;
      transition: all 0.3s;
    }
    
    .auth-input:focus {
      border-color: #00aaff;
      box-shadow: 0 0 15px rgba(0, 170, 255, 0.4);
    }
    
    .auth-submit-btn {
      background: linear-gradient(135deg, #00aaff, #0066ff);
      color: #fff;
      border: none;
      padding: 12px 25px;
      font-size: 1em;
      font-weight: bold;
      border-radius: 5px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(0, 100, 255, 0.4);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      margin-top: 5px;
    }
    
    .auth-submit-btn:hover {
      transform: scale(1.02);
      box-shadow: 0 8px 20px rgba(0, 100, 255, 0.6);
    }
    
    .auth-error {
      background: rgba(255, 0, 0, 0.2);
      border: 2px solid #ff0000;
      color: #ff6666;
      padding: 10px;
      border-radius: 5px;
      font-size: 0.9em;
      text-align: center;
    }
    
    .auth-info {
      font-size: 0.85em;
      color: #00aaff;
      text-align: center;
      margin-top: 5px;
    }
    
    .user-info {
      margin: 20px 0;
      padding: 15px;
      background: rgba(0, 255, 0, 0.1);
      border: 2px solid #00ff00;
      border-radius: 10px;
      text-align: center;
    }
    
    .user-info p {
      color: #00ff00;
      margin-bottom: 10px;
      font-size: 1.1em;
    }
    
    .user-info strong {
      color: #00ffff;
      text-shadow: 0 0 5px #00ffff;
    }
    
    .admin-badge {
      display: inline-block;
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      color: #000;
      font-size: 0.75em;
      font-weight: bold;
      padding: 4px 10px;
      border-radius: 12px;
      margin-left: 10px;
      text-shadow: none;
      box-shadow: 0 0 15px rgba(255, 215, 0, 0.8);
      animation: pulse 2s ease-in-out infinite;
    }
    
    .logout-btn {
      background: linear-gradient(135deg, #ff6600, #ff0000);
      color: white;
      border: none;
      padding: 8px 20px;
      font-size: 0.9em;
      font-weight: bold;
      border-radius: 5px;
      cursor: pointer;
      box-shadow: 0 3px 10px rgba(255, 102, 0, 0.4);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .logout-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 5px 15px rgba(255, 102, 0, 0.6);
    }
    
    .name-input {
      margin: 20px 0;
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    
    .name-input input {
      padding: 15px 20px;
      font-size: 1.2em;
      border: 2px solid #00ff00;
      background: rgba(0, 0, 0, 0.7);
      color: #00ff00;
      border-radius: 5px;
      font-family: 'Courier New', monospace;
      text-align: center;
      outline: none;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
    }
    
    .name-input input:focus {
      box-shadow: 0 0 20px rgba(0, 255, 0, 0.6);
    }
    
    .submit-btn {
      background: linear-gradient(135deg, #00ff00, #00cc00);
      color: #000;
      border: none;
      padding: 15px 30px;
      font-size: 1.2em;
      font-weight: bold;
      border-radius: 5px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(0, 255, 0, 0.4);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .submit-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 20px rgba(0, 255, 0, 0.6);
    }
    
    .submit-score-section {
      margin: 20px 0;
      text-align: center;
    }
    
    .auth-warning {
      color: #ffaa00;
      font-size: 1.1em;
      font-weight: bold;
      text-shadow: 0 0 10px rgba(255, 170, 0, 0.5);
      margin: 10px 0;
    }
    
    .leaderboard {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(10, 10, 30, 0.98);
      padding: 30px;
      border: 4px solid #ffd700;
      border-radius: 20px;
      box-shadow: 0 0 50px rgba(255, 215, 0, 0.5);
      color: white;
      width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      z-index: 1000;
    }
    
    .leaderboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      border-bottom: 2px solid #ffd700;
      padding-bottom: 15px;
    }
    
    .leaderboard-header h2 {
      color: #ffd700;
      margin: 0;
      font-size: 2em;
      text-shadow: 0 0 15px #ffd700;
    }
    
    .leaderboard-tabs {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .tab-btn {
      flex: 1;
      padding: 12px 20px;
      font-size: 1em;
      font-weight: bold;
      border: 2px solid #ffd700;
      background: rgba(0, 0, 0, 0.5);
      color: #888;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .tab-btn:hover {
      background: rgba(255, 215, 0, 0.1);
      color: #ffd700;
    }
    
    .tab-btn.active {
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      color: #000;
      box-shadow: 0 0 20px rgba(255, 215, 0, 0.6);
      border-color: #ffd700;
    }
    
    .close-btn {
      background: #ff0000;
      color: white;
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.5em;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 0 10px rgba(255, 0, 0, 0.5);
    }
    
    .close-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.8);
    }
    
    .leaderboard-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .leaderboard-entry {
      display: grid;
      grid-template-columns: 50px 1fr 100px 80px 80px 60px;
      gap: 10px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 5px;
      align-items: center;
      transition: all 0.3s;
    }
    
    .leaderboard-entry:not(.header-entry):hover {
      background: rgba(0, 255, 0, 0.1);
      transform: translateX(5px);
    }
    
    .header-entry {
      background: rgba(255, 215, 0, 0.2);
      font-weight: bold;
      color: #ffd700;
      border: 1px solid #ffd700;
    }
    
    .leaderboard-entry.highlight {
      background: rgba(0, 255, 0, 0.3);
      border: 2px solid #00ff00;
      animation: glow 1s ease-in-out infinite;
    }
    
    .leaderboard-entry.current-player {
      background: rgba(0, 255, 255, 0.15);
      border: 2px solid #00ffff;
    }
    
    .you-badge {
      color: #ffd700;
      font-size: 0.8em;
      font-weight: bold;
      background: rgba(255, 215, 0, 0.2);
      padding: 2px 8px;
      border-radius: 10px;
      margin-left: 8px;
      text-shadow: 0 0 5px #ffd700;
    }
    
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 10px rgba(0, 255, 0, 0.5); }
      50% { box-shadow: 0 0 20px rgba(0, 255, 0, 1); }
    }
    
    .rank {
      font-size: 1.2em;
      font-weight: bold;
      color: #ffd700;
      text-align: center;
    }
    
    .name {
      font-size: 1.1em;
      color: #00ffff;
    }
    
    .score-col, .wave-col, .kills-col {
      text-align: center;
      font-weight: bold;
    }
    
    .score-col { color: #00ff00; }
    .wave-col { color: #ff00ff; }
    .kills-col { color: #ff6600; }
    
    .action-col {
      text-align: center;
    }
    
    .edit-score-btn {
      background: linear-gradient(135deg, #ffaa00, #ff6600);
      border: none;
      padding: 6px 10px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1em;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(255, 102, 0, 0.4);
    }
    
    .edit-score-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 4px 15px rgba(255, 102, 0, 0.7);
    }
    
    .edit-score-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }
    
    .edit-score-content {
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border: 3px solid #ffaa00;
      border-radius: 15px;
      padding: 30px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 0 40px rgba(255, 170, 0, 0.6);
    }
    
    .edit-score-content h2 {
      color: #ffaa00;
      text-align: center;
      margin-bottom: 20px;
      font-size: 2em;
      text-shadow: 0 0 10px #ffaa00;
    }
    
    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .edit-form label {
      color: white;
      font-size: 1.1em;
      font-weight: bold;
    }
    
    .edit-form input {
      width: 100%;
      padding: 10px;
      font-size: 1.1em;
      border: 2px solid #ffaa00;
      border-radius: 5px;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      margin-top: 5px;
    }
    
    .edit-form input:focus {
      outline: none;
      border-color: #ff6600;
      box-shadow: 0 0 10px rgba(255, 102, 0, 0.5);
    }
    
    .edit-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }
    
    .edit-actions button {
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
    }
    
    .save-btn {
      background: linear-gradient(135deg, #00ff00, #00aa00);
      color: white;
      box-shadow: 0 4px 15px rgba(0, 255, 0, 0.4);
    }
    
    .save-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(0, 255, 0, 0.6);
    }
    
    .cancel-btn {
      background: linear-gradient(135deg, #ff0000, #aa0000);
      color: white;
      box-shadow: 0 4px 15px rgba(255, 0, 0, 0.4);
    }
    
    .cancel-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(255, 0, 0, 0.6);
    }
    
    .leaderboard-toggle {
      position: absolute;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      color: #000;
      border: none;
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(255, 215, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      z-index: 100;
    }
    
    .leaderboard-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(255, 215, 0, 0.8);
    }
    
    .achievements-toggle {
      position: absolute;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #ff00ff, #aa00ff);
      color: #fff;
      border: none;
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(255, 0, 255, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      z-index: 100;
    }
    
    .achievements-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(255, 0, 255, 0.8);
    }
    
    .skills-toggle {
      position: absolute;
      top: 140px;
      right: 20px;
      background: linear-gradient(135deg, #00aaff, #0066ff);
      color: #fff;
      border: none;
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(0, 170, 255, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      z-index: 100;
    }
    
    .skills-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(0, 170, 255, 0.8);
    }
    
    .admin-toggle {
      position: absolute;
      top: 200px;
      right: 20px;
      background: linear-gradient(135deg, #ff0000, #aa0000);
      color: #fff;
      border: none;
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(255, 0, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      z-index: 100;
    }
    
    .admin-toggle:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(255, 0, 0, 0.8);
    }
    
    .support-btn {
      position: absolute;
      top: 260px;
      right: 120px;
      background: linear-gradient(135deg, #00c9ff, #92fe9d);
      color: #000;
      border: none;
      padding: 12px 24px;
      font-size: 1.1em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(0, 201, 255, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      text-decoration: none;
      display: inline-block;
      z-index: 100;
    }
    
    .support-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 25px rgba(0, 201, 255, 0.8);
    }
    
    .pause-btn {
      position: absolute;
      top: 260px;
      right: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: #fff;
      border: none;
      padding: 12px 20px;
      font-size: 1.5em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(102, 126, 234, 0.5);
      transition: all 0.3s;
      z-index: 100;
    }
    
    .pause-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 25px rgba(102, 126, 234, 0.8);
    }
    
    .pause-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 500;
      pointer-events: none;
    }
    
    .pause-menu {
      background: rgba(10, 10, 30, 0.95);
      padding: 50px;
      border: 4px solid #667eea;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 0 50px rgba(102, 126, 234, 0.8);
      pointer-events: auto;
      color: white;
    }
    
    .pause-menu h1 {
      color: #667eea;
      font-size: 3em;
      margin-bottom: 20px;
      text-shadow: 0 0 20px #667eea;
    }
    
    .pause-menu p {
      font-size: 1.2em;
      margin-bottom: 30px;
      color: #ccc;
    }
    
    .resume-btn {
      background: linear-gradient(135deg, #00ff00, #00cc00);
      color: #000;
      border: none;
      padding: 15px 40px;
      font-size: 1.5em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 20px rgba(0, 255, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      margin: 10px;
    }
    
    .resume-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 30px rgba(0, 255, 0, 0.8);
    }
    
    .restart-btn-pause {
      background: linear-gradient(135deg, #ff6600, #ff0000);
      color: white;
      border: none;
      padding: 15px 40px;
      font-size: 1.5em;
      font-weight: bold;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 5px 20px rgba(255, 102, 0, 0.5);
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
      margin: 10px;
    }
    
    .restart-btn-pause:hover {
      transform: scale(1.1);
      box-shadow: 0 8px 30px rgba(255, 102, 0, 0.8);
    }
    
    .achievement-notification {
      position: absolute;
      top: 100px;
      right: 20px;
      z-index: 1000;
      animation: slideInRight 0.5s ease-out;
    }
    
    @keyframes slideInRight {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .achievement-badge {
      background: linear-gradient(135deg, #ffd700, #ffaa00);
      border: 3px solid #fff;
      border-radius: 15px;
      padding: 20px;
      display: flex;
      gap: 15px;
      box-shadow: 0 10px 40px rgba(255, 215, 0, 0.8);
      min-width: 300px;
      animation: pulse 1s ease-in-out infinite;
    }
    
    .achievement-icon {
      font-size: 3em;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: bounce 0.5s ease-in-out infinite alternate;
    }
    
    @keyframes bounce {
      from { transform: translateY(0); }
      to { transform: translateY(-10px); }
    }
    
    .achievement-info {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .achievement-title {
      color: #000;
      font-weight: bold;
      font-size: 0.9em;
      text-transform: uppercase;
    }
    
    .achievement-name {
      color: #000;
      font-weight: bold;
      font-size: 1.2em;
    }
    
    .achievement-desc {
      color: #333;
      font-size: 0.9em;
    }
    
    .achievements-panel {
      position: absolute;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      background: rgba(20, 10, 40, 0.98);
      border: 4px solid #ff00ff;
      border-radius: 20px;
      box-shadow: 0 0 50px rgba(255, 0, 255, 0.5);
      color: white;
      width: 500px;
      max-height: 80vh;
      z-index: 1000;
      display: flex;
      flex-direction: column;
    }
    
    .achievements-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 30px 30px 15px 30px;
      border-bottom: 2px solid #ff00ff;
      background: rgba(20, 10, 40, 0.98);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .achievements-header h2 {
      color: #ff00ff;
      margin: 0;
      font-size: 2em;
      text-shadow: 0 0 15px #ff00ff;
    }
    
    .achievements-progress {
      padding: 20px 30px;
      text-align: center;
      background: rgba(20, 10, 40, 0.98);
      position: sticky;
      top: 92px;
      z-index: 9;
    }
    
    .achievements-progress span {
      color: #ffd700;
      font-size: 1.2em;
      font-weight: bold;
    }
    
    .progress-bar {
      width: 100%;
      height: 20px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 10px;
      margin-top: 10px;
      overflow: hidden;
      border: 2px solid #ff00ff;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff00ff, #ffd700);
      transition: width 0.5s ease;
      box-shadow: 0 0 10px rgba(255, 0, 255, 0.8);
    }
    
    .achievements-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 0 30px 30px 30px;
      overflow-y: auto;
      flex: 1;
    }
    
    /* Custom Scrollbar for Achievements */
    .achievements-list::-webkit-scrollbar {
      width: 12px;
    }
    
    .achievements-list::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      margin: 10px 0;
    }
    
    .achievements-list::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #ff00ff, #aa00ff);
      border-radius: 10px;
      border: 2px solid rgba(255, 0, 255, 0.3);
      box-shadow: 0 0 10px rgba(255, 0, 255, 0.5);
    }
    
    .achievements-list::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #ff33ff, #cc00ff);
      box-shadow: 0 0 15px rgba(255, 0, 255, 0.8);
    }
    
    .achievement-item {
      display: flex;
      gap: 15px;
      padding: 15px;
      border-radius: 10px;
      transition: all 0.3s;
      align-items: center;
    }
    
    .achievement-item.unlocked {
      background: rgba(0, 255, 0, 0.2);
      border: 2px solid #00ff00;
    }
    
    .achievement-item.locked {
      background: rgba(100, 100, 100, 0.2);
      border: 2px solid #555;
      opacity: 0.6;
    }
    
    .achievement-item:hover {
      transform: translateX(5px);
    }
    
    .achievement-item-icon {
      font-size: 2.5em;
      min-width: 50px;
      text-align: center;
    }
    
    .achievement-item.locked .achievement-item-icon {
      filter: grayscale(100%);
    }
    
    .achievement-item-info {
      flex: 1;
    }
    
    .achievement-item-title {
      font-size: 1.2em;
      font-weight: bold;
      color: #ffd700;
      margin-bottom: 5px;
    }
    
    .achievement-item.locked .achievement-item-title {
      color: #888;
    }
    
    .achievement-item-desc {
      font-size: 0.9em;
      color: #ccc;
    }
    
    .achievement-item.locked .achievement-item-desc {
      color: #666;
    }
    
    .achievement-status {
      font-size: 2em;
      min-width: 40px;
      text-align: center;
    }
    
    /* Skills Panel */
    .skills-panel {
      position: fixed;
      top: 50%;
      right: 20px;
      transform: translateY(-50%);
      background: rgba(10, 20, 40, 0.98);
      border: 4px solid #00aaff;
      border-radius: 20px;
      box-shadow: 0 0 50px rgba(0, 170, 255, 0.5);
      color: white;
      width: 500px;
      max-height: 80vh;
      z-index: 1000;
      display: flex;
      flex-direction: column;
    }
    
    .skills-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 30px 30px 15px 30px;
      border-bottom: 2px solid #00aaff;
      background: rgba(10, 20, 40, 0.98);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    
    .skills-header h2 {
      color: #00aaff;
      margin: 0;
      font-size: 2em;
      text-shadow: 0 0 15px #00aaff;
    }
    
    .skills-points {
      padding: 20px 30px;
      text-align: center;
      background: rgba(10, 20, 40, 0.98);
      position: sticky;
      top: 92px;
      z-index: 9;
      font-size: 1.2em;
      color: #ccc;
    }
    
    .points-value {
      color: #ffd700;
      font-weight: bold;
      font-size: 1.3em;
      text-shadow: 0 0 10px #ffd700;
    }
    
    .skills-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 30px 30px 30px;
    }
    
    /* Custom Scrollbar for Skills */
    .skills-list::-webkit-scrollbar {
      width: 12px;
    }
    
    .skills-list::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
      margin: 10px 0;
    }
    
    .skills-list::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #00aaff, #0066ff);
      border-radius: 10px;
      border: 2px solid rgba(0, 170, 255, 0.3);
      box-shadow: 0 0 10px rgba(0, 170, 255, 0.5);
    }
    
    .skills-list::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #00ddff, #0088ff);
      box-shadow: 0 0 15px rgba(0, 170, 255, 0.8);
    }
    
    .skill-item {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 20px;
      margin: 15px 0;
      background: rgba(0, 100, 200, 0.1);
      border: 2px solid #00aaff;
      border-radius: 15px;
      transition: all 0.3s;
    }
    
    .skill-item:hover {
      background: rgba(0, 100, 200, 0.2);
      box-shadow: 0 0 20px rgba(0, 170, 255, 0.3);
      transform: translateX(-5px);
    }
    
    .skill-icon {
      font-size: 2.5em;
      min-width: 60px;
      text-align: center;
    }
    
    .skill-info {
      flex: 1;
    }
    
    .skill-name {
      font-size: 1.2em;
      font-weight: bold;
      color: #00ddff;
      margin-bottom: 5px;
    }
    
    .skill-desc {
      font-size: 0.9em;
      color: #aaa;
      margin-bottom: 10px;
    }
    
    .skill-level {
      margin-top: 8px;
    }
    
    .level-text {
      font-size: 0.85em;
      color: #888;
      display: block;
      margin-bottom: 5px;
    }
    
    .level-bar {
      width: 100%;
      height: 8px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #00aaff;
    }
    
    .level-fill {
      height: 100%;
      background: linear-gradient(90deg, #00aaff, #00ddff);
      transition: width 0.3s;
      box-shadow: 0 0 10px #00aaff;
    }
    
    .upgrade-btn {
      padding: 15px 25px;
      font-size: 1.1em;
      font-weight: bold;
      border: 2px solid #00ff00;
      background: linear-gradient(135deg, #00aa00, #00ff00);
      color: white;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
      box-shadow: 0 0 15px rgba(0, 255, 0, 0.4);
      font-family: 'Courier New', monospace;
      min-width: 80px;
    }
    
    .upgrade-btn:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 0 25px rgba(0, 255, 0, 0.6);
      background: linear-gradient(135deg, #00cc00, #00ff00);
    }
    
    .upgrade-btn:disabled {
      background: #333;
      border-color: #555;
      color: #666;
      cursor: not-allowed;
      box-shadow: none;
    }
    
    /* Admin Panel */
    .admin-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(20, 10, 10, 0.98);
      border: 4px solid #ff6600;
      border-radius: 20px;
      box-shadow: 0 0 50px rgba(255, 102, 0, 0.5);
      color: white;
      width: 800px;
      max-width: 90vw;
      max-height: 80vh;
      z-index: 1001;
      display: flex;
      flex-direction: column;
    }
    
    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 30px;
      border-bottom: 2px solid #ff6600;
      background: rgba(20, 10, 10, 0.98);
    }
    
    .admin-header h2 {
      color: #ff6600;
      margin: 0;
      font-size: 2em;
      text-shadow: 0 0 15px #ff6600;
    }
    
    .admin-tabs {
      display: flex;
      gap: 10px;
      padding: 15px 30px;
      border-bottom: 2px solid rgba(255, 102, 0, 0.3);
      background: rgba(0, 0, 0, 0.3);
    }
    
    .admin-tab-btn {
      flex: 1;
      padding: 10px 15px;
      font-size: 0.9em;
      font-weight: bold;
      border: 2px solid #ff6600;
      background: rgba(0, 0, 0, 0.5);
      color: #888;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .admin-tab-btn:hover {
      background: rgba(255, 102, 0, 0.1);
      color: #ff6600;
    }
    
    .admin-tab-btn.active {
      background: linear-gradient(135deg, #ff6600, #ff0000);
      color: #fff;
      box-shadow: 0 0 15px rgba(255, 102, 0, 0.6);
    }
    
    .admin-content {
      flex: 1;
      overflow-y: auto;
      padding: 20px 30px;
    }
    
    .stat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background: rgba(255, 102, 0, 0.1);
      border: 2px solid #ff6600;
      border-radius: 10px;
      padding: 20px;
      text-align: center;
      transition: all 0.3s;
    }
    
    .stat-card:hover {
      transform: translateY(-5px);
      box-shadow: 0 0 20px rgba(255, 102, 0, 0.5);
    }
    
    .stat-icon {
      font-size: 2.5em;
      margin-bottom: 10px;
    }
    
    .stat-value {
      font-size: 2em;
      font-weight: bold;
      color: #ffd700;
      text-shadow: 0 0 10px #ffd700;
    }
    
    .stat-label {
      font-size: 0.9em;
      color: #aaa;
      margin-top: 5px;
    }
    
    .admin-content h3 {
      color: #ff6600;
      margin: 20px 0 15px 0;
      text-shadow: 0 0 10px #ff6600;
    }
    
    .suspicious-list, .user-list, .score-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    
    .suspicious-item, .user-item, .score-item {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 102, 0, 0.3);
      border-radius: 8px;
      transition: all 0.3s;
    }
    
    .suspicious-item:hover, .user-item:hover, .score-item:hover {
      background: rgba(255, 102, 0, 0.1);
      border-color: #ff6600;
    }
    
    .user-info-admin {
      flex: 1;
      display: flex;
      gap: 15px;
      align-items: center;
    }
    
    .user-id {
      color: #888;
      font-weight: bold;
      min-width: 40px;
    }
    
    .user-name {
      color: #00ffff;
      font-weight: bold;
      min-width: 120px;
    }
    
    .user-email {
      color: #aaa;
      flex: 1;
    }
    
    .user-scores, .user-best {
      color: #ffd700;
      font-size: 0.9em;
    }
    
    .delete-btn {
      background: linear-gradient(135deg, #ff0000, #cc0000);
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .delete-btn:hover {
      transform: scale(1.1);
      box-shadow: 0 0 15px rgba(255, 0, 0, 0.8);
    }
    
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 20px;
      margin-top: 20px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 10px;
    }
    
    .pagination button {
      background: linear-gradient(135deg, #ff6600, #ff0000);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .pagination button:hover:not(:disabled) {
      transform: scale(1.05);
      box-shadow: 0 0 15px rgba(255, 102, 0, 0.6);
    }
    
    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .announce-textarea {
      width: 100%;
      min-height: 150px;
      padding: 15px;
      font-size: 1em;
      background: rgba(0, 0, 0, 0.5);
      border: 2px solid #ff6600;
      border-radius: 10px;
      color: #fff;
      font-family: 'Courier New', monospace;
      resize: vertical;
      outline: none;
    }
    
    .announce-textarea:focus {
      border-color: #ff8800;
      box-shadow: 0 0 15px rgba(255, 102, 0, 0.5);
    }
    
    .announce-buttons {
      display: flex;
      gap: 15px;
      margin-top: 15px;
    }
    
    .set-announce-btn, .clear-announce-btn {
      flex: 1;
      padding: 15px 30px;
      font-size: 1.1em;
      font-weight: bold;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
      font-family: 'Courier New', monospace;
    }
    
    .set-announce-btn {
      background: linear-gradient(135deg, #00ff00, #00cc00);
      color: #000;
      box-shadow: 0 5px 15px rgba(0, 255, 0, 0.4);
    }
    
    .set-announce-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 20px rgba(0, 255, 0, 0.6);
    }
    
    .clear-announce-btn {
      background: linear-gradient(135deg, #888, #555);
      color: #fff;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4);
    }
    
    .clear-announce-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.6);
    }
    
    .announcement-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #ff6600, #ff0000);
      color: white;
      padding: 15px;
      text-align: center;
      font-size: 1.2em;
      font-weight: bold;
      z-index: 999;
      box-shadow: 0 5px 20px rgba(255, 102, 0, 0.8);
      animation: pulse 2s ease-in-out infinite;
    }
    
    .announce-icon {
      font-size: 1.5em;
      margin: 0 10px;
      animation: bounce 1s ease-in-out infinite alternate;
    }
    
    .announce-text {
      text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
    
    /* Responsive Media Queries */
    @media (max-width: 1300px) {
      .instructions {
        max-width: 500px;
        padding: 20px;
      }
      
      .leaderboard {
        width: 500px;
      }
      
      .achievements-panel {
        width: 400px;
      }
      
      .skills-panel {
        width: 400px;
      }
    }
    
    @media (max-width: 768px) {
      .hud {
        padding: 10px;
        gap: 5px;
      }
      
      .stats {
        gap: 10px;
      }
      
      .stat .value {
        font-size: 18px;
      }
      
      .health-bg {
        width: 150px;
      }
      
      .instructions {
        max-width: 90vw;
        padding: 15px;
        max-height: 90vh;
      }
      
      .instructions h1 {
        font-size: 1.5em;
      }
      
      .instructions h2 {
        font-size: 1.1em;
      }
      
      .instructions p {
        font-size: 0.85em;
      }
      
      .customization-grid {
        grid-template-columns: 1fr;
        gap: 15px;
      }
      
      .color-options {
        gap: 8px;
      }
      
      .color-btn {
        width: 35px;
        height: 35px;
      }
      
      .leaderboard {
        width: 90vw;
        max-width: 400px;
        padding: 15px;
      }
      
      .leaderboard-entry {
        font-size: 0.85em;
        padding: 8px;
      }
      
      .achievements-panel {
        width: 90vw;
        max-width: 350px;
        padding: 15px;
      }
      
      .skills-panel {
        width: 90vw;
        max-width: 350px;
        padding: 15px;
      }
      
      .achievement-item {
        padding: 10px;
      }
      
      .achievement-item-icon {
        font-size: 2em;
      }
      
      .leaderboard-toggle,
      .achievements-toggle,
      .skills-toggle,
      .support-btn,
      .pause-btn {
        padding: 8px 16px;
        font-size: 0.9em;
      }
      
      .pause-menu {
        padding: 30px;
        max-width: 90vw;
      }
      
      .pause-menu h1 {
        font-size: 2em;
      }
      
      .resume-btn,
      .restart-btn-pause {
        padding: 12px 30px;
        font-size: 1.2em;
      }
      
      .weapon-info {
        bottom: 10px;
        left: 10px;
      }
      
      .weapon-level,
      .kill-streak {
        font-size: 0.9em;
        padding: 8px 12px;
      }
      
      .mini-map {
        bottom: 10px;
        right: 10px;
        transform: scale(0.85);
        transform-origin: bottom right;
        padding: 8px;
      }
      
      .mini-map:hover {
        transform: scale(0.9);
      }
      
      .mini-map-title {
        font-size: 0.8em;
      }
    }
    
    @media (max-width: 480px) {
      .hud {
        padding: 5px;
      }
      
      .stats {
        flex-direction: column;
        gap: 5px;
      }
      
      .stat {
        flex-direction: row;
        gap: 10px;
      }
      
      .stat .value {
        font-size: 16px;
      }
      
      .instructions h1 {
        font-size: 1.2em;
      }
      
      .start-btn {
        padding: 15px 40px;
        font-size: 1.5em;
      }
      
      .game-container {
        overflow-y: auto;
      }
      
      canvas {
        max-width: 100vw;
        height: auto !important;
        touch-action: none;
      }
      
      .leaderboard-toggle,
      .achievements-toggle,
      .skills-toggle,
      .support-btn,
      .pause-btn {
        top: auto;
        right: 5px;
        padding: 8px 14px;
        font-size: 0.85em;
        z-index: 1000;
      }
      
      .achievements-toggle {
        top: auto;
        bottom: 100px;
      }
      
      .skills-toggle {
        top: auto;
        bottom: 50px;
      }
      
      .support-btn {
        bottom: 60px;
      }
      
      .pause-btn {
        bottom: 20px;
      }
      
      .copyright {
        font-size: 0.7em;
        padding: 10px;
      }
      
      .mini-map {
        display: none;
      }
    }
  `]
})
export class GameComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  private subscriptions = new Subscription();
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  
  // Auth service
  authService = inject(AuthService);
  
  // Expose Math to template
  Math = Math;
  
  // Auth properties
  authMode: 'login' | 'register' = 'login';
  authUsername: string = '';
  authPassword: string = '';
  authEmail: string = '';
  authError: string = '';
  
  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn;
  }
  
  get currentUsername(): string {
    return this.authService.currentUser?.username || '';
  }
  
  canvasWidth = 1200;
  canvasHeight = 800;
  
  // Character customization
  playerCustomization: PlayerCustomization = {
    color: '#00ff00',
    shape: 'square',
    backgroundColor: '#000000'
  };
  
  colorOptions: ColorOption[] = [
    { name: 'Zöld', value: '#00ff00', glowColor: '#00ff00' },
    { name: 'Kék', value: '#0099ff', glowColor: '#0099ff' },
    { name: 'Piros', value: '#ff0000', glowColor: '#ff0000' },
    { name: 'Lila', value: '#ff00ff', glowColor: '#ff00ff' },
    { name: 'Sárga', value: '#ffff00', glowColor: '#ffff00' },
    { name: 'Cyan', value: '#00ffff', glowColor: '#00ffff' },
    { name: 'Narancs', value: '#ff8800', glowColor: '#ff8800' },
    { name: 'Rózsaszín', value: '#ff69b4', glowColor: '#ff69b4' }
  ];
  
  backgroundColorOptions: ColorOption[] = [
    { name: 'Fekete', value: '#000000', glowColor: '#666666' },
    { name: 'Sötétkék', value: '#001a33', glowColor: '#0066cc' },
    { name: 'Sötétzöld', value: '#001a00', glowColor: '#00cc00' },
    { name: 'Sötétlila', value: '#1a001a', glowColor: '#cc00cc' },
    { name: 'Sötétvörös', value: '#1a0000', glowColor: '#cc0000' },
    { name: 'Sötétszürke', value: '#0a0a0a', glowColor: '#666666' }
  ];
  
  player: Player = {
    x: 600,
    y: 700,
    width: 40,
    height: 40,
    speed: 6,
    health: 100,
    maxHealth: 100,
    invulnerable: 0,
    color: '#00ff00',
    shape: 'square'
  };
  
  bullets: Bullet[] = [];
  enemies: Enemy[] = [];
  particles: Particle[] = [];
  powerUps: PowerUp[] = [];
  activePowerUps: { type: PowerUp['type'], duration: number }[] = [];
  damageNumbers: DamageNumber[] = [];
  spawnWarnings: SpawnWarning[] = [];
  
  combo: ComboSystem = {
    count: 0,
    multiplier: 1,
    timer: 0
  };
  
  screenShake: number = 0;
  playerSpeed: number = 6;
  playerFireRate: number = 150;
  hasShield: boolean = false;
  
  ultimateCharge: number = 0;
  ultimateMaxCharge: number = 100;
  ultimateActive: boolean = false;
  ultimateDuration: number = 0;
  ultimateCooldown: number = 0;
  
  dashCooldown: number = 0;
  dashDuration: number = 0;
  dashDirection: { x: number, y: number } = { x: 0, y: 0 };
  
  weaponLevel: number = 1;
  killStreak: number = 0;
  lastKillTime: number = 0;
  slowMotion: number = 0;
  slowMotionCooldown: number = 0;
  waveDamageTaken: boolean = false;
  recentKills: number[] = []; // Track timestamps of recent kills for Speed Demon achievement
  
  adWatched: boolean = false;
  adTimer: number = 5;
  adInterval: any;
  
  // Extra visual effects
  screenFlash: number = 0;
  screenFlashColor: string = '#ffffff';
  bossWarning: number = 0;
  bossWarningTimer: number = 0;
  criticalHitEffect: { x: number, y: number, life: number }[] = [];
  
  @ViewChild('miniMapCanvas') miniMapRef?: ElementRef<HTMLCanvasElement>;
  
  private http = inject(HttpClient);
  private apiUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/.netlify/functions';
  
  keys: { [key: string]: boolean } = {};
  mouseX: number = 0;
  mouseY: number = 0;
  
  score: number = 0;
  wave: number = 1;
  kills: number = 0;
  gameOver: boolean = false;
  gameStarted: boolean = false;
  isPaused: boolean = false;
  
  lastShot: number = 0;
  shootCooldown: number = 150;
  
  // Weapon system
  weapons: Weapon[] = [
    {
      id: 'pistol',
      name: '🔫 Pisztoly',
      description: 'Gyors tüzelés, közepes sebzés',
      fireRate: 150,
      bulletCount: 1,
      bulletSpeed: 12,
      bulletSize: 4,
      damage: 25,
      spreadAngle: 0,
      color: '#00ffff'
    },
    {
      id: 'shotgun',
      name: '💥 Sörétes',
      description: 'Lassú tüzelés, sok lövedék',
      fireRate: 500,
      bulletCount: 8,
      bulletSpeed: 10,
      bulletSize: 3,
      damage: 15,
      spreadAngle: 0.4,
      color: '#ff8800'
    },
    {
      id: 'rifle',
      name: '🎯 Puska',
      description: 'Magas sebzés, pontos',
      fireRate: 300,
      bulletCount: 1,
      bulletSpeed: 18,
      bulletSize: 5,
      damage: 60,
      spreadAngle: 0,
      color: '#ff00ff'
    },
    {
      id: 'minigun',
      name: '⚡ Minigun',
      description: 'Nagyon gyors tüzelés, alacsony sebzés',
      fireRate: 60,
      bulletCount: 1,
      bulletSpeed: 14,
      bulletSize: 3,
      damage: 12,
      spreadAngle: 0.1,
      color: '#ffff00'
    },
    {
      id: 'burst',
      name: '💫 Sorozat',
      description: '3 lövedékes sorozat',
      fireRate: 400,
      bulletCount: 3,
      bulletSpeed: 15,
      bulletSize: 4,
      damage: 30,
      spreadAngle: 0.15,
      color: '#00ff88'
    },
    {
      id: 'sniper',
      name: '🎪 Mesterlövész',
      description: 'Lassú, brutális sebzés',
      fireRate: 800,
      bulletCount: 1,
      bulletSpeed: 25,
      bulletSize: 6,
      damage: 150,
      spreadAngle: 0,
      color: '#ff0088'
    }
  ];
  currentWeapon: Weapon = this.weapons[0];
  waveSpawnTimer: number = 0;
  bossSpawned: boolean = false;
  
  leaderboard: LeaderboardEntry[] = [];
  leaderboard24h: LeaderboardEntry[] = [];
  leaderboardAllTime: LeaderboardEntry[] = [];
  leaderboardType: '24h' | 'alltime' = 'alltime';
  showLeaderboard: boolean = false;
  playerName: string = '';
  playerNameSubmitted: boolean = false;
  justSubmitted: boolean = false;
  
  achievements: Achievement[] = [];
  showAchievements: boolean = false;
  currentUnlockNotification: Achievement | null = null;
  totalGamesPlayed: number = 0;
  
  skills: Skill[] = [];
  showSkills: boolean = false;
  skillPoints: number = 0;
  
  // Admin properties
  showAdminPanel: boolean = false;
  adminTab: 'stats' | 'users' | 'scores' | 'announce' = 'stats';
  adminStats: any = {
    totalUsers: 0,
    totalScores: 0,
    topScore: 0,
    totalKills: 0,
    maxWave: 0,
    suspiciousScores: []
  };
  adminUsers: any[] = [];
  adminScores: any[] = [];
  adminScorePage: number = 1;
  adminScoreTotalPages: number = 1;
  announcementText: string = '';
  globalAnnouncement: string = '';
  
  // Edit Score Modal
  showEditScoreModal: boolean = false;
  editingScore: any = null;
  editScoreData: any = {
    score: 0,
    wave: 0,
    kills: 0
  };
  
  get unlockedCount(): number {
    return this.achievements.filter(a => a.unlocked).length;
  }
  
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    // ESC to pause/unpause
    if (event.key === 'Escape' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.togglePause();
      return;
    }
    
    // Don't process other keys when paused
    if (this.isPaused) return;
    
    this.keys[event.key.toLowerCase()] = true;
    if (event.key === ' ' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.shootBullet();
    }
    if (event.key.toLowerCase() === 'q' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.activateUltimate();
    }
    if (event.key.toLowerCase() === 'shift' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.dash();
    }
    if (event.key.toLowerCase() === 'e' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.activateSlowMotion();
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
  
  @HostListener('window:resize')
  onResize() {
    this.updateCanvasSize();
  }
  
  ngOnInit() {
    this.updateCanvasSize();
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.loadCustomization();
    this.updatePageBackground();
    this.cleanupLocalStorage(); // Clean duplicates on startup
    this.loadLeaderboard();
    this.initAchievements();
    this.loadAchievements();
    this.initSkills();
    this.loadSkills();
    this.loadStats();
    this.loadAdSense();
    this.loadAnnouncement();
    this.render();
  }
  
  ngAfterViewInit() {
    this.renderPreview();
  }
  
  selectColor(color: string) {
    this.playerCustomization.color = color;
    this.player.color = color;
    this.saveCustomization();
    this.renderPreview();
  }
  
  selectBackgroundColor(color: string) {
    this.playerCustomization.backgroundColor = color;
    this.saveCustomization();
    this.updatePageBackground();
    this.renderPreview();
  }
  
  updatePageBackground() {
    document.body.style.backgroundColor = this.playerCustomization.backgroundColor;
    const container = document.querySelector('.game-container') as HTMLElement;
    if (container) {
      container.style.backgroundColor = this.playerCustomization.backgroundColor;
    }
  }
  
  selectShape(shape: 'square' | 'circle' | 'triangle' | 'diamond') {
    this.playerCustomization.shape = shape;
    this.player.shape = shape;
    this.saveCustomization();
    this.renderPreview();
  }
  
  saveCustomization() {
    localStorage.setItem('playerCustomization', JSON.stringify(this.playerCustomization));
  }
  
  loadCustomization() {
    const saved = localStorage.getItem('playerCustomization');
    if (saved) {
      this.playerCustomization = JSON.parse(saved);
      this.player.color = this.playerCustomization.color;
      this.player.shape = this.playerCustomization.shape;
    }
  }
  
  renderPreview() {
    if (!this.previewCanvasRef) return;
    
    const canvas = this.previewCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear with black (canvas is always black)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 100, 100);
    
    // Draw player shape
    const centerX = 50;
    const centerY = 50;
    const size = 30;
    
    ctx.fillStyle = this.playerCustomization.color;
    ctx.strokeStyle = this.playerCustomization.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.playerCustomization.color;
    
    switch (this.playerCustomization.shape) {
      case 'square':
        ctx.fillRect(centerX - size / 2, centerY - size / 2, size, size);
        ctx.strokeRect(centerX - size / 2 - 2, centerY - size / 2 - 2, size + 4, size + 4);
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size / 2);
        ctx.lineTo(centerX - size / 2, centerY + size / 2);
        ctx.lineTo(centerX + size / 2, centerY + size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'diamond':
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - size / 2);
        ctx.lineTo(centerX + size / 2, centerY);
        ctx.lineTo(centerX, centerY + size / 2);
        ctx.lineTo(centerX - size / 2, centerY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
    }
    
    ctx.shadowBlur = 0;
  }
  
  updateCanvasSize() {
    const maxWidth = 1200;
    const maxHeight = 800;
    const minWidth = 320;
    const minHeight = 400;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    
    // Calculate responsive size with padding
    let width = Math.min(maxWidth, windowWidth - 40); // Reduced padding for mobile
    let height = Math.min(maxHeight, windowHeight - 200); // More space for controls
    
    // On mobile, use more screen space
    if (windowWidth <= 768) {
      width = Math.min(windowWidth - 20, maxWidth);
      height = Math.min(windowHeight - 150, maxHeight);
    }
    
    // Maintain aspect ratio (3:2)
    const aspectRatio = 3 / 2;
    if (width / height > aspectRatio) {
      width = height * aspectRatio;
    } else {
      height = width / aspectRatio;
    }
    
    // Apply minimum constraints
    width = Math.max(minWidth, width);
    height = Math.max(minHeight, height);
    
    this.canvasWidth = Math.floor(width);
    this.canvasHeight = Math.floor(height);
    
    // Update player position to stay centered
    if (this.player) {
      this.player.x = Math.min(this.player.x, this.canvasWidth - this.player.width);
      this.player.y = Math.min(this.player.y, this.canvasHeight - this.player.height);
    }
  }
  
  cleanupLocalStorage() {
    // Clear all leaderboard data (run once to reset)
    localStorage.removeItem('bulletHellLeaderboard');
    this.leaderboard = [];
  }
  
  startGame() {
    this.gameStarted = true;
    this.resetGame();
    this.gameLoop();
  }
  
  togglePause() {
    if (!this.gameStarted || this.gameOver) return;
    this.isPaused = !this.isPaused;
  }
  
  resetGame() {
    this.player = {
      x: 450,
      y: 600,
      width: 40,
      height: 40,
      speed: 4,
      health: 100,
      maxHealth: 100,
      invulnerable: 0,
      color: this.playerCustomization.color,
      shape: this.playerCustomization.shape
    };
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.powerUps = [];
    this.activePowerUps = [];
    this.damageNumbers = [];
    this.spawnWarnings = [];
    this.combo = { count: 0, multiplier: 1, timer: 0 };
    this.screenShake = 0;
    this.playerSpeed = 4;
    this.playerFireRate = 150;
    this.hasShield = false;
    this.ultimateCharge = 0;
    this.ultimateActive = false;
    this.ultimateDuration = 0;
    this.ultimateCooldown = 0;
    this.dashCooldown = 0;
    this.dashDuration = 0;
    this.weaponLevel = 1;
    this.killStreak = 0;
    this.lastKillTime = 0;
    this.slowMotion = 0;
    this.score = 0;
    this.wave = 1;
    this.kills = 0;
    this.gameOver = false;
    this.waveSpawnTimer = 0;
    this.bossSpawned = false;
    this.waveDamageTaken = false;
    this.recentKills = [];
    this.playerName = '';
    this.playerNameSubmitted = false;
    this.showLeaderboard = false;
    
    // Apply skill bonuses
    this.applySkillEffects();
  }
  
  restart() {
    this.adWatched = false;
    this.adTimer = 5;
    const adElement = document.getElementById('ad-interstitial');
    if (adElement) adElement.style.display = 'flex';
    this.startGame();
  }
  
  gameLoop() {
    if (this.gameOver) return;
    
    if (!this.isPaused) {
      this.update();
    }
    
    this.render();
    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }
  
  update() {
    // Screen shake
    if (this.screenShake > 0) {
      this.screenShake--;
    }
    
    // Screen flash effect
    if (this.screenFlash > 0) {
      this.screenFlash -= 0.05;
    }
    
    // Boss warning
    if (this.bossWarning > 0) {
      this.bossWarning--;
      this.bossWarningTimer++;
    }
    
    // Critical hit effects
    this.criticalHitEffect = this.criticalHitEffect.filter(effect => {
      effect.life--;
      return effect.life > 0;
    });
    
    // Combo timer
    if (this.combo.timer > 0) {
      this.combo.timer--;
      if (this.combo.timer === 0) {
        this.combo.count = 0;
        this.combo.multiplier = 1;
      }
    }
    
    // Health regeneration (every 5 seconds = 300 frames at 60fps)
    const regenLevel = this.getSkillValue('regen');
    if (regenLevel > 0) {
      if (!this.hasOwnProperty('regenTimer')) {
        (this as any).regenTimer = 0;
      }
      (this as any).regenTimer++;
      if ((this as any).regenTimer >= 300) {
        (this as any).regenTimer = 0;
        const healing = regenLevel;
        if (this.player.health < this.player.maxHealth) {
          this.player.health = Math.min(this.player.maxHealth, this.player.health + healing);
          this.createDamageNumber(this.player.x, this.player.y - 30, healing, '#00ff88');
          this.createParticles(this.player.x + this.player.width / 2, 
                             this.player.y + this.player.height / 2, '#00ff88', 5);
        }
      }
    }
    
    // Ultimate duration
    if (this.ultimateDuration > 0) {
      this.ultimateDuration--;
      if (this.ultimateDuration === 0) {
        this.ultimateActive = false;
        this.playerFireRate = 150;
      }
    }
    
    // Ultimate cooldown
    if (this.ultimateCooldown > 0) {
      this.ultimateCooldown--;
    }
    
    // Dash cooldown
    if (this.dashCooldown > 0) {
      this.dashCooldown--;
    }
    
    // Dash movement
    if (this.dashDuration > 0) {
      this.dashDuration--;
      this.player.x += this.dashDirection.x * 15;
      this.player.y += this.dashDirection.y * 15;
      this.player.x = Math.max(0, Math.min(this.canvasWidth - this.player.width, this.player.x));
      this.player.y = Math.max(0, Math.min(this.canvasHeight - this.player.height, this.player.y));
      this.player.invulnerable = 10; // Invulnerable during dash
    }
    
    // Slow motion
    if (this.slowMotion > 0) {
      this.slowMotion--;
      // Slow motion cooldown is separate and runs even during slow-mo
      if (this.slowMotionCooldown > 0) {
        this.slowMotionCooldown--;
      }
      // Skip some updates for slow-mo effect
      if (this.slowMotion % 2 === 0) return;
    } else {
      // Only decrease cooldown when NOT in slow motion
      if (this.slowMotionCooldown > 0) {
        this.slowMotionCooldown--;
      }
    }
    
    // Kill streak timer
    if (Date.now() - this.lastKillTime > 3000) {
      this.killStreak = 0;
    }
    
    // Player movement
    const currentSpeed = this.playerSpeed;
    let moved = false;
    if (this.keys['w'] || this.keys['arrowup']) {
      this.player.y = Math.max(0, this.player.y - currentSpeed);
      moved = true;
    }
    if (this.keys['s'] || this.keys['arrowdown']) {
      this.player.y = Math.min(this.canvasHeight - this.player.height, this.player.y + currentSpeed);
      moved = true;
    }
    if (this.keys['a'] || this.keys['arrowleft']) {
      this.player.x = Math.max(0, this.player.x - currentSpeed);
      moved = true;
    }
    if (this.keys['d'] || this.keys['arrowright']) {
      this.player.x = Math.min(this.canvasWidth - this.player.width, this.player.x + currentSpeed);
      moved = true;
    }
    
    // Extra safety: clamp player position to stay within canvas bounds
    this.player.x = Math.max(0, Math.min(this.canvasWidth - this.player.width, this.player.x));
    this.player.y = Math.max(0, Math.min(this.canvasHeight - this.player.height, this.player.y));
    
    // Add player trail particles when moving
    if (moved && Math.random() < 0.5) {
      this.particles.push({
        x: this.player.x + this.player.width / 2,
        y: this.player.y + this.player.height / 2,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 30,
        color: this.ultimateActive ? '#00ffff' : this.player.color,
        size: Math.random() * 3 + 2
      });
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
    
    // Update power-ups
    this.powerUps = this.powerUps.filter(p => {
      p.lifetime--;
      p.y += 1; // Slow fall
      return p.lifetime > 0 && p.y < this.canvasHeight;
    });
    
    // Update active power-ups
    this.activePowerUps = this.activePowerUps.filter(p => {
      p.duration--;
      if (p.duration <= 0) {
        this.removePowerUpEffect(p.type);
        return false;
      }
      return true;
    });
    
    // Update damage numbers
    this.damageNumbers = this.damageNumbers.filter(d => {
      d.y += d.vy;
      d.vy -= 0.1;
      d.life--;
      return d.life > 0;
    });
    
    // Update spawn warnings
    this.spawnWarnings = this.spawnWarnings.filter(w => {
      w.life--;
      return w.life > 0;
    });
    
    // Check game over
    if (this.player.health <= 0) {
      this.gameOver = true;
      this.totalGamesPlayed++;
      this.saveStats();
      this.checkAchievements();
    }
    
    // Check achievements during gameplay
    if (this.gameStarted && !this.gameOver) {
      this.checkAchievements();
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
      case 'boss_tank':
      case 'boss_speed':
      case 'boss_sniper':
        // Different movement patterns for different boss types
        if (enemy.type === 'boss_tank') {
          // Tank boss: Slow vertical movement, stays at top
          enemy.movePattern += 0.02;
          enemy.x += Math.cos(enemy.movePattern) * 1;
          enemy.y = Math.min(150, enemy.y + 0.3);
        } else if (enemy.type === 'boss_speed') {
          // Speed boss: Fast zigzag pattern
          enemy.movePattern += 0.08;
          enemy.x += Math.cos(enemy.movePattern) * 4;
          enemy.y = Math.min(180, enemy.y + 1);
          
          // Keep within bounds
          if (enemy.x < 0) enemy.x = 0;
          if (enemy.x > this.canvasWidth - enemy.width) enemy.x = this.canvasWidth - enemy.width;
        } else if (enemy.type === 'boss_sniper') {
          // Sniper boss: Teleports occasionally
          enemy.movePattern += 0.05;
          enemy.x += Math.cos(enemy.movePattern) * 1.5;
          enemy.y = Math.min(180, enemy.y + 0.4);
          
          // Random teleport
          if (enemy.shootTimer % 200 === 0 && enemy.shootTimer > 0) {
            enemy.x = Math.random() * (this.canvasWidth - enemy.width);
            this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff00ff', 30);
          }
        } else {
          // Normal boss: Circular pattern
          enemy.movePattern += 0.03;
          enemy.x += Math.cos(enemy.movePattern) * 2;
          enemy.y = Math.min(200, enemy.y + 0.5);
        }
        
        // Rage mode when below 50% HP
        const rageMode = enemy.health < enemy.maxHealth * 0.5;
        
        // Different shoot intervals for different boss types
        let shootInterval = 30;
        if (enemy.type === 'boss_tank') {
          shootInterval = rageMode ? 40 : 60;
        } else if (enemy.type === 'boss_speed') {
          shootInterval = rageMode ? 10 : 15;
        } else if (enemy.type === 'boss_sniper') {
          shootInterval = rageMode ? 35 : 50;
        } else {
          shootInterval = rageMode ? 20 : 30;
        }
        
        enemy.shootTimer++;
        if (enemy.shootTimer > shootInterval) {
          this.bossShootPattern(enemy, rageMode);
          enemy.shootTimer = 0;
        }
        break;
        
      case 'healer':
        // Healer: Stays back, heals nearby enemies
        enemy.x += (dx / dist) * enemy.speed * 0.5;
        enemy.y += (dy / dist) * enemy.speed * 0.5;
        enemy.shootTimer++;
        if (enemy.shootTimer > 180) {
          // Heal nearby enemies
          this.enemies.forEach(other => {
            if (other !== enemy && other.type !== 'healer') {
              const healDx = other.x - enemy.x;
              const healDy = other.y - enemy.y;
              const healDist = Math.sqrt(healDx * healDx + healDy * healDy);
              if (healDist < 150) {
                other.health = Math.min(other.maxHealth, other.health + 20);
                this.createParticles(other.x + other.width / 2, other.y + other.height / 2, '#00ff00', 10);
              }
            }
          });
          enemy.shootTimer = 0;
        }
        break;
        
      case 'exploder':
        // Exploder: Rushes towards player, explodes on death
        enemy.x += (dx / dist) * enemy.speed * 1.5;
        enemy.y += (dy / dist) * enemy.speed * 1.5;
        break;
        
      case 'dodger':
        // Dodger: Fast movement with random dodges
        if (!enemy.dodgeTimer) enemy.dodgeTimer = 0;
        enemy.dodgeTimer++;
        
        if (enemy.dodgeTimer % 60 === 0) {
          // Random dodge direction
          const dodgeAngle = Math.random() * Math.PI * 2;
          enemy.x += Math.cos(dodgeAngle) * 50;
          enemy.y += Math.sin(dodgeAngle) * 50;
        } else {
          enemy.x += (dx / dist) * enemy.speed;
          enemy.y += (dy / dist) * enemy.speed;
        }
        break;
        
      case 'miniboss':
        // Miniboss: Moves and shoots like boss but smaller
        enemy.movePattern += 0.04;
        enemy.x += Math.cos(enemy.movePattern) * 1.5;
        enemy.y = Math.min(250, enemy.y + 0.7);
        
        enemy.shootTimer++;
        if (enemy.shootTimer > 40) {
          // Shoot in 4 directions
          for (let i = 0; i < 4; i++) {
            const angle = (Math.PI * 2 * i) / 4 + enemy.movePattern;
            this.bullets.push({
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              vx: Math.cos(angle) * 3.5,
              vy: Math.sin(angle) * 3.5,
              radius: 6,
              damage: 18,
              fromPlayer: false
            });
          }
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
  
  bossShootPattern(enemy: Enemy, rageMode: boolean = false) {
    if (enemy.type === 'boss_tank') {
      // Tank: Massive spray of slow bullets
      const directions = rageMode ? 24 : 16;
      for (let i = 0; i < directions; i++) {
        const angle = (Math.PI * 2 * i) / directions;
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * 2,
          vy: Math.sin(angle) * 2,
          radius: 8,
          damage: 25,
          fromPlayer: false
        });
      }
    } else if (enemy.type === 'boss_speed') {
      // Speed: Fast bullets aimed at player
      const playerDx = this.player.x + this.player.width / 2 - (enemy.x + enemy.width / 2);
      const playerDy = this.player.y + this.player.height / 2 - (enemy.y + enemy.height / 2);
      const dist = Math.sqrt(playerDx * playerDx + playerDy * playerDy);
      
      const bulletCount = rageMode ? 5 : 3;
      for (let i = 0; i < bulletCount; i++) {
        const spread = (i - (bulletCount - 1) / 2) * 0.3;
        const angle = Math.atan2(playerDy, playerDx) + spread;
        
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * 6,
          vy: Math.sin(angle) * 6,
          radius: 5,
          damage: 15,
          fromPlayer: false
        });
      }
    } else if (enemy.type === 'boss_sniper') {
      // Sniper: Laser-like fast bullets in cardinal directions
      const directions = rageMode ? 8 : 4;
      for (let i = 0; i < directions; i++) {
        const angle = (Math.PI * 2 * i) / directions;
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * 8,
          vy: Math.sin(angle) * 8,
          radius: 4,
          damage: 30,
          fromPlayer: false
        });
      }
    } else {
      // Normal: Shoot in 8 directions
      const directions = rageMode ? 16 : 8;
      for (let i = 0; i < directions; i++) {
        const angle = (Math.PI * 2 * i) / directions;
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
  }
  
  shootBullet() {
    const now = Date.now();
    const weaponFireRate = Math.max(50, this.currentWeapon.fireRate - this.weaponLevel * 10);
    if (now - this.lastShot < weaponFireRate) return;
    
    const dx = this.mouseX - (this.player.x + this.player.width / 2);
    const dy = this.mouseY - (this.player.y + this.player.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      const baseAngle = Math.atan2(dy, dx);
      const bulletCount = this.currentWeapon.bulletCount + Math.floor(this.weaponLevel / 3);
      
      for (let i = 0; i < bulletCount; i++) {
        const offset = (i - (bulletCount - 1) / 2) * this.currentWeapon.spreadAngle;
        const angle = baseAngle + offset;
        
        this.bullets.push({
          x: this.player.x + this.player.width / 2,
          y: this.player.y + this.player.height / 2,
          vx: Math.cos(angle) * this.currentWeapon.bulletSpeed,
          vy: Math.sin(angle) * this.currentWeapon.bulletSpeed,
          radius: this.currentWeapon.bulletSize + this.weaponLevel * 0.3,
          damage: this.currentWeapon.damage + this.weaponLevel * 5,
          fromPlayer: true
        });
      }
      
      this.lastShot = now;
    }
  }
  
  selectWeapon(weapon: Weapon) {
    this.currentWeapon = weapon;
  }
  
  spawnWave() {
    if (this.enemies.length > 0) return;
    
    this.waveSpawnTimer++;
    if (this.waveSpawnTimer < 120) return;
    
    this.waveSpawnTimer = 0;
    
    // Boss every 5 waves
    if (this.wave % 5 === 0 && !this.bossSpawned) {
      // Boss warning system
      this.bossWarning = 180; // 3 seconds warning
      this.bossWarningTimer = 0;
      
      setTimeout(() => {
        this.spawnBoss();
        this.screenFlash = 1.0;
        this.screenFlashColor = '#ff0000';
        this.screenShake = 40;
      }, 3000);
      
      this.bossSpawned = true;
      return;
    }
    
    this.bossSpawned = false;
    const baseEnemies = 3;
    const waveMultiplier = Math.min(this.wave * 1.5, 20); // Harder scaling, max 20x
    const enemyCount = Math.floor(baseEnemies + waveMultiplier);
    
    for (let i = 0; i < enemyCount; i++) {
      const rand = Math.random();
      let type: Exclude<Enemy['type'], 'boss' | 'boss_tank' | 'boss_speed' | 'boss_sniper'> = 'basic';
      
      if (rand < 0.25) type = 'basic';
      else if (rand < 0.4) type = 'fast';
      else if (rand < 0.55) type = 'tank';
      else if (rand < 0.7) type = 'shooter';
      else if (rand < 0.8) type = 'healer';
      else if (rand < 0.9) type = 'exploder';
      else if (rand < 0.95) type = 'dodger';
      else type = 'miniboss';
      
      this.spawnEnemy(type);
    }
    
    // Check Flawless Victory achievement before advancing wave
    if (this.wave >= 5 && !this.waveDamageTaken) {
      this.unlockAchievement('flawless_victory');
    }
    
    this.wave++;
    this.waveDamageTaken = false; // Reset for next wave
    
    // Award skill point every 5 waves
    if (this.wave % 5 === 0) {
      this.skillPoints++;
      this.saveSkills();
      // Show visual notification
      this.createDamageNumber(this.canvasWidth / 2, this.canvasHeight / 2, this.skillPoints, '#ffd700');
    }
  }
  
  spawnEnemy(type: Exclude<Enemy['type'], 'boss' | 'boss_tank' | 'boss_speed' | 'boss_sniper'>) {
    const configs = {
      basic: { width: 30, height: 30, health: 50, speed: 1.0 },
      fast: { width: 25, height: 25, health: 30, speed: 2.0 },
      tank: { width: 50, height: 50, health: 150, speed: 0.5 },
      shooter: { width: 35, height: 35, health: 60, speed: 0.7 },
      healer: { width: 28, height: 28, health: 40, speed: 0.8 },
      exploder: { width: 32, height: 32, health: 35, speed: 1.3 },
      dodger: { width: 22, height: 22, health: 25, speed: 2.3 },
      miniboss: { width: 70, height: 70, health: 250, speed: 0.6 }
    };
    
    const config = configs[type];
    
    // Wave scaling
    const healthScale = 1 + (this.wave - 1) * 0.2; // +20% HP per wave
    const speedScale = 1 + (this.wave - 1) * 0.08; // +8% speed per wave
    
    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    
    switch (side) {
      case 0: x = Math.random() * this.canvasWidth; y = -config.height; break;
      case 1: x = this.canvasWidth; y = Math.random() * this.canvasHeight; break;
      case 2: x = Math.random() * this.canvasWidth; y = this.canvasHeight; break;
      case 3: x = -config.width; y = Math.random() * this.canvasHeight; break;
    }
    
    // Spawn warning
    if (type === 'shooter' || type === 'tank') {
      this.spawnWarnings.push({ x, y, life: 90, type });
    }
    
    this.enemies.push({
      x, y,
      width: config.width,
      height: config.height,
      health: Math.floor(config.health * healthScale),
      maxHealth: Math.floor(config.health * healthScale),
      speed: config.speed * speedScale,
      type,
      shootTimer: 0,
      movePattern: 0
    });
  }
  
  spawnBoss() {
    const bossIteration = Math.floor(this.wave / 5);
    const healthScale = 1 + bossIteration * 0.8; // +80% HP per boss iteration
    const baseHealth = 1000;
    
    // Random boss type
    const bossTypes = ['normal', 'tank', 'speed', 'sniper'] as const;
    const bossType = bossTypes[Math.floor(Math.random() * bossTypes.length)];
    
    let boss: Enemy;
    
    if (bossType === 'tank') {
      // Tank Boss: Huge HP, slow, small bullets
      boss = {
        x: this.canvasWidth / 2 - 100,
        y: -200,
        width: 200,
        height: 200,
        health: Math.floor(baseHealth * healthScale * 2 + this.wave * 150),
        maxHealth: Math.floor(baseHealth * healthScale * 2 + this.wave * 150),
        speed: 0.3,
        type: 'boss_tank',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'tank'
      };
    } else if (bossType === 'speed') {
      // Speed Boss: Lower HP, fast, rapid fire
      boss = {
        x: this.canvasWidth / 2 - 60,
        y: -120,
        width: 120,
        height: 120,
        health: Math.floor(baseHealth * healthScale * 0.7 + this.wave * 80),
        maxHealth: Math.floor(baseHealth * healthScale * 0.7 + this.wave * 80),
        speed: 1.6,
        type: 'boss_speed',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'speed'
      };
    } else if (bossType === 'sniper') {
      // Sniper Boss: Medium HP, teleports, laser attacks
      boss = {
        x: this.canvasWidth / 2 - 75,
        y: -150,
        width: 150,
        height: 150,
        health: Math.floor(baseHealth * healthScale * 1.2 + this.wave * 100),
        maxHealth: Math.floor(baseHealth * healthScale * 1.2 + this.wave * 100),
        speed: 0.5,
        type: 'boss_sniper',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'sniper'
      };
    } else {
      // Normal Boss: Balanced
      boss = {
        x: this.canvasWidth / 2 - 75,
        y: -150,
        width: 150,
        height: 150,
        health: Math.floor(baseHealth * healthScale + this.wave * 100),
        maxHealth: Math.floor(baseHealth * healthScale + this.wave * 100),
        speed: 0.65,
        type: 'boss',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'normal'
      };
    }
    
    this.enemies.push(boss);
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
            const damage = this.ultimateActive ? bullet.damage * 2 : bullet.damage;
            
            // Critical hit chance (5% base + skill bonus)
            const baseCritChance = 0.05;
            const critBonus = this.getSkillValue('crit') / 100;
            const isCritical = Math.random() < (baseCritChance + critBonus);
            const finalDamage = isCritical ? damage * 2 : damage;
            
            enemy.health -= finalDamage;
            
            // Vampirism (life steal)
            const vampirism = this.getSkillValue('vampirism') / 100;
            if (vampirism > 0) {
              const healing = finalDamage * vampirism;
              this.player.health = Math.min(this.player.maxHealth, this.player.health + healing);
              if (healing > 0) {
                this.createDamageNumber(this.player.x, this.player.y - 20, healing, '#00ff00');
              }
            }
            
            // Pierce - only remove bullet if no pierce remaining
            const pierceCount = this.getSkillValue('pierce');
            if (!bullet.hasOwnProperty('pierceRemaining')) {
              (bullet as any).pierceRemaining = pierceCount;
            }
            
            if ((bullet as any).pierceRemaining <= 0) {
              this.bullets.splice(i, 1);
            } else {
              (bullet as any).pierceRemaining--;
            }
            
            this.createParticles(bullet.x, bullet.y, isCritical ? '#ff00ff' : '#ffff00');
            this.createDamageNumber(bullet.x, bullet.y, finalDamage, isCritical ? '#ff00ff' : '#ffff00');
            
            // Critical hit effects
            if (isCritical) {
              this.criticalHitEffect.push({ x: bullet.x, y: bullet.y, life: 30 });
              this.screenFlash = 0.3;
              this.screenFlashColor = '#ff00ff';
              this.screenShake = 5;
            }
            
            // Explosion skill - AoE damage
            const explosionBonus = this.getSkillValue('explosion') / 100;
            if (explosionBonus > 0) {
              const explosionRadius = 80;
              const explosionDamage = finalDamage * explosionBonus;
              
              this.enemies.forEach(other => {
                if (other !== enemy) {
                  const dx = other.x + other.width / 2 - bullet.x;
                  const dy = other.y + other.height / 2 - bullet.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  
                  if (dist < explosionRadius) {
                    other.health -= explosionDamage;
                    this.createDamageNumber(other.x, other.y, explosionDamage, '#ff8800');
                  }
                }
              });
              
              // Visual effect
              this.createParticles(bullet.x, bullet.y, '#ff8800', 8);
            }
            
            if (enemy.health <= 0) {
              // Exploder special effect before removal
              if (enemy.type === 'exploder') {
                // Explosion damage to nearby enemies and player
                const explosionRadius = 100;
                
                // Damage player if nearby
                const playerDx = this.player.x + this.player.width / 2 - (enemy.x + enemy.width / 2);
                const playerDy = this.player.y + this.player.height / 2 - (enemy.y + enemy.height / 2);
                const playerDist = Math.sqrt(playerDx * playerDx + playerDy * playerDy);
                
                if (playerDist < explosionRadius && this.player.invulnerable === 0 && !this.hasShield) {
                  this.player.health -= 30;
                  this.player.invulnerable = 60;
                  this.waveDamageTaken = true;
                  this.screenShake = 25;
                }
                
                // Damage other enemies
                this.enemies.forEach(other => {
                  if (other !== enemy) {
                    const otherDx = other.x + other.width / 2 - (enemy.x + enemy.width / 2);
                    const otherDy = other.y + other.height / 2 - (enemy.y + enemy.height / 2);
                    const otherDist = Math.sqrt(otherDx * otherDx + otherDy * otherDy);
                    
                    if (otherDist < explosionRadius) {
                      other.health -= 50;
                    }
                  }
                });
                
                // Visual effects
                this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff8800', 60);
                this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffff00', 40);
                this.screenFlash = 0.5;
                this.screenFlashColor = '#ff8800';
                this.screenShake = 20;
              }
              
              this.enemies.splice(j, 1);
              this.kills++;
              
              // Kill streak
              this.killStreak++;
              this.lastKillTime = Date.now();
              
              // Kill streak achievement
              if (this.killStreak >= 10) {
                this.unlockAchievement('unstoppable');
              }
              
              // Speed Demon achievement: 10 kills in 5 seconds
              const now = Date.now();
              this.recentKills.push(now);
              // Remove kills older than 5 seconds
              this.recentKills = this.recentKills.filter(time => now - time <= 5000);
              if (this.recentKills.length >= 10) {
                this.unlockAchievement('speed_demon');
              }
              
              // Weapon upgrade every 25 kills
              const newLevel = Math.floor(this.kills / 25) + 1;
              if (newLevel > this.weaponLevel) {
                this.weaponLevel = newLevel;
                this.screenShake = 20;
                this.createParticles(this.player.x + this.player.width / 2,
                                   this.player.y + this.player.height / 2, '#ffd700', 50);
              }
              
              // Ultimate charge
              const chargeGain = enemy.type === 'boss' ? 50 : enemy.type === 'tank' ? 15 : 10;
              this.ultimateCharge = Math.min(this.ultimateMaxCharge, this.ultimateCharge + chargeGain);
              
              // Combo system
              this.combo.count++;
              this.combo.timer = 180; // 3 seconds
              this.combo.multiplier = Math.min(5, 1 + Math.floor(this.combo.count / 5) * 0.5);
              
              // Combo achievements
              if (this.combo.count >= 3) {
                this.unlockAchievement('combo_starter');
              }
              if (this.combo.count >= 5) {
                this.unlockAchievement('combo_master');
              }
              
              const baseScore = enemy.type.startsWith('boss') ? 1000 : 
                           enemy.type === 'miniboss' ? 300 :
                           enemy.type === 'tank' ? 100 : 
                           enemy.type === 'shooter' ? 75 : 
                           enemy.type === 'healer' ? 90 :
                           enemy.type === 'exploder' ? 60 :
                           enemy.type === 'dodger' ? 80 :
                           enemy.type === 'fast' ? 50 : 25;
              
              this.score += Math.floor(baseScore * this.combo.multiplier);
              this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000', 20);
              
              // Random power-up spawn (10% chance)
              if (Math.random() < 0.1) {
                this.spawnPowerUp(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
              }
              
              if (enemy.type === 'boss') {
                this.screenShake = 30;
                this.screenFlash = 0.8;
                this.screenFlashColor = '#ff0000';
                // Particles explosion for boss death
                this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000', 100);
                this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffff00', 50);
              }
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
            // Dodge chance
            const dodgeChance = this.getSkillValue('dodge') / 100;
            const dodged = Math.random() < dodgeChance;
            
            if (dodged) {
              this.createDamageNumber(this.player.x, this.player.y, 0, '#00ddff');
              this.createParticles(bullet.x, bullet.y, '#00ddff', 10);
            } else {
              this.player.health -= bullet.damage;
              this.player.invulnerable = 60;
              this.waveDamageTaken = true;
              this.createParticles(bullet.x, bullet.y, '#ff0000', 15);
            }
          }
          this.bullets.splice(i, 1);
        }
      }
    }
    
    // Enemies vs Player
    if (this.player.invulnerable === 0 && !this.hasShield) {
      for (const enemy of this.enemies) {
        if (this.rectCollision(this.player.x, this.player.y, this.player.width, this.player.height,
                               enemy.x, enemy.y, enemy.width, enemy.height)) {
          // Dodge chance
          const dodgeChance = this.getSkillValue('dodge') / 100;
          const dodged = Math.random() < dodgeChance;
          
          if (dodged) {
            this.createDamageNumber(this.player.x, this.player.y, 0, '#00ddff');
            this.createParticles(this.player.x + this.player.width / 2, 
                               this.player.y + this.player.height / 2, '#00ddff', 15);
            this.player.invulnerable = 30; // Short invulnerability after dodge
          } else {
            this.player.health -= 25;
            this.player.invulnerable = 60;
            this.waveDamageTaken = true;
            this.screenShake = 20;
            this.createParticles(this.player.x + this.player.width / 2, 
                               this.player.y + this.player.height / 2, '#ff0000', 20);
          }
        }
      }
    }
    
    // Power-ups vs Player
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const powerUp = this.powerUps[i];
      const dx = this.player.x + this.player.width / 2 - powerUp.x;
      const dy = this.player.y + this.player.height / 2 - powerUp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < powerUp.size + 20) {
        this.collectPowerUp(powerUp.type);
        this.powerUps.splice(i, 1);
        this.createParticles(powerUp.x, powerUp.y, '#ffd700', 30);
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
  
  spawnPowerUp(x: number, y: number) {
    const types: PowerUp['type'][] = ['health', 'speed', 'firerate', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    this.powerUps.push({
      x, y,
      type,
      size: 15,
      lifetime: 600 // 10 seconds
    });
  }
  
  collectPowerUp(type: PowerUp['type']) {
    switch (type) {
      case 'health':
        this.player.health = Math.min(this.player.maxHealth, this.player.health + 30);
        this.screenFlash = 0.2;
        this.screenFlashColor = '#00ff00';
        break;
      case 'speed':
        // Only apply if not already active
        if (this.playerSpeed !== 9) {
          this.playerSpeed = 9;
        }
        this.addActivePowerUp(type, 600);
        this.screenFlash = 0.2;
        this.screenFlashColor = '#00ffff';
        break;
      case 'firerate':
        // Only apply if not already active
        if (this.playerFireRate !== 75) {
          this.playerFireRate = 75;
        }
        this.addActivePowerUp(type, 600);
        this.screenFlash = 0.2;
        this.screenFlashColor = '#ffff00';
        break;
      case 'shield':
        this.hasShield = true;
        this.addActivePowerUp(type, 300);
        this.screenFlash = 0.2;
        this.screenFlashColor = '#8a2be2';
        break;
    }
  }
  
  addActivePowerUp(type: PowerUp['type'], duration: number) {
    // Remove existing if present and reset values first
    const existing = this.activePowerUps.findIndex(p => p.type === type);
    if (existing >= 0) {
      // Just refresh duration, don't re-apply effect
      this.activePowerUps[existing].duration = duration;
    } else {
      // New power-up
      this.activePowerUps.push({ type, duration });
    }
  }
  
  removePowerUpEffect(type: PowerUp['type']) {
    // Only remove if no other instance is active
    const stillActive = this.activePowerUps.some(p => p.type === type && p.duration > 0);
    if (stillActive) return;
    
    switch (type) {
      case 'speed':
        this.playerSpeed = 6;
        break;
      case 'firerate':
        this.playerFireRate = 150;
        break;
      case 'shield':
        this.hasShield = false;
        break;
    }
  }
  
  getPowerUpIcon(type: PowerUp['type']): string {
    switch (type) {
      case 'health': return '❤️';
      case 'speed': return '⚡';
      case 'firerate': return '🔥';
      case 'shield': return '🛡️';
    }
  }
  
  activateUltimate() {
    if (this.ultimateCharge < this.ultimateMaxCharge || this.ultimateActive || this.ultimateCooldown > 0) return;
    
    this.ultimateActive = true;
    this.ultimateDuration = 300; // 5 seconds
    this.ultimateCharge = 0;
    this.ultimateCooldown = 900; // 15 seconds cooldown
    this.playerFireRate = 50; // Super fast fire rate
    this.screenShake = 15;
    
    // Screen-wide damage to all enemies
    this.enemies.forEach(enemy => {
      enemy.health -= 100;
      this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffd700', 15);
    });
    
    // Remove enemies with 0 or less health
    this.enemies = this.enemies.filter(enemy => {
      if (enemy.health <= 0) {
        this.kills++;
        this.score += 50;
        return false;
      }
      return true;
    });
  }
  
  dash() {
    if (this.dashCooldown > 0 || this.dashDuration > 0) return;
    
    const dirX = (this.keys['d'] || this.keys['arrowright'] ? 1 : 0) - (this.keys['a'] || this.keys['arrowleft'] ? 1 : 0);
    const dirY = (this.keys['s'] || this.keys['arrowdown'] ? 1 : 0) - (this.keys['w'] || this.keys['arrowup'] ? 1 : 0);
    
    if (dirX === 0 && dirY === 0) return;
    
    const length = Math.sqrt(dirX * dirX + dirY * dirY);
    this.dashDirection = {
      x: dirX / length,
      y: dirY / length
    };
    
    this.dashDuration = 10;
    this.dashCooldown = 120; // 2 seconds
    
    // Leave trail
    for (let i = 0; i < 20; i++) {
      this.createParticles(this.player.x + this.player.width / 2, 
                          this.player.y + this.player.height / 2, '#00ffff', 3);
    }
  }
  
  activateSlowMotion() {
    if (this.slowMotion > 0 || this.slowMotionCooldown > 0 || this.killStreak < 10) return;

    this.slowMotion = 180; // 3 seconds
    this.slowMotionCooldown = 600; // 10 seconds cooldown
    this.killStreak = 0;
  }
  
  createDamageNumber(x: number, y: number, value: number, color: string) {
    this.damageNumbers.push({
      x, y,
      value: Math.floor(value),
      life: 60,
      vy: -2,
      color
    });
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
    // Screen shake effect
    let shakeX = 0, shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake;
      shakeY = (Math.random() - 0.5) * this.screenShake;
    }
    
    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    
    // Clear with black background (canvas)
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    
    // Screen flash effect
    if (this.screenFlash > 0) {
      this.ctx.fillStyle = this.screenFlashColor;
      this.ctx.globalAlpha = this.screenFlash * 0.5;
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.globalAlpha = 1;
    }
    
    // Boss warning overlay
    if (this.bossWarning > 0) {
      const warningAlpha = 0.3 + Math.sin(this.bossWarningTimer * 0.2) * 0.2;
      this.ctx.fillStyle = '#ff0000';
      this.ctx.globalAlpha = warningAlpha;
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.ctx.globalAlpha = 1;
      
      // Warning text
      this.ctx.font = 'bold 60px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 5;
      this.ctx.fillStyle = '#ff0000';
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = '#ff0000';
      const warningText = '⚠️ BOSS WARNING ⚠️';
      this.ctx.strokeText(warningText, this.canvasWidth / 2, this.canvasHeight / 2);
      this.ctx.fillText(warningText, this.canvasWidth / 2, this.canvasHeight / 2);
      this.ctx.shadowBlur = 0;
    }
    
    // Slow motion tint
    if (this.slowMotion > 0) {
      this.ctx.fillStyle = 'rgba(100, 100, 255, 0.1)';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
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
    
    // Spawn warnings
    this.spawnWarnings.forEach(w => {
      this.ctx.strokeStyle = w.type === 'shooter' ? '#ff0000' : '#ffaa00';
      this.ctx.lineWidth = 3;
      this.ctx.globalAlpha = 0.5 + Math.sin(w.life * 0.2) * 0.3;
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeRect(w.x - 10, w.y - 10, 50, 50);
      this.ctx.setLineDash([]);
    });
    this.ctx.globalAlpha = 1;
    
    // Particles
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / 60;
      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = p.color;
      this.ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      this.ctx.shadowBlur = 0;
    });
    this.ctx.globalAlpha = 1;
    
    // Critical hit effects
    this.criticalHitEffect.forEach(effect => {
      const size = (30 - effect.life) * 2;
      this.ctx.strokeStyle = '#ff00ff';
      this.ctx.lineWidth = 3;
      this.ctx.globalAlpha = effect.life / 30;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#ff00ff';
      this.ctx.beginPath();
      this.ctx.arc(effect.x, effect.y, size, 0, Math.PI * 2);
      this.ctx.stroke();
      
      // Star burst lines
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 / 8) * i;
        const x1 = effect.x + Math.cos(angle) * size;
        const y1 = effect.y + Math.sin(angle) * size;
        const x2 = effect.x + Math.cos(angle) * (size + 10);
        const y2 = effect.y + Math.sin(angle) * (size + 10);
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
      this.ctx.shadowBlur = 0;
    });
    this.ctx.globalAlpha = 1;
    
    // Damage numbers
    this.damageNumbers.forEach(d => {
      this.ctx.fillStyle = d.color;
      this.ctx.globalAlpha = d.life / 60;
      this.ctx.font = d.color === '#ff00ff' ? 'bold 28px Courier New' : 'bold 20px Courier New';
      this.ctx.textAlign = 'center';
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = d.color === '#ff00ff' ? 10 : 0;
      this.ctx.shadowColor = d.color;
      this.ctx.strokeText(d.value.toString(), d.x, d.y);
      this.ctx.fillText(d.value.toString(), d.x, d.y);
      this.ctx.shadowBlur = 0;
    });
    this.ctx.globalAlpha = 1;
    
    // Player
    if (this.player.invulnerable > 0 && Math.floor(this.player.invulnerable / 5) % 2 === 0) {
      this.ctx.globalAlpha = 0.5;
    }
    
    // Ultimate effect
    if (this.ultimateActive) {
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 4;
      this.ctx.shadowBlur = 25;
      this.ctx.shadowColor = '#ffd700';
      this.ctx.beginPath();
      this.ctx.arc(this.player.x + this.player.width / 2, 
                   this.player.y + this.player.height / 2, 
                   40 + Math.sin(Date.now() * 0.01) * 5, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
    
    // Shield effect
    if (this.hasShield) {
      this.ctx.strokeStyle = '#8a2be2';
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#8a2be2';
      this.ctx.beginPath();
      this.ctx.arc(this.player.x + this.player.width / 2, 
                   this.player.y + this.player.height / 2, 
                   30, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
    
    // Dash trail effect
    if (this.dashDuration > 0) {
      this.ctx.strokeStyle = '#00ffff';
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = 0.5;
      this.ctx.strokeRect(this.player.x - 5, this.player.y - 5, 
                         this.player.width + 10, this.player.height + 10);
      this.ctx.globalAlpha = 1;
    }
    
    // Draw player with custom shape
    const centerX = this.player.x + this.player.width / 2;
    const centerY = this.player.y + this.player.height / 2;
    const size = this.player.width;
    
    this.ctx.fillStyle = this.player.color;
    this.ctx.strokeStyle = this.player.color;
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = this.player.color;
    
    switch (this.player.shape) {
      case 'square':
        this.ctx.fillRect(this.player.x, this.player.y, size, size);
        this.ctx.strokeRect(this.player.x - 2, this.player.y - 2, size + 4, size + 4);
        break;
      case 'circle':
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        break;
      case 'triangle':
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, this.player.y);
        this.ctx.lineTo(this.player.x, this.player.y + size);
        this.ctx.lineTo(this.player.x + size, this.player.y + size);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        break;
      case 'diamond':
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, this.player.y);
        this.ctx.lineTo(this.player.x + size, centerY);
        this.ctx.lineTo(centerX, this.player.y + size);
        this.ctx.lineTo(this.player.x, centerY);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        break;
    }
    
    this.ctx.shadowBlur = 0;
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
      this.ctx.fillStyle = bullet.fromPlayer ? this.currentWeapon.color : '#ff0000';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = bullet.fromPlayer ? this.currentWeapon.color : '#ff0000';
      this.ctx.beginPath();
      this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    });
    
    // Enemies
    this.enemies.forEach(enemy => {
      const colors: Record<string, string> = {
        basic: '#888888',
        fast: '#ff00ff',
        tank: '#ffaa00',
        shooter: '#ff0000',
        boss: '#ff0000',
        boss_tank: '#ff8800',
        boss_speed: '#00ffff',
        boss_sniper: '#ff00ff',
        healer: '#00ff88',
        exploder: '#ff6600',
        dodger: '#8888ff',
        miniboss: '#ff4444'
      };
      
      this.ctx.fillStyle = colors[enemy.type] || '#ff0000';
      this.ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
      
      // Health bar
      const healthPercent = enemy.health / enemy.maxHealth;
      this.ctx.fillStyle = '#300';
      this.ctx.fillRect(enemy.x, enemy.y - 8, enemy.width, 4);
      this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : healthPercent > 0.25 ? '#ff0' : '#f00';
      this.ctx.fillRect(enemy.x, enemy.y - 8, enemy.width * healthPercent, 4);
      
      // Glow effect
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = colors[enemy.type] || '#ff0000';
      this.ctx.strokeStyle = colors[enemy.type] || '#ff0000';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(enemy.x, enemy.y, enemy.width, enemy.height);
      this.ctx.shadowBlur = 0;
      
      // Boss name display
      if (enemy.type.startsWith('boss') || enemy.type === 'miniboss') {
        const bossNames: Record<string, string> = {
          boss: '👑 BOSS',
          boss_tank: '🛡️ TANK BOSS',
          boss_speed: '⚡ SPEED BOSS',
          boss_sniper: '🎯 SNIPER BOSS',
          miniboss: '⚔️ MINI BOSS'
        };
        
        this.ctx.font = 'bold 16px Courier New';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = colors[enemy.type] || '#ff0000';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = colors[enemy.type] || '#ff0000';
        this.ctx.fillText(bossNames[enemy.type] || '👑 BOSS', enemy.x + enemy.width / 2, enemy.y - 20);
        this.ctx.shadowBlur = 0;
      }
    });
    
    // Power-ups
    this.powerUps.forEach(powerUp => {
      const colors = {
        health: '#00ff00',
        speed: '#00ffff',
        firerate: '#ffa500',
        shield: '#8a2be2'
      };
      
      const icons = {
        health: '❤️',
        speed: '⚡',
        firerate: '🔥',
        shield: '🛡️'
      };
      
      // Glow
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = colors[powerUp.type];
      this.ctx.fillStyle = colors[powerUp.type];
      this.ctx.beginPath();
      this.ctx.arc(powerUp.x, powerUp.y, powerUp.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      
      // Icon
      this.ctx.fillStyle = '#000';
      this.ctx.font = '20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(icons[powerUp.type], powerUp.x, powerUp.y);
    });
    
    this.ctx.restore();
    
    // Render mini-map
    this.renderMiniMap();
  }
  
  renderMiniMap() {
    if (!this.miniMapRef || !this.gameStarted || this.gameOver) return;
    
    const miniCtx = this.miniMapRef.nativeElement.getContext('2d');
    if (!miniCtx) return;
    
    const miniMapWidth = 150;
    const miniMapHeight = 150;
    
    // Calculate scales based on actual canvas dimensions
    const scaleX = miniMapWidth / this.canvasWidth;
    const scaleY = miniMapHeight / this.canvasHeight;
    
    // Clear
    miniCtx.fillStyle = '#000';
    miniCtx.fillRect(0, 0, miniMapWidth, miniMapHeight);
    
    // Player (larger and centered)
    const playerX = this.player.x * scaleX;
    const playerY = this.player.y * scaleY;
    miniCtx.fillStyle = this.player.color;
    miniCtx.shadowBlur = 5;
    miniCtx.shadowColor = this.player.color;
    miniCtx.fillRect(playerX - 3, playerY - 3, 6, 6);
    miniCtx.shadowBlur = 0;
    
    // Enemies
    this.enemies.forEach(enemy => {
      const enemyX = enemy.x * scaleX;
      const enemyY = enemy.y * scaleY;
      
      if (enemy.type === 'boss') {
        miniCtx.fillStyle = '#ff0000';
        miniCtx.shadowBlur = 8;
        miniCtx.shadowColor = '#ff0000';
        miniCtx.fillRect(enemyX - 4, enemyY - 4, 8, 8);
        miniCtx.shadowBlur = 0;
      } else {
        miniCtx.fillStyle = '#ff6600';
        miniCtx.fillRect(enemyX - 1.5, enemyY - 1.5, 3, 3);
      }
    });
    
    // Power-ups
    this.powerUps.forEach(powerUp => {
      const powerUpX = powerUp.x * scaleX;
      const powerUpY = powerUp.y * scaleY;
      miniCtx.fillStyle = '#ffd700';
      miniCtx.shadowBlur = 3;
      miniCtx.shadowColor = '#ffd700';
      miniCtx.fillRect(powerUpX - 1, powerUpY - 1, 2, 2);
      miniCtx.shadowBlur = 0;
    });
    
    // Draw border
    miniCtx.strokeStyle = '#00ff00';
    miniCtx.lineWidth = 1;
    miniCtx.strokeRect(0, 0, miniMapWidth, miniMapHeight);
  }
  
  loadLeaderboard() {
    console.log('Loading leaderboard from:', `${this.apiUrl}/leaderboard`);
    
    // Load all-time leaderboard
    this.http.get<LeaderboardEntry[]>(`${this.apiUrl}/leaderboard?type=alltime`)
      .subscribe({
        next: (data) => {
          console.log('All-time leaderboard loaded:', data);
          this.leaderboardAllTime = this.deduplicateLeaderboard(data).slice(0, 10);
          this.leaderboard = this.leaderboardAllTime;
        },
        error: (err) => {
          console.error('Failed to load all-time leaderboard:', err);
          const saved = localStorage.getItem('bulletHellLeaderboard');
          if (saved) {
            const deduplicated = this.deduplicateLeaderboard(JSON.parse(saved));
            this.leaderboardAllTime = deduplicated;
            this.leaderboard = this.leaderboardAllTime;
          }
        }
      });
    
    // Load 24h leaderboard
    this.http.get<LeaderboardEntry[]>(`${this.apiUrl}/leaderboard?type=24h`)
      .subscribe({
        next: (data) => {
          console.log('24h leaderboard loaded:', data);
          this.leaderboard24h = this.deduplicateLeaderboard(data).slice(0, 10);
        },
        error: (err) => {
          console.error('Failed to load 24h leaderboard:', err);
          const saved = localStorage.getItem('bulletHellLeaderboard');
          if (saved) {
            const deduplicated = this.deduplicateLeaderboard(JSON.parse(saved));
            this.leaderboard24h = this.filter24h(deduplicated);
          }
        }
      });
  }
  
  filter24h(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const now = new Date().getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    return entries.filter(entry => {
      if (!entry.date) return false;
      const entryTime = new Date(entry.date).getTime();
      return (now - entryTime) <= twentyFourHours;
    });
  }
  
  switchLeaderboardType(type: '24h' | 'alltime') {
    this.leaderboardType = type;
  }
  
  deduplicateLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
    const playerMap = new Map<string, LeaderboardEntry>();
    
    // Keep only the highest score for each player (case-insensitive)
    entries.forEach(entry => {
      const playerKey = entry.name.toLowerCase();
      const existing = playerMap.get(playerKey);
      
      if (!existing || entry.score > existing.score) {
        playerMap.set(playerKey, entry);
      }
    });
    
    // Convert back to array and sort by score
    return Array.from(playerMap.values())
      .sort((a, b) => b.score - a.score);
  }
  
  saveLeaderboard() {
    // Deduplicate before saving
    this.leaderboard = this.deduplicateLeaderboard(this.leaderboard);
    localStorage.setItem('bulletHellLeaderboard', JSON.stringify(this.leaderboard));
  }
  
  submitScore() {
    // Check if user is logged in
    if (!this.isLoggedIn) {
      alert('⚠️ Bejelentkezés szükséges a pontszám mentéséhez!');
      return;
    }
    
    const token = this.authService.getToken();
    if (!token) {
      alert('⚠️ Bejelentkezési hiba. Kérlek jelentkezz be újra!');
      return;
    }
    
    const entry = {
      token: token,
      score: this.score,
      wave: this.wave,
      kills: this.kills
    };
    
    console.log('Submitting score to:', `${this.apiUrl}/leaderboard`);
    
    this.http.post<{ success: boolean, leaderboard: LeaderboardEntry[] }>(
      `${this.apiUrl}/leaderboard`,
      entry
    ).subscribe({
      next: (response) => {
        console.log('Score submitted successfully:', response);
        
        // Reload full leaderboard from server
        this.loadLeaderboard();
        
        this.playerNameSubmitted = true;
        this.justSubmitted = true;
        this.showLeaderboard = true;
        
        setTimeout(() => {
          this.justSubmitted = false;
        }, 3000);
      },
      error: (err) => {
        console.error('Failed to save to server:', err);
        
        // Check if error is because player already has a better score
        if (err.error && err.error.existingScore !== undefined) {
          alert(`⚠️ Már van jobb pontszámod (${err.error.existingScore})! Ez a pontszám nem lesz mentve.`);
          this.playerNameSubmitted = true;
          this.showLeaderboard = true;
          return;
        }
        
        if (err.status === 401) {
          alert('⚠️ Bejelentkezési token lejárt. Kérlek jelentkezz be újra!');
          this.authService.logout();
          return;
        }
        
        alert('❌ Hiba a pontszám mentésekor. Próbáld újra később!');
        this.playerNameSubmitted = true;
        this.justSubmitted = true;
        this.showLeaderboard = true;
        
        setTimeout(() => {
          this.justSubmitted = false;
        }, 3000);
      }
    });
  }
  
  toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
  }
  
  toggleAchievements() {
    this.showAchievements = !this.showAchievements;
  }
  
  initAchievements() {
    this.achievements = [
      {
        id: 'first_blood',
        title: 'First Blood',
        description: 'Kill your first enemy',
        icon: '🩸',
        unlocked: false,
        condition: (stats) => stats.kills >= 1
      },
      {
        id: 'killing_spree',
        title: 'Killing Spree',
        description: 'Kill 50 enemies',
        icon: '💀',
        unlocked: false,
        condition: (stats) => stats.kills >= 50
      },
      {
        id: 'mass_murderer',
        title: 'Mass Murderer',
        description: 'Kill 100 enemies',
        icon: '☠️',
        unlocked: false,
        condition: (stats) => stats.kills >= 100
      },
      {
        id: 'genocide',
        title: 'Genocide',
        description: 'Kill 500 enemies',
        icon: '💣',
        unlocked: false,
        condition: (stats) => stats.kills >= 500
      },
      {
        id: 'annihilator',
        title: 'Annihilator',
        description: 'Kill 1000 enemies',
        icon: '⚡',
        unlocked: false,
        condition: (stats) => stats.kills >= 1000
      },
      {
        id: 'survivor',
        title: 'Survivor',
        description: 'Reach wave 5',
        icon: '🛡️',
        unlocked: false,
        condition: (stats) => stats.wave >= 5
      },
      {
        id: 'veteran',
        title: 'Veteran',
        description: 'Reach wave 10',
        icon: '⚔️',
        unlocked: false,
        condition: (stats) => stats.wave >= 10
      },
      {
        id: 'legend',
        title: 'Legend',
        description: 'Reach wave 20',
        icon: '👑',
        unlocked: false,
        condition: (stats) => stats.wave >= 20
      },
      {
        id: 'immortal',
        title: 'Immortal',
        description: 'Reach wave 30',
        icon: '🔥',
        unlocked: false,
        condition: (stats) => stats.wave >= 30
      },
      {
        id: 'god_mode',
        title: 'God Mode',
        description: 'Reach wave 50',
        icon: '😇',
        unlocked: false,
        condition: (stats) => stats.wave >= 50
      },
      {
        id: 'high_score',
        title: 'High Score',
        description: 'Score 1000 points',
        icon: '🌟',
        unlocked: false,
        condition: (stats) => stats.score >= 1000
      },
      {
        id: 'point_master',
        title: 'Point Master',
        description: 'Score 5000 points',
        icon: '💎',
        unlocked: false,
        condition: (stats) => stats.score >= 5000
      },
      {
        id: 'score_legend',
        title: 'Score Legend',
        description: 'Score 10000 points',
        icon: '💰',
        unlocked: false,
        condition: (stats) => stats.score >= 10000
      },
      {
        id: 'dedication',
        title: 'Dedication',
        description: 'Play 10 games',
        icon: '🎮',
        unlocked: false,
        condition: (stats) => stats.totalGamesPlayed >= 10
      },
      {
        id: 'addicted',
        title: 'Addicted',
        description: 'Play 50 games',
        icon: '🕹️',
        unlocked: false,
        condition: (stats) => stats.totalGamesPlayed >= 50
      },
      {
        id: 'no_life',
        title: 'No Life',
        description: 'Play 100 games',
        icon: '🤖',
        unlocked: false,
        condition: (stats) => stats.totalGamesPlayed >= 100
      },
      {
        id: 'boss_slayer',
        title: 'Boss Slayer',
        description: 'Defeat a boss',
        icon: '🐉',
        unlocked: false,
        condition: (stats) => stats.wave >= 5
      },
      {
        id: 'boss_hunter',
        title: 'Boss Hunter',
        description: 'Defeat 5 bosses',
        icon: '🗡️',
        unlocked: false,
        condition: (stats) => stats.wave >= 25
      },
      {
        id: 'boss_destroyer',
        title: 'Boss Destroyer',
        description: 'Defeat 10 bosses',
        icon: '⚔️',
        unlocked: false,
        condition: (stats) => stats.wave >= 50
      },
      {
        id: 'combo_starter',
        title: 'Combo Starter',
        description: 'Reach 3x combo',
        icon: '🔗',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'combo_master',
        title: 'Combo Master',
        description: 'Reach 5x combo',
        icon: '⛓️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'weapon_upgrade',
        title: 'Weapon Upgrade',
        description: 'Upgrade weapon to level 2',
        icon: '🔫',
        unlocked: false,
        condition: (stats) => stats.kills >= 25
      },
      {
        id: 'max_weapon',
        title: 'Max Weapon',
        description: 'Upgrade weapon to max level (5)',
        icon: '💥',
        unlocked: false,
        condition: (stats) => stats.kills >= 100
      },
      {
        id: 'speed_demon',
        title: 'Speed Demon',
        description: 'Kill 10 enemies in 5 seconds',
        icon: '💨',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'unstoppable',
        title: 'Unstoppable',
        description: 'Get 10 kill streak',
        icon: '🔥',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'flawless_victory',
        title: 'Flawless Victory',
        description: 'Complete a wave without taking damage',
        icon: '✨',
        unlocked: false,
        condition: (stats) => false // Checked in game
      }
    ];
  }
  
  initSkills() {
    this.skills = [
      {
        id: 'damage',
        name: 'Damage Boost',
        description: '+5% damage per level',
        icon: '💪',
        maxLevel: 10,
        currentLevel: 0,
        cost: 1,
        effect: { type: 'damage', value: 5, perLevel: 5 }
      },
      {
        id: 'health',
        name: 'Max Health',
        description: '+10 max health per level',
        icon: '❤️',
        maxLevel: 10,
        currentLevel: 0,
        cost: 1,
        effect: { type: 'health', value: 10, perLevel: 10 }
      },
      {
        id: 'speed',
        name: 'Movement Speed',
        description: '+5% speed per level',
        icon: '⚡',
        maxLevel: 5,
        currentLevel: 0,
        cost: 1,
        effect: { type: 'speed', value: 5, perLevel: 5 }
      },
      {
        id: 'firerate',
        name: 'Fire Rate',
        description: '+5% fire rate per level',
        icon: '🔫',
        maxLevel: 8,
        currentLevel: 0,
        cost: 1,
        effect: { type: 'firerate', value: 5, perLevel: 5 }
      },
      {
        id: 'crit',
        name: 'Critical Hit',
        description: '+2% crit chance per level',
        icon: '💥',
        maxLevel: 5,
        currentLevel: 0,
        cost: 2,
        effect: { type: 'crit', value: 2, perLevel: 2 }
      },
      {
        id: 'regen',
        name: 'Health Regeneration',
        description: 'Regen 1 HP every 5 seconds per level',
        icon: '🌿',
        maxLevel: 3,
        currentLevel: 0,
        cost: 2,
        effect: { type: 'regen', value: 1, perLevel: 1 }
      },
      {
        id: 'dodge',
        name: 'Dodge Chance',
        description: '+3% dodge chance per level',
        icon: '💨',
        maxLevel: 5,
        currentLevel: 0,
        cost: 2,
        effect: { type: 'dodge', value: 3, perLevel: 3 }
      },
      {
        id: 'vampirism',
        name: 'Life Steal',
        description: '+5% life steal per level',
        icon: '🧛',
        maxLevel: 4,
        currentLevel: 0,
        cost: 3,
        effect: { type: 'vampirism', value: 5, perLevel: 5 }
      },
      {
        id: 'pierce',
        name: 'Bullet Pierce',
        description: 'Bullets pierce +1 enemy per level',
        icon: '🎯',
        maxLevel: 3,
        currentLevel: 0,
        cost: 3,
        effect: { type: 'pierce', value: 1, perLevel: 1 }
      },
      {
        id: 'explosion',
        name: 'Explosive Rounds',
        description: '+10% AoE damage per level',
        icon: '💣',
        maxLevel: 3,
        currentLevel: 0,
        cost: 3,
        effect: { type: 'explosion', value: 10, perLevel: 10 }
      }
    ];
  }
  
  loadSkills() {
    const saved = localStorage.getItem('skills');
    if (saved) {
      const savedSkills = JSON.parse(saved);
      savedSkills.forEach((saved: Skill) => {
        const skill = this.skills.find(s => s.id === saved.id);
        if (skill) {
          skill.currentLevel = saved.currentLevel;
        }
      });
    }
    
    const savedPoints = localStorage.getItem('skillPoints');
    if (savedPoints) {
      this.skillPoints = parseInt(savedPoints);
    }
  }
  
  saveSkills() {
    localStorage.setItem('skills', JSON.stringify(this.skills));
    localStorage.setItem('skillPoints', this.skillPoints.toString());
  }
  
  upgradeSkill(skillId: string) {
    const skill = this.skills.find(s => s.id === skillId);
    if (!skill) return;
    
    if (skill.currentLevel >= skill.maxLevel) return;
    if (this.skillPoints < skill.cost) return;
    
    skill.currentLevel++;
    this.skillPoints -= skill.cost;
    
    // Apply skill effect immediately if in game
    if (this.gameStarted && !this.gameOver) {
      this.applySkillEffects();
    }
    
    this.saveSkills();
  }
  
  applySkillEffects() {
    // Apply skill bonuses to base values
    const baseMaxHealth = 100;
    const baseSpeed = 5;
    
    let healthBonus = 0;
    let speedMultiplier = 1;
    
    this.skills.forEach(skill => {
      if (skill.currentLevel === 0) return;
      
      const totalBonus = skill.effect.value + (skill.currentLevel - 1) * skill.effect.perLevel;
      
      switch (skill.effect.type) {
        case 'health':
          healthBonus += totalBonus;
          break;
        case 'speed':
          speedMultiplier += totalBonus / 100;
          break;
      }
    });
    
    // Apply to player
    const oldMaxHealth = this.player.maxHealth;
    this.player.maxHealth = baseMaxHealth + healthBonus;
    
    // Heal proportionally if max health increased
    if (this.player.maxHealth > oldMaxHealth) {
      const healthRatio = this.player.health / oldMaxHealth;
      this.player.health = this.player.maxHealth * healthRatio;
    }
    
    this.player.speed = baseSpeed * speedMultiplier;
  }
  
  getSkillValue(type: SkillEffect['type']): number {
    const skill = this.skills.find(s => s.effect.type === type);
    if (!skill || skill.currentLevel === 0) return 0;
    return skill.effect.value + (skill.currentLevel - 1) * skill.effect.perLevel;
  }
  
  toggleSkills() {
    this.showSkills = !this.showSkills;
  }
  
  loadAchievements() {
    const saved = localStorage.getItem('bulletHellAchievements');
    if (saved) {
      const savedAchievements = JSON.parse(saved);
      this.achievements.forEach(achievement => {
        const saved = savedAchievements.find((a: Achievement) => a.id === achievement.id);
        if (saved) {
          achievement.unlocked = saved.unlocked;
        }
      });
    }
  }
  
  saveAchievements() {
    localStorage.setItem('bulletHellAchievements', JSON.stringify(this.achievements));
  }
  
  loadStats() {
    const saved = localStorage.getItem('bulletHellStats');
    if (saved) {
      const stats = JSON.parse(saved);
      this.totalGamesPlayed = stats.totalGamesPlayed || 0;
    }
  }
  
  saveStats() {
    const stats = {
      totalGamesPlayed: this.totalGamesPlayed
    };
    localStorage.setItem('bulletHellStats', JSON.stringify(stats));
  }
  
  checkAchievements() {
    const stats: GameStats = {
      score: this.score,
      wave: this.wave,
      kills: this.kills,
      totalGamesPlayed: this.totalGamesPlayed
    };
    
    let newUnlocks: Achievement[] = [];
    
    this.achievements.forEach(achievement => {
      if (!achievement.unlocked && achievement.condition(stats)) {
        achievement.unlocked = true;
        newUnlocks.push(achievement);
      }
    });
    
    if (newUnlocks.length > 0) {
      this.saveAchievements();
      this.showAchievementNotification(newUnlocks[0]);
    }
  }
  
  showAchievementNotification(achievement: Achievement) {
    this.currentUnlockNotification = achievement;
    setTimeout(() => {
      this.currentUnlockNotification = null;
    }, 5000);
  }
  
  unlockAchievement(id: string) {
    const achievement = this.achievements.find(a => a.id === id);
    if (achievement && !achievement.unlocked) {
      achievement.unlocked = true;
      this.saveAchievements();
      this.showAchievementNotification(achievement);
    }
  }
  
  loadAdSense() {
    // Load AdSense script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5062569894299417';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
    
    // Initialize ads after script loads
    script.onload = () => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (e) {
        console.log('AdSense error:', e);
      }
    };
    
    // Start ad close timer
    setInterval(() => {
      if (this.adTimer > 0) {
        this.adTimer--;
      }
    }, 1000);
  }
  
  closeAd() {
    if (this.adTimer <= 0) {
      const adElement = document.getElementById('ad-interstitial');
      if (adElement) adElement.style.display = 'none';
    }
  }
  
  watchAdForContinue() {
    if (this.adWatched) {
      alert('You already watched an ad this game!');
      return;
    }
    
    // Simulate ad watching (replace with real AdMob rewarded ad SDK)
    this.adWatched = true;
    let countdown = 5;
    
    const adBtn = document.querySelector('.rewarded-ad-btn') as HTMLElement;
    if (adBtn) adBtn.textContent = '📺 Watching Ad... ' + countdown + 's';
    
    const adInterval = setInterval(() => {
      countdown--;
      if (adBtn) adBtn.textContent = '📺 Watching Ad... ' + countdown + 's';
      
      if (countdown <= 0) {
        clearInterval(adInterval);
        this.grantContinue();
      }
    }, 1000);
  }
  
  grantContinue() {
    // Reward: Continue with 50% HP
    this.player.health = Math.floor(this.player.maxHealth * 0.5);
    this.gameOver = false;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.createParticles(this.player.x + this.player.width / 2,
                        this.player.y + this.player.height / 2, '#00ff00', 50);
    
    alert('💚 Continue granted! You respawned with 50% HP!');
    this.gameLoop();
  }
  
  // Auth methods
  handleAuth() {
    this.authError = '';
    
    if (!this.authUsername.trim() || !this.authPassword.trim()) {
      this.authError = 'Felhasználónév és jelszó kötelező!';
      return;
    }
    
    if (this.authMode === 'register') {
      this.authService.register(this.authUsername, this.authPassword, this.authEmail).subscribe({
        next: (response) => {
          console.log('Registration successful:', response);
          this.authError = '';
          this.authPassword = '';
          this.authEmail = '';
          alert('✅ Sikeres regisztráció! Most már játszhatsz!');
        },
        error: (err) => {
          console.error('Registration failed:', err);
          this.authError = err.error?.error || 'Regisztráció sikertelen!';
        }
      });
    } else {
      this.authService.login(this.authUsername, this.authPassword).subscribe({
        next: (response) => {
          console.log('Login successful:', response);
          this.authError = '';
          this.authPassword = '';
          alert('✅ Sikeres bejelentkezés!');
        },
        error: (err) => {
          console.error('Login failed:', err);
          this.authError = err.error?.error || 'Bejelentkezés sikertelen!';
        }
      });
    }
  }
  
  handleLogout() {
    this.authService.logout();
    this.authUsername = '';
    this.authPassword = '';
    this.authEmail = '';
    this.authError = '';
    alert('👋 Kijelentkeztél!');
  }
  
  // Admin methods
  toggleAdminPanel() {
    this.showAdminPanel = !this.showAdminPanel;
    if (this.showAdminPanel) {
      this.loadAdminStats();
      this.loadAnnouncement();
    }
  }
  
  loadAdminStats() {
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getStats', token })
    })
    .then(res => res.json())
    .then(data => {
      this.adminStats = data;
    })
    .catch(err => console.error('Failed to load admin stats:', err));
  }
  
  loadAdminUsers() {
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'getUsers', token })
    })
    .then(res => res.json())
    .then(data => {
      this.adminUsers = data.users;
    })
    .catch(err => console.error('Failed to load users:', err));
  }
  
  loadAdminScores() {
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'getAllScores', 
        token,
        page: this.adminScorePage,
        limit: 50
      })
    })
    .then(res => res.json())
    .then(data => {
      this.adminScores = data.scores;
      this.adminScoreTotalPages = data.totalPages;
    })
    .catch(err => console.error('Failed to load scores:', err));
  }
  
  deleteUser(userId: number) {
    if (!confirm('Biztosan törölni akarod ezt a felhasználót?')) return;
    
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteUser', token, userId })
    })
    .then(res => res.json())
    .then(() => {
      alert('✅ Felhasználó törölve!');
      this.loadAdminUsers();
    })
    .catch(err => {
      console.error('Failed to delete user:', err);
      alert('❌ Hiba a törlés során!');
    });
  }
  
  deleteScore(scoreId: number) {
    if (!confirm('Biztosan törölni akarod ezt a score-t?')) return;
    
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteScore', token, scoreId })
    })
    .then(res => res.json())
    .then(() => {
      alert('✅ Score törölve!');
      if (this.adminTab === 'stats') {
        this.loadAdminStats();
      } else {
        this.loadAdminScores();
      }
      this.loadLeaderboard(); // Refresh main leaderboard too
    })
    .catch(err => {
      console.error('Failed to delete score:', err);
      alert('❌ Hiba a törlés során!');
    });
  }
  
  setAnnouncement() {
    if (!this.announcementText.trim()) {
      alert('⚠️ Add meg az üzenetet!');
      return;
    }
    
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'setAnnouncement', 
        token,
        message: this.announcementText 
      })
    })
    .then(res => res.json())
    .then(() => {
      alert('✅ Üzenet beállítva!');
      this.globalAnnouncement = this.announcementText;
    })
    .catch(err => {
      console.error('Failed to set announcement:', err);
      alert('❌ Hiba az üzenet beállításakor!');
    });
  }
  
  clearAnnouncement() {
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearAnnouncement', token })
    })
    .then(res => res.json())
    .then(() => {
      alert('✅ Üzenet törölve!');
      this.announcementText = '';
      this.globalAnnouncement = '';
    })
    .catch(err => {
      console.error('Failed to clear announcement:', err);
      alert('❌ Hiba az üzenet törlésekor!');
    });
  }
  
  loadAnnouncement() {
    fetch('/.netlify/functions/announcement')
    .then(res => res.json())
    .then(data => {
      if (data.announcement) {
        this.globalAnnouncement = data.announcement;
      }
    })
    .catch(err => console.error('Failed to load announcement:', err));
  }
  
  // Edit Score Modal Methods
  openEditScoreModal(entry: any) {
    this.editingScore = entry;
    this.editScoreData = {
      score: entry.score,
      wave: entry.wave,
      kills: entry.kills
    };
    this.showEditScoreModal = true;
  }
  
  closeEditScoreModal() {
    this.showEditScoreModal = false;
    this.editingScore = null;
  }
  
  saveEditedScore() {
    const token = this.authService.getToken();
    if (!token || !this.editingScore) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'editScore',
        token,
        scoreId: this.editingScore.id,
        newScore: this.editScoreData.score,
        newWave: this.editScoreData.wave,
        newKills: this.editScoreData.kills
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert('✅ Score módosítva!');
        this.closeEditScoreModal();
        this.loadLeaderboard();
      } else {
        alert('❌ Hiba: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(err => {
      console.error('Failed to edit score:', err);
      alert('❌ Hiba a score módosításakor!');
    });
  }
  
  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
  }
}
