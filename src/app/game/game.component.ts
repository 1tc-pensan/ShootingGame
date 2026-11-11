import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription, fromEvent } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SoundService } from './sound.service';
import {
  ActiveMutatorId, MUTATORS, MUTATOR_IDS, MutatorDef, MutatorId, RUN_UPGRADES, RunStacks, RunUpgradeDef, RunUpgradeId,
  emptyRunStacks, mutatorDef
} from './game-mutators';
import {
  ACTION_LABELS, ARROW_ALTERNATIVES, CONTROL_ACTIONS, ControlAction, DEFAULT_BINDINGS,
  RESERVED_KEYS, keyLabel, loadBindings, saveBindings
} from './game-controls';
import {
  LeaderboardMode,
  GraphicsQuality,
  Difficulty,
  GameMode,
  PermanentUpgrade,
  Player,
  PlayerCustomization,
  Bullet,
  Enemy,
  Particle,
  LeaderboardEntry,
  Achievement,
  GameStats,
  PowerUp,
  ComboSystem,
  DamageNumber,
  SpawnWarning,
  WeaponUpgrade,
  Weapon,
  Skill,
  SkillEffect,
  ColorOption
} from './game.types';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('previewCanvas') previewCanvasRef?: ElementRef<HTMLCanvasElement>;
  
  private subscriptions = new Subscription();
  private ctx!: CanvasRenderingContext2D;
  private animationId: number = 0;
  
  // Auth service
  authService = inject(AuthService);
  sound = inject(SoundService);

  // Graphics quality / performance
  graphicsQuality: GraphicsQuality = 'auto';
  private autoLowFx = false;
  private lastFrameTime = 0;
  private accumulator = 0;
  private slowFrames = 0;
  private readonly STEP_MS = 1000 / 60;

  get lowFx(): boolean {
    return this.graphicsQuality === 'low' || (this.graphicsQuality === 'auto' && this.autoLowFx);
  }

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
  gameStartTime: number = 0;
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
  shockwaves: { x: number, y: number, radius: number, maxRadius: number, color: string }[] = [];
  
  @ViewChild('miniMapCanvas') miniMapRef?: ElementRef<HTMLCanvasElement>;
  
  private http = inject(HttpClient);
  private apiUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/.netlify/functions';
  
  keys: { [key: string]: boolean } = {};
  mouseX: number = 0;
  mouseY: number = 0;

  // Rebindable keyboard controls
  readonly controlActions = CONTROL_ACTIONS;
  bindings: Record<ControlAction, string> = loadBindings();
  rebindingAction: ControlAction | null = null;
  showKeybinds = false;

  // Touch controls (virtual twin-stick); shown automatically on touch-first devices
  showTouchControls = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  touchMove = { x: 0, y: 0 };
  touchAim = { x: 0, y: 0, active: false };
  moveKnob = { x: 0, y: 0 };
  aimKnob = { x: 0, y: 0 };

  // Mutators (optional run modifiers; also applied to the daily challenge)
  readonly mutators: MutatorDef[] = MUTATORS;
  currentMutator: MutatorId = 'none';
  timeScale = 1;
  private timeAccum = 0;

  // Parry (reflect nearby enemy bullets)
  parryTimer = 0;
  parryCooldown = 0;

  // Per-run upgrade draft (offered every 2 waves)
  runStacks: RunStacks = emptyRunStacks();
  runUpgradeList: { def: RunUpgradeDef; n: number }[] = [];
  showUpgradePicker = false;
  upgradeChoices: RunUpgradeDef[] = [];
  private lastPickerWave = 1;

  // Tutorial
  showTutorial = false;
  private tutorialPausedGame = false;
  
  score: number = 0;
  wave: number = 1;
  kills: number = 0;
  gameOver: boolean = false;
  gameStarted: boolean = false;
  isPaused: boolean = false;
  
  // Game mode & difficulty
  currentDifficulty: Difficulty = 'normal';
  currentGameMode: GameMode = 'classic';
  showDifficultySelect: boolean = false;
  showGameModeSelect: boolean = false;
  
  // Coins & Permanent Upgrades
  totalCoins: number = 0;
  showShop: boolean = false;
  permanentUpgrades: PermanentUpgrade[] = [];
  
  // Time Attack mode
  timeAttackKillGoal: number = 100;
  timeAttackStartTime: number = 0;
  
  // Boss Rush mode
  bossRushKillCount: number = 0;
  
  lastShot: number = 0;
  shootCooldown: number = 150;
  
  // Weapon system
  weapons: Weapon[] = [
    {
      id: 'pistol',
      name: '🔫 Pisztoly',
      description: 'Gyors tüzelés, közepes sebzés',
      fireRate: 180,
      bulletCount: 1,
      bulletSpeed: 12,
      bulletSize: 4,
      damage: 35,
      spreadAngle: 0,
      color: '#00ffff'
    },
    {
      id: 'shotgun',
      name: '💥 Sörétes',
      description: 'Lassú tüzelés, sok lövedék',
      fireRate: 550,
      bulletCount: 7,
      bulletSpeed: 9,
      bulletSize: 3,
      damage: 20,
      spreadAngle: 0.35,
      color: '#ff8800'
    },
    {
      id: 'rifle',
      name: '🎯 Puska',
      description: 'Magas sebzés, pontos',
      fireRate: 350,
      bulletCount: 1,
      bulletSpeed: 16,
      bulletSize: 5,
      damage: 75,
      spreadAngle: 0,
      color: '#ff00ff'
    },
    {
      id: 'minigun',
      name: '⚡ Minigun',
      description: 'Nagyon gyors tüzelés, alacsony sebzés',
      fireRate: 110,
      bulletCount: 1,
      bulletSpeed: 11,
      bulletSize: 3,
      damage: 15,
      spreadAngle: 0.20,
      color: '#ffff00'
    },
    {
      id: 'burst',
      name: '💫 Sorozat',
      description: '3 lövedékes sorozat',
      fireRate: 450,
      bulletCount: 3,
      bulletSpeed: 14,
      bulletSize: 4,
      damage: 40,
      spreadAngle: 0.12,
      color: '#00ff88'
    },
    {
      id: 'sniper',
      name: '🎪 Mesterlövész',
      description: 'Lassú, brutális sebzés',
      fireRate: 900,
      bulletCount: 1,
      bulletSpeed: 22,
      bulletSize: 6,
      damage: 200,
      spreadAngle: 0,
      color: '#ff0088'
    },
    {
      id: 'railgun',
      name: '🚀 Railgun',
      description: 'Áthatoló lövedék, több ellenséget is eltalál',
      fireRate: 700,
      bulletCount: 1,
      bulletSpeed: 26,
      bulletSize: 5,
      damage: 110,
      spreadAngle: 0,
      color: '#9ad7ff',
      specialEffect: 'pierce',
      pierce: 4
    }
  ];
  
  difficulties: Difficulty[] = ['easy', 'normal', 'hard', 'nightmare'];
  
  getWeaponName(weaponId: string): string {
    const names: any = {
      'hu': {
        'pistol': '🔫 Pisztoly',
        'shotgun': '💥 Sörétes',
        'rifle': '🎯 Puska',
        'minigun': '⚡ Minigun',
        'burst': '💫 Sorozat',
        'sniper': '🎪 Mesterlövész',
        'railgun': '🚀 Railgun'
      },
      'en': {
        'pistol': '🔫 Pistol',
        'shotgun': '💥 Shotgun',
        'rifle': '🎯 Rifle',
        'minigun': '⚡ Minigun',
        'burst': '💫 Burst Rifle',
        'sniper': '🎪 Sniper',
        'railgun': '🚀 Railgun'
      }
    };
    return names[this.language][weaponId] || weaponId;
  }
  
  getWeaponDesc(weaponId: string): string {
    const descs: any = {
      'hu': {
        'pistol': 'Gyors tüzelés, közepes sebzés',
        'shotgun': 'Lassú tüzelés, sok lövedék',
        'rifle': 'Magas sebzés, pontos',
        'minigun': 'Nagyon gyors tüzelés, alacsony sebzés',
        'burst': '3 lövedékes sorozat',
        'sniper': 'Lassú, brutális sebzés',
        'railgun': 'Áthatoló lövedék, több ellenséget is eltalál'
      },
      'en': {
        'pistol': 'Fast fire rate, medium damage',
        'shotgun': 'Slow fire, many bullets',
        'rifle': 'High damage, accurate',
        'minigun': 'Very fast fire, low damage',
        'burst': '3-bullet burst',
        'sniper': 'Slow, brutal damage',
        'railgun': 'Piercing shot that hits several enemies'
      }
    };
    return descs[this.language][weaponId] || '';
  }
  
  getDifficultyIcon(diff: Difficulty): string {
    const icons: Record<Difficulty, string> = { 'easy': '😊', 'normal': '⚔️', 'hard': '💀', 'nightmare': '👹' };
    return icons[diff];
  }
  
  getDifficultyName(diff: Difficulty): string {
    if (this.language === 'hu') {
      const names: Record<Difficulty, string> = { 'easy': 'Könnyű', 'normal': 'Normál', 'hard': 'Nehéz', 'nightmare': 'Rémálom' };
      return names[diff];
    } else {
      const names: Record<Difficulty, string> = { 'easy': 'Easy', 'normal': 'Normal', 'hard': 'Hard', 'nightmare': 'Nightmare' };
      return names[diff];
    }
  }
  
  getDifficultyDesc(diff: Difficulty): string {
    if (this.language === 'hu') {
      const descs: Record<Difficulty, string> = {
        'easy': '-30% ellenség HP, +20% pontszám',
        'normal': 'Alapértelmezett nehézség',
        'hard': '+50% ellenség HP/sebzés, +50% pontszám',
        'nightmare': '+100% HP/sebzés/sebesség, +100% pontszám'
      };
      return descs[diff];
    } else {
      const descs: Record<Difficulty, string> = {
        'easy': '-30% enemy HP, +20% score',
        'normal': 'Default difficulty',
        'hard': '+50% enemy HP/damage, +50% score',
        'nightmare': '+100% HP/damage/speed, +100% score'
      };
      return descs[diff];
    }
  }
  
  getDifficultyReward(diff: Difficulty): string {
    if (this.language === 'hu') {
      const rewards: Record<Difficulty, string> = { 'easy': '📊 Kedvező kezdőknek', 'normal': '⭐ Kiegyensúlyozott', 'hard': '🏆 Nagyobb kihívás', 'nightmare': '💎 Maximális jutalom' };
      return rewards[diff];
    } else {
      const rewards: Record<Difficulty, string> = { 'easy': '📊 Beginner friendly', 'normal': '⭐ Balanced', 'hard': '🏆 Greater challenge', 'nightmare': '💎 Maximum reward' };
      return rewards[diff];
    }
  }
  
  selectDifficulty(diff: Difficulty) {
    this.currentDifficulty = diff;
    localStorage.setItem('selectedDifficulty', diff);
    // Apply difficulty immediately if game is in progress
    if (this.gameStarted && !this.isPaused) {
      // No need to reload, changes apply dynamically
    }
  }
  
  selectGameMode(mode: GameMode) {
    this.currentGameMode = mode;
    localStorage.setItem('selectedGameMode', mode);
    // Apply game mode immediately if game is in progress
    if (this.gameStarted && !this.isPaused) {
      // No need to reload, changes apply dynamically
    }
  }
  
  getDifficultyMultipliers() {
    const multipliers = {
      'easy': { enemyHP: 0.7, enemySpeed: 0.9, enemyDamage: 0.8, scoreBonus: 0.8 },
      'normal': { enemyHP: 1.0, enemySpeed: 1.0, enemyDamage: 1.0, scoreBonus: 1.0 },
      'hard': { enemyHP: 1.5, enemySpeed: 1.2, enemyDamage: 1.5, scoreBonus: 1.5 },
      'nightmare': { enemyHP: 2.0, enemySpeed: 1.5, enemyDamage: 2.0, scoreBonus: 2.0 }
    };
    return multipliers[this.currentDifficulty];
  }
  
  // Permanent Upgrades System
  initPermanentUpgrades() {
    this.permanentUpgrades = [
      { id: 'max_health', name: this.language === 'hu' ? 'Max Életerő' : 'Max Health', description: this.language === 'hu' ? '+20 Max HP' : '+20 Max HP', cost: 10, level: 0, maxLevel: 10, effect: 'maxHealth', value: 20 },
      { id: 'base_damage', name: this.language === 'hu' ? 'Alap Sebzés' : 'Base Damage', description: this.language === 'hu' ? '+10% Sebzés' : '+10% Damage', cost: 15, level: 0, maxLevel: 10, effect: 'damage', value: 0.1 },
      { id: 'move_speed', name: this.language === 'hu' ? 'Mozgási Sebesség' : 'Move Speed', description: this.language === 'hu' ? '+5% Sebesség' : '+5% Speed', cost: 12, level: 0, maxLevel: 10, effect: 'speed', value: 0.05 },
      { id: 'fire_rate', name: this.language === 'hu' ? 'Tüzelési Sebesség' : 'Fire Rate', description: this.language === 'hu' ? '+8% Tüzelés' : '+8% Fire Rate', cost: 18, level: 0, maxLevel: 10, effect: 'fireRate', value: 0.08 },
      { id: 'coin_gain', name: this.language === 'hu' ? 'Érem Gyűjtés' : 'Coin Gain', description: this.language === 'hu' ? '+25% Érmék' : '+25% Coins', cost: 20, level: 0, maxLevel: 5, effect: 'coinMultiplier', value: 0.25 },
      { id: 'start_weapon', name: this.language === 'hu' ? 'Kezdő Fegyver' : 'Starting Weapon', description: this.language === 'hu' ? 'Kezdés 1 szinttel' : 'Start at Level 1', cost: 50, level: 0, maxLevel: 3, effect: 'startingWeaponLevel', value: 1 },
      { id: 'regen', name: this.language === 'hu' ? 'Regeneráció' : 'Regeneration', description: this.language === 'hu' ? '1 HP / 5 sec' : '1 HP / 5 sec', cost: 30, level: 0, maxLevel: 5, effect: 'healthRegen', value: 1 },
      { id: 'shield_chance', name: this.language === 'hu' ? 'Pajzs Esély' : 'Shield Chance', description: this.language === 'hu' ? '+5% Pajzs' : '+5% Shield', cost: 25, level: 0, maxLevel: 4, effect: 'shieldChance', value: 0.05 }
    ];
  }
  
  getUpgradeCost(upgrade: PermanentUpgrade): number {
    return Math.floor(upgrade.cost * Math.pow(1.5, upgrade.level));
  }
  
  canAffordUpgrade(upgrade: PermanentUpgrade): boolean {
    return this.totalCoins >= this.getUpgradeCost(upgrade) && upgrade.level < upgrade.maxLevel;
  }
  
  purchaseUpgrade(upgrade: PermanentUpgrade) {
    if (!this.canAffordUpgrade(upgrade)) return;
    
    const cost = this.getUpgradeCost(upgrade);
    this.totalCoins -= cost;
    upgrade.level++;
    
    this.saveCoins(); // Saves both coins and upgrades
    
    // Show visual feedback and success message
    alert(`✅ ${upgrade.name} vásárlás sikeres! A fejlesztés a következő játékban aktiválódik.`);
  }
  
  applyPermanentUpgrades() {
    const maxHealthUpgrade = this.permanentUpgrades.find(u => u.id === 'max_health');
    if (maxHealthUpgrade) {
      const newMaxHealth = 100 + (maxHealthUpgrade.level * maxHealthUpgrade.value);
      this.player.maxHealth = newMaxHealth;
      // Don't reduce health if it's already higher
      // Only adjust if we bought a new upgrade during game
    }
    
    const speedUpgrade = this.permanentUpgrades.find(u => u.id === 'move_speed');
    if (speedUpgrade) {
      const newSpeed = 6 * (1 + speedUpgrade.level * speedUpgrade.value);
      this.player.speed = newSpeed;
      this.playerSpeed = newSpeed;
    }
    
    const fireRateUpgrade = this.permanentUpgrades.find(u => u.id === 'fire_rate');
    if (fireRateUpgrade) {
      const newCooldown = Math.floor(150 * (1 - fireRateUpgrade.level * fireRateUpgrade.value));
      this.shootCooldown = newCooldown;
      this.playerFireRate = newCooldown;
    }
  }
  
  getUpgradeEffect(effectType: string): number {
    const upgrade = this.permanentUpgrades.find(u => u.effect === effectType);
    return upgrade ? upgrade.level * upgrade.value : 0;
  }
  
  async saveCoins() {
    const token = this.authService.getToken();
    
    if (!token) {
      // Fallback to localStorage if not logged in
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('bulletHellCoins', this.totalCoins.toString());
        localStorage.setItem('bulletHellUpgrades', JSON.stringify(this.permanentUpgrades));
      }
      return;
    }
    
    try {
      await this.http.post(`${this.apiUrl}/profile`, {
        token,
        coins: this.totalCoins,
        permanentUpgrades: this.permanentUpgrades
      }).toPromise();
    } catch (error) {
      console.error('Failed to save coins:', error);
      // Fallback to localStorage on error
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('bulletHellCoins', this.totalCoins.toString());
        localStorage.setItem('bulletHellUpgrades', JSON.stringify(this.permanentUpgrades));
      }
    }
  }
  
  async loadCoins() {
    const token = this.authService.getToken();
    
    if (!token) {
      // Fallback to localStorage if not logged in
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedCoins = localStorage.getItem('bulletHellCoins');
        if (savedCoins) {
          this.totalCoins = parseInt(savedCoins, 10);
        }
        
        const savedUpgrades = localStorage.getItem('bulletHellUpgrades');
        if (savedUpgrades) {
          const loadedUpgrades = JSON.parse(savedUpgrades);
          loadedUpgrades.forEach((saved: any) => {
            const existing = this.permanentUpgrades.find(u => u.id === saved.id);
            if (existing) {
              existing.level = saved.level || 0;
            }
          });
        }
      }
      return;
    }
    
    try {
      const response: any = await this.http.get(`${this.apiUrl}/profile?token=${token}`).toPromise();
      this.totalCoins = response.coins || 0;
      
      // Load upgrades too
      if (response.permanentUpgrades && Array.isArray(response.permanentUpgrades)) {
        response.permanentUpgrades.forEach((saved: any) => {
          const existing = this.permanentUpgrades.find(u => u.id === saved.id);
          if (existing) {
            existing.level = saved.level || 0;
          }
        });
      }
    } catch (error) {
      console.error('Failed to load coins:', error);
      // Fallback to localStorage on error
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedCoins = localStorage.getItem('bulletHellCoins');
        if (savedCoins) {
          this.totalCoins = parseInt(savedCoins, 10);
        }
        
        const savedUpgrades = localStorage.getItem('bulletHellUpgrades');
        if (savedUpgrades) {
          const loadedUpgrades = JSON.parse(savedUpgrades);
          loadedUpgrades.forEach((saved: any) => {
            const existing = this.permanentUpgrades.find(u => u.id === saved.id);
            if (existing) {
              existing.level = saved.level || 0;
            }
          });
        }
      }
    }
  }
  
  async savePermanentUpgrades() {
    const token = this.authService.getToken();
    if (!token) return;
    
    try {
      await this.http.post(`${this.apiUrl}/profile`, {
        token,
        coins: this.totalCoins,
        permanentUpgrades: this.permanentUpgrades
      }).toPromise();
    } catch (error) {
      console.error('Failed to save upgrades:', error);
    }
  }
  
  // Removed - now handled in loadCoins()
  
  currentWeapon: Weapon = this.weapons[0];
  waveSpawnTimer: number = 0;
  bossSpawned: boolean = false;
  
  leaderboard: LeaderboardEntry[] = [];
  leaderboards: Record<string, LeaderboardEntry[]> = {};
  leaderboardDifficulty: Difficulty = 'normal';
  readonly leaderboardDifficulties: Difficulty[] = ['easy', 'normal', 'hard', 'nightmare'];
  leaderboardType: '24h' | 'alltime' = 'alltime';
  leaderboardGameMode: LeaderboardMode = 'classic';
  leaderboardMutator: ActiveMutatorId = 'timeflow';
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
  
  // Language
  language: 'hu' | 'en' = 'hu';
  
  // Admin properties
  showAdminPanel: boolean = false;
  adminTab: 'stats' | 'users' | 'announce' | 'actions' = 'stats';
  adminStats: any = {
    totalUsers: 0,
    totalScores: 0,
    topScore: 0,
    totalKills: 0,
    maxWave: 0,
    suspiciousScores: []
  };
  adminUsers: any[] = [];
  announcementText: string = '';
  globalAnnouncement: string = '';
  
  // Change Password Modal
  showPasswordChangeModal: boolean = false;
  changingPasswordUser: any = null;
  newPasswordInput: string = '';
  
  // Edit Score Modal
  showEditScoreModal: boolean = false;
  editingScore: any = null;
  editScoreData: any = {
    score: 0,
    wave: 0,
    kills: 0
  };
  
  // === ENGAGEMENT FEATURES ===
  
  // Daily Challenge
  isDailyChallenge: boolean = false;
  dailyChallengeCompleted: boolean = false;
  dailyChallengeSeed: number = 0;
  dailyChallengeModifier: string = '';
  
  // Daily Login Reward
  dailyStreak: number = 0;
  dailyRewardClaimed: boolean = false;
  lastLoginDate: string = '';
  
  // Share Score
  shareCopied: boolean = false;
  
  // Player Level / XP System
  playerXp: number = 0;
  playerLevel: number = 1;
  lastXpEarned: number = 0;
  
  get xpForNextLevel(): number {
    return this.playerLevel * 100 + 50;
  }
  
  get unlockedCount(): number {
    return this.achievements.filter(a => a.unlocked).length;
  }
  
  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    const key = event.key.toLowerCase();

    // Waiting for a new key for a control binding
    if (this.rebindingAction) {
      event.preventDefault();
      if (key !== 'escape' && !RESERVED_KEYS.includes(key)) {
        this.assignBinding(this.rebindingAction, key);
      }
      this.rebindingAction = null;
      return;
    }

    if (this.showUpgradePicker) {
      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        this.pickUpgrade(Number(key) - 1);
      }
      return;
    }

    if (this.showTutorial && (key === 'escape' || key === 'enter')) {
      event.preventDefault();
      this.closeTutorial();
      return;
    }

    if (key === 'm' && !typing) {
      this.sound.toggleMute();
      return;
    }

    // ESC to pause/unpause
    if (event.key === 'Escape' && this.gameStarted && !this.gameOver) {
      event.preventDefault();
      this.togglePause();
      return;
    }

    // Don't process other keys when paused
    if (this.isPaused) return;

    this.keys[key] = true;
    if (!this.gameStarted || this.gameOver) return;

    if (key === this.bindings.shoot) {
      event.preventDefault();
      // In Time Flow, firing happens on simulation ticks so it slows down with time
      if (!this.hasMutator('timeflow')) this.shootBullet();
    }
    if (key === this.bindings.parry) {
      event.preventDefault();
      this.parry();
    }
    if (key === this.bindings.ultimate) {
      event.preventDefault();
      this.activateUltimate();
    }
    if (key === this.bindings.dash) {
      event.preventDefault();
      this.dash();
    }
    if (key === this.bindings.slowmo) {
      event.preventDefault();
      this.activateSlowMotion();
    }
  }

  get activeMutator(): MutatorId {
    if (this.currentGameMode === 'boss_rush') return 'none';
    return this.isDailyChallenge ? this.getDailyMutator() : this.currentMutator;
  }

  get activeMutatorDef(): MutatorDef | undefined {
    return mutatorDef(this.activeMutator);
  }

  hasMutator(id: ActiveMutatorId): boolean {
    return this.activeMutator === id;
  }

  get mutatorScoreMultiplier(): number {
    return this.activeMutatorDef?.scoreMultiplier ?? 1;
  }

  getDailyMutator(): ActiveMutatorId {
    return MUTATOR_IDS[this.getDailySeed() % MUTATOR_IDS.length];
  }

  mutatorLabel(id: MutatorId): string {
    const m = mutatorDef(id);
    return m ? `${m.icon} ${this.t(m.name.hu, m.name.en)}` : this.t('Nincs', 'None');
  }

  selectMutator(id: MutatorId) {
    this.currentMutator = id;
    localStorage.setItem('selectedMutator', id);
  }

  private loadMutator() {
    const saved = localStorage.getItem('selectedMutator');
    if (saved === 'none' || MUTATOR_IDS.includes(saved as ActiveMutatorId)) {
      this.currentMutator = saved as MutatorId;
    }
  }

  get parryRadius(): number {
    return 70 + 20 * this.runStacks.parry;
  }

  parry() {
    if (!this.gameStarted || this.gameOver || this.isPaused) return;
    if (this.parryCooldown > 0 || this.parryTimer > 0) return;
    this.parryTimer = 12;
    this.parryCooldown = Math.max(25, 70 - 12 * this.runStacks.parry);
  }

  private updateParry() {
    if (this.parryTimer <= 0) return;
    this.parryTimer--;
    const cx = this.player.x + this.player.width / 2;
    const cy = this.player.y + this.player.height / 2;
    const radius = this.parryRadius;
    let reflected = 0;

    for (const b of this.bullets) {
      if (b.fromPlayer) continue;
      if (Math.hypot(b.x - cx, b.y - cy) > radius + b.radius) continue;

      // Send it back at the nearest enemy (or straight back if none)
      let target: Enemy | undefined;
      let best = Infinity;
      for (const e of this.enemies) {
        const d = Math.hypot(e.x + e.width / 2 - b.x, e.y + e.height / 2 - b.y);
        if (d < best) { best = d; target = e; }
      }
      const speed = Math.max(10, Math.hypot(b.vx, b.vy)) * 1.3;
      if (target) {
        const a = Math.atan2(target.y + target.height / 2 - b.y, target.x + target.width / 2 - b.x);
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
      } else {
        b.vx = -b.vx * 1.3;
        b.vy = -b.vy * 1.3;
      }
      b.fromPlayer = true;
      b.reflected = true;
      b.damage = Math.max(60, b.damage * 3);
      (b as any).pierceRemaining = 1;
      reflected++;
    }

    if (reflected > 0) {
      this.parryCooldown = Math.min(this.parryCooldown, 15);
      this.ultimateCharge = Math.min(this.ultimateMaxCharge, this.ultimateCharge + 4 * reflected);
      this.score += Math.floor(15 * reflected * this.mutatorScoreMultiplier);
      this.createShockwave(cx, cy, '#ffffff', radius + 30);
      this.createParticles(cx, cy, '#ffffff', 10);
      this.createDamageNumber(cx, cy - 40, reflected, '#ffffff');
      this.screenShake = Math.max(this.screenShake, 6);
      this.sound.play('parry');
      this.parryTimer = Math.max(this.parryTimer, 4);
    }
  }

  // --- Run upgrade draft ---
  private updateRunUpgradeList() {
    this.runUpgradeList = RUN_UPGRADES
      .filter(u => this.runStacks[u.id] > 0)
      .map(def => ({ def, n: this.runStacks[def.id] }));
  }

  openUpgradePicker() {
    const pool = RUN_UPGRADES.filter(u =>
      this.runStacks[u.id] < u.maxStacks && !(u.id === 'maxhp' && this.hasMutator('glass')));
    if (pool.length === 0) return;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.upgradeChoices = pool.slice(0, 3);
    this.showUpgradePicker = true;
    this.isPaused = true;
    this.keys = {};
  }

  pickUpgrade(index: number) {
    const choice = this.upgradeChoices[index];
    if (!choice || !this.showUpgradePicker) return;
    this.runStacks[choice.id]++;
    if (choice.id === 'maxhp') {
      this.player.maxHealth += 25;
      this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
    }
    this.updateRunUpgradeList();
    this.showUpgradePicker = false;
    this.isPaused = false;
    this.sound.play('powerup');
  }

  private onRunKill() {
    const vampire = this.runStacks.vampire;
    if (vampire > 0 && this.kills % 4 === 0 && this.player.health < this.player.maxHealth) {
      this.player.health = Math.min(this.player.maxHealth, this.player.health + vampire);
      this.createDamageNumber(this.player.x, this.player.y - 20, vampire, '#00ff88');
    }
  }

  isDown(action: ControlAction): boolean {
    const alt = ARROW_ALTERNATIVES[action];
    return !!this.keys[this.bindings[action]] || (!!alt && !!this.keys[alt]);
  }

  keyLabel(action: ControlAction): string {
    return keyLabel(this.bindings[action]);
  }

  actionLabel(action: ControlAction): string {
    return ACTION_LABELS[action][this.language];
  }

  t(hu: string, en: string): string {
    return this.language === 'hu' ? hu : en;
  }

  startRebind(action: ControlAction) {
    this.rebindingAction = this.rebindingAction === action ? null : action;
  }

  private assignBinding(action: ControlAction, key: string) {
    // If another action already uses this key, give it the old key (swap)
    const other = CONTROL_ACTIONS.find(a => a !== action && this.bindings[a] === key);
    if (other) {
      this.bindings[other] = this.bindings[action];
    }
    this.bindings[action] = key;
    saveBindings(this.bindings);
  }

  resetBindings() {
    this.bindings = { ...DEFAULT_BINDINGS };
    this.rebindingAction = null;
    saveBindings(this.bindings);
  }

  openTutorial() {
    this.showTutorial = true;
    if (!this.isPaused && this.gameStarted && !this.gameOver) {
      this.isPaused = true;
      this.tutorialPausedGame = true;
    }
  }

  closeTutorial() {
    this.showTutorial = false;
    localStorage.setItem('tutorialSeen', '1');
    if (this.tutorialPausedGame) {
      this.tutorialPausedGame = false;
      this.isPaused = false;
    }
  }

  // --- Touch joysticks ---
  joystickStart(which: 'move' | 'aim', event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.joystickMove(which, event);
  }

  joystickMove(which: 'move' | 'aim', event: PointerEvent) {
    if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - (rect.left + radius)) / radius;
    let dy = (event.clientY - (rect.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    const knob = { x: dx * radius * 0.6, y: dy * radius * 0.6 };
    if (which === 'move') {
      this.touchMove = { x: dx, y: dy };
      this.moveKnob = knob;
    } else {
      this.touchAim = { x: dx, y: dy, active: len > 0.15 };
      this.aimKnob = knob;
    }
  }

  joystickEnd(which: 'move' | 'aim') {
    if (which === 'move') {
      this.touchMove = { x: 0, y: 0 };
      this.moveKnob = { x: 0, y: 0 };
    } else {
      this.touchAim = { x: 0, y: 0, active: false };
      this.aimKnob = { x: 0, y: 0 };
    }
  }

  toggleTouchControls() {
    this.showTouchControls = !this.showTouchControls;
    this.joystickEnd('move');
    this.joystickEnd('aim');
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
  
  async ngOnInit() {
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
    this.loadDifficulty();
    this.loadGraphicsQuality();
    this.loadMutator();
    this.initPermanentUpgrades();
    await this.loadCoins(); // Load coins and upgrades from backend
    this.applyPermanentUpgrades();
    this.loadDailyChallengeState();
    this.loadDailyReward();
    this.loadPlayerLevel();
    this.render();
  }
  
  loadDifficulty() {
    const saved = localStorage.getItem('selectedDifficulty');
    if (saved && ['easy', 'normal', 'hard', 'nightmare'].includes(saved)) {
      this.currentDifficulty = saved as Difficulty;
    }
    
    const savedMode = localStorage.getItem('selectedGameMode');
    if (savedMode && ['classic', 'survival', 'boss_rush', 'time_attack'].includes(savedMode)) {
      this.currentGameMode = savedMode as GameMode;
    }
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
    this.isPaused = false;
    this.sound.unlock();
    this.sound.startMusic();
    this.resetGame();
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.lastFrameTime = 0;
    this.accumulator = 0;
    this.gameLoop();
    if (!localStorage.getItem('tutorialSeen')) {
      this.openTutorial();
    }
  }

  togglePause() {
    if (!this.gameStarted || this.gameOver) return;
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.sound.stopMusic();
    } else {
      this.sound.startMusic();
    }
  }

  setGraphicsQuality(q: GraphicsQuality) {
    this.graphicsQuality = q;
    this.autoLowFx = false;
    this.slowFrames = 0;
    localStorage.setItem('graphicsQuality', q);
  }

  private loadGraphicsQuality() {
    const q = localStorage.getItem('graphicsQuality');
    if (q === 'auto' || q === 'high' || q === 'low') this.graphicsQuality = q;
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
    this.shockwaves = [];
    this.runStacks = emptyRunStacks();
    this.updateRunUpgradeList();
    this.showUpgradePicker = false;
    this.lastPickerWave = 1;
    this.parryTimer = 0;
    this.parryCooldown = 0;
    this.timeScale = 1;
    this.timeAccum = 0;
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
    this.gameStartTime = Date.now();
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
    
    // Apply permanent upgrades
    this.applyPermanentUpgrades();
    
    // Set health to max health after upgrades applied
    this.player.health = this.player.maxHealth;
    
    // Apply starting weapon level
    const startingWeaponUpgrade = this.permanentUpgrades.find(u => u.id === 'start_weapon');
    if (startingWeaponUpgrade && startingWeaponUpgrade.level > 0) {
      this.weaponLevel = startingWeaponUpgrade.level;
    }
    
    // Reset skills on new game
    this.resetSkills();
    
    // Apply skill bonuses
    this.applySkillEffects();

    // Glass Cannon must come last: skills/upgrades would otherwise raise max HP again
    if (this.hasMutator('glass')) {
      this.player.maxHealth = 1;
      this.player.health = 1;
    }
  }
  
  restart() {
    // Reset to menu instead of restarting immediately
    this.sound.stopMusic();
    this.gameStarted = false;
    this.gameOver = false;
    this.adWatched = false;
    this.adTimer = 5;
    this.playerNameSubmitted = false;
    this.isDailyChallenge = false;
    this.shareCopied = false;
    const adElement = document.getElementById('ad-interstitial');
    if (adElement) adElement.style.display = 'none';
  }
  
  // === DAILY CHALLENGE SYSTEM ===
  
  getDailySeed(): number {
    const today = new Date();
    return today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  }
  
  getDailyChallengeDescription(): string {
    const seed = this.getDailySeed();
    const challenges = this.language === 'hu' ? [
      '🔫 Csak pisztollyal! Érd el a 10. hullámot!',
      '💨 Dupla sebesség ellenségek! Élj túl 8 hullámot!',
      '🛡️ Nincs pajzs power-up! Érj el 5000 pontot!',
      '💀 Nightmare nehézség! Élj túl 5 hullámot!',
      '🔥 Ölj 100 ellenséget 5 percen belül!',
      '🎯 Csak sorozat fegyverrel! Érd el a 10. hullámot!',
      '⚡ Csak minigunnal! Szerezz 3000 pontot!'
    ] : [
      '🔫 Pistol only! Reach wave 10!',
      '💨 Double speed enemies! Survive 8 waves!',
      '🛡️ No shield power-ups! Reach 5000 points!',
      '💀 Nightmare difficulty! Survive 5 waves!',
      '🔥 Kill 100 enemies in 5 minutes!',
      '🎯 Burst weapon only! Reach wave 10!',
      '⚡ Minigun only! Score 3000 points!'
    ];
    return challenges[seed % challenges.length];
  }
  
  getDailyChallengeConfig(): { weapon?: string, difficulty?: Difficulty, targetWave?: number, targetScore?: number, targetKills?: number } {
    const seed = this.getDailySeed();
    const configs = [
      { weapon: 'pistol', targetWave: 10 },
      { targetWave: 8 },
      { targetScore: 5000 },
      { difficulty: 'nightmare' as Difficulty, targetWave: 5 },
      { targetKills: 100 },
      { weapon: 'burst', targetWave: 10 },
      { weapon: 'minigun', targetScore: 3000 }
    ];
    return configs[seed % configs.length];
  }
  
  startDailyChallenge() {
    const config = this.getDailyChallengeConfig();
    this.isDailyChallenge = true;
    
    if (config.difficulty) {
      this.currentDifficulty = config.difficulty;
    }
    if (config.weapon) {
      const weapon = this.weapons.find(w => w.id === config.weapon);
      if (weapon) this.currentWeapon = weapon;
    }
    this.currentGameMode = 'classic';
    this.startGame();
  }
  
  checkDailyChallengeCompletion() {
    if (!this.isDailyChallenge || this.dailyChallengeCompleted) return;
    
    const config = this.getDailyChallengeConfig();
    let completed = false;
    
    if (config.targetWave && this.wave >= config.targetWave) completed = true;
    if (config.targetScore && this.score >= config.targetScore) completed = true;
    if (config.targetKills && this.kills >= config.targetKills) completed = true;
    
    if (completed) {
      this.dailyChallengeCompleted = true;
      const today = this.getDailySeed().toString();
      localStorage.setItem('dailyChallengeCompleted', today);
      
      // Triple coin reward
      const coinMultiplier = 1 + this.getUpgradeEffect('coinMultiplier');
      const bonusCoins = Math.floor(5 * coinMultiplier);
      this.totalCoins += bonusCoins;
      this.saveCoins();
      
      // XP reward
      this.addXp(50);
      
      // Visual notification
      this.createDamageNumber(this.canvasWidth / 2, this.canvasHeight / 2 - 30, bonusCoins, '#ffd700');
    }
  }
  
  loadDailyChallengeState() {
    const saved = localStorage.getItem('dailyChallengeCompleted');
    const today = this.getDailySeed().toString();
    this.dailyChallengeCompleted = saved === today;
  }
  
  // === DAILY LOGIN REWARD ===
  
  getDailyRewardAmount(): number {
    const streakBonuses = [1, 2, 3, 5, 8, 10, 15];
    const index = Math.min(this.dailyStreak, streakBonuses.length - 1);
    return streakBonuses[Math.max(0, index)];
  }
  
  getDailyRewardXp(): number {
    return 10 + this.dailyStreak * 5;
  }
  
  claimDailyReward() {
    if (this.dailyRewardClaimed) return;
    
    const reward = this.getDailyRewardAmount();
    this.totalCoins += reward;
    this.addXp(this.getDailyRewardXp());
    this.dailyRewardClaimed = true;
    
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('dailyRewardDate', today);
    localStorage.setItem('dailyStreak', this.dailyStreak.toString());
    
    this.saveCoins();
  }
  
  loadDailyReward() {
    const lastDate = localStorage.getItem('dailyRewardDate');
    const savedStreak = localStorage.getItem('dailyStreak');
    const today = new Date().toISOString().split('T')[0];
    
    if (lastDate === today) {
      this.dailyRewardClaimed = true;
      this.dailyStreak = parseInt(savedStreak || '0', 10);
    } else {
      this.dailyRewardClaimed = false;
      
      // Check if yesterday was the last claim (streak continues)
      if (lastDate) {
        const last = new Date(lastDate);
        const now = new Date(today);
        const diffDays = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          this.dailyStreak = parseInt(savedStreak || '0', 10) + 1;
        } else {
          this.dailyStreak = 0; // Reset streak
        }
      } else {
        this.dailyStreak = 0;
      }
    }
  }
  
  // === SHARE SCORE ===
  
  shareScore() {
    const mode = this.currentGameMode === 'boss_rush' ? 'Boss Rush' : 'Classic';
    const diff = this.currentDifficulty.charAt(0).toUpperCase() + this.currentDifficulty.slice(1);
    const challenge = this.isDailyChallenge ? ' [Daily Challenge]' : '';
    const text = `🎮 Bullet Hell Survivor${challenge}\n` +
      `📊 Score: ${this.score} | Wave: ${this.wave} | Kills: ${this.kills}\n` +
      `⚔️ ${mode} - ${diff}\n` +
      `${this.isLoggedIn ? '👤 ' + this.currentUsername : ''}\n` +
      `🏆 Can you beat my score?`;
    
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.shareCopied = true;
        setTimeout(() => this.shareCopied = false, 3000);
      });
    }
  }
  
  // === PLAYER LEVEL / XP SYSTEM ===
  
  addXp(amount: number) {
    this.playerXp += amount;
    this.lastXpEarned = amount;
    
    // Level up check
    while (this.playerXp >= this.xpForNextLevel) {
      this.playerXp -= this.xpForNextLevel;
      this.playerLevel++;
      
      // Bonus coin on level up
      this.totalCoins += this.playerLevel;
      this.saveCoins();
    }
    
    this.savePlayerLevel();
  }
  
  awardGameXp() {
    // XP based on performance
    let xp = 0;
    xp += this.wave * 5; // 5 XP per wave
    xp += Math.floor(this.kills / 10); // 1 XP per 10 kills
    xp += Math.floor(this.score / 500); // 1 XP per 500 score
    
    // Difficulty bonus
    const diffBonuses: Record<string, number> = { easy: 1, normal: 1.5, hard: 2, nightmare: 3 };
    xp = Math.floor(xp * (diffBonuses[this.currentDifficulty] || 1));
    
    // Daily challenge bonus
    if (this.isDailyChallenge) xp = Math.floor(xp * 1.5);
    
    this.addXp(xp);
  }
  
  getPlayerTitle(): string {
    const titles = this.language === 'hu' ? [
      'Újonc', 'Harcos', 'Veterán', 'Bajnok', 'Legenda', 'Mester', 'Nagyúr', 'Istenadta'
    ] : [
      'Rookie', 'Fighter', 'Veteran', 'Champion', 'Legend', 'Master', 'Overlord', 'Godlike'
    ];
    const index = Math.min(Math.floor((this.playerLevel - 1) / 5), titles.length - 1);
    return titles[index];
  }
  
  savePlayerLevel() {
    localStorage.setItem('playerXp', this.playerXp.toString());
    localStorage.setItem('playerLevel', this.playerLevel.toString());
  }
  
  loadPlayerLevel() {
    const xp = localStorage.getItem('playerXp');
    const level = localStorage.getItem('playerLevel');
    if (xp) this.playerXp = parseInt(xp, 10);
    if (level) this.playerLevel = parseInt(level, 10);
  }
  
  gameLoop() {
    if (this.gameOver) return;

    const now = performance.now();
    if (this.lastFrameTime === 0) this.lastFrameTime = now;
    // Clamp so a background tab / long stall doesn't cause a burst of catch-up updates
    const delta = Math.min(now - this.lastFrameTime, 100);
    this.lastFrameTime = now;

    // Fixed 60 Hz simulation: game speed no longer depends on monitor refresh rate
    this.accumulator += delta;
    while (this.accumulator >= this.STEP_MS - 1) {
      if (!this.isPaused) {
        this.update();
      }
      this.accumulator -= this.STEP_MS;
      if (this.gameOver) break;
    }

    this.monitorPerformance(delta);
    this.render();
    this.animationId = requestAnimationFrame(() => this.gameLoop());
  }

  private monitorPerformance(delta: number) {
    if (this.graphicsQuality !== 'auto' || this.autoLowFx || this.isPaused) return;
    // ~45 FPS or worse (delta is clamped to 100ms)
    this.slowFrames = delta > 22 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.autoLowFx = true;
    }
  }
  
  update() {
    // Offer a run upgrade every second wave
    if (this.wave > this.lastPickerWave) {
      this.lastPickerWave = this.wave;
      if (this.wave % 2 === 0) {
        this.openUpgradePicker();
        if (this.showUpgradePicker) return;
      }
    }

    if (this.hasMutator('glass') && this.player.maxHealth !== 1) {
      this.player.maxHealth = 1;
      this.player.health = Math.min(1, this.player.health);
    }

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
    const permanentRegen = this.getUpgradeEffect('healthRegen');
    const totalRegen = regenLevel + permanentRegen;
    
    if (totalRegen > 0) {
      if (!this.hasOwnProperty('regenTimer')) {
        (this as any).regenTimer = 0;
      }
      (this as any).regenTimer++;
      if ((this as any).regenTimer >= 300) {
        (this as any).regenTimer = 0;
        const healing = totalRegen;
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
    
    // Time Flow: the world only advances at full speed while the player moves
    if (this.hasMutator('timeflow')) {
      const moving = this.isDown('up') || this.isDown('down') || this.isDown('left') || this.isDown('right') ||
        this.touchMove.x !== 0 || this.touchMove.y !== 0 || this.dashDuration > 0;
      const target = moving ? 1 : 0.2;
      this.timeScale += (target - this.timeScale) * (moving ? 0.5 : 0.08);
      this.timeAccum += this.timeScale;
      if (this.timeAccum < 1) return;
      this.timeAccum -= 1;
    } else {
      this.timeScale = 1;
    }

    // Kill streak timer
    if (Date.now() - this.lastKillTime > 3000) {
      this.killStreak = 0;
    }
    
    // Player movement
    const currentSpeed = this.playerSpeed * (1 + 0.08 * this.runStacks.speed);
    let moved = false;
    if (this.isDown('up')) {
      this.player.y = Math.max(0, this.player.y - currentSpeed);
      moved = true;
    }
    if (this.isDown('down')) {
      this.player.y = Math.min(this.canvasHeight - this.player.height, this.player.y + currentSpeed);
      moved = true;
    }
    if (this.isDown('left')) {
      this.player.x = Math.max(0, this.player.x - currentSpeed);
      moved = true;
    }
    if (this.isDown('right')) {
      this.player.x = Math.min(this.canvasWidth - this.player.width, this.player.x + currentSpeed);
      moved = true;
    }
    // Analog movement from the touch joystick
    if (this.touchMove.x !== 0 || this.touchMove.y !== 0) {
      this.player.x += this.touchMove.x * currentSpeed;
      this.player.y += this.touchMove.y * currentSpeed;
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
    
    // Touch aim stick: aim and auto-fire in the stick direction
    if (this.touchAim.active) {
      this.mouseX = this.player.x + this.player.width / 2 + this.touchAim.x * 200;
      this.mouseY = this.player.y + this.player.height / 2 + this.touchAim.y * 200;
    }

    // Auto shoot
    if (this.isDown('shoot') || this.touchAim.active) {
      this.shootBullet();
    }
    
    if (this.parryCooldown > 0) this.parryCooldown--;
    this.updateParry();

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
    
    // Update shockwave rings
    this.shockwaves = this.shockwaves.filter(w => {
      w.radius += (w.maxRadius - w.radius) * 0.18 + 1;
      return w.radius < w.maxRadius - 1;
    });

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
      this.sound.stopMusic();
      this.sound.play('gameover');
      this.totalGamesPlayed++;
      this.saveStats();
      this.checkAchievements();
      this.awardGameXp();
      this.checkDailyChallengeCompletion();
    }
    
    // Check daily challenge during gameplay
    if (this.gameStarted && !this.gameOver && this.isDailyChallenge) {
      this.checkDailyChallengeCompletion();
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
      case 'splitter':
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
        if (enemy.shootTimer > 60) { // Reduced from 90
          this.enemyShoot(enemy);
          enemy.shootTimer = 0;
        }
        break;
        
      case 'boss':
      case 'boss_tank':
      case 'boss_speed':
      case 'boss_sniper':
      case 'boss_summoner':
      case 'boss_bomber':
      case 'boss_healer':
      case 'boss_berserker':
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
        } else if (enemy.type === 'boss_summoner') {
          // Summoner boss: Slow movement, spawns minions
          enemy.movePattern += 0.03;
          enemy.x += Math.cos(enemy.movePattern) * 1.2;
          enemy.y = Math.min(160, enemy.y + 0.4);
          
          // Spawn minions
          if (!enemy.summonTimer) enemy.summonTimer = 0;
          enemy.summonTimer++;
          if (enemy.summonTimer > 180) {
            // Spawn 2 basic enemies near boss
            for (let i = 0; i < 2; i++) {
              this.enemies.push({
                x: enemy.x + (i * 80) - 40,
                y: enemy.y + 50,
                width: 40,
                height: 40,
                health: 50,
                maxHealth: 50,
                speed: 1.5,
                type: 'basic',
                shootTimer: 0,
                movePattern: 0
              });
            }
            this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#9400d3', 25);
            enemy.summonTimer = 0;
          }
        } else if (enemy.type === 'boss_bomber') {
          // Bomber boss: Moderate movement, explosive attacks
          enemy.movePattern += 0.04;
          enemy.x += Math.cos(enemy.movePattern) * 2;
          enemy.y = Math.min(170, enemy.y + 0.5);
        } else if (enemy.type === 'boss_healer') {
          // Healer boss: Slow, regenerates health
          enemy.movePattern += 0.025;
          enemy.x += Math.cos(enemy.movePattern) * 1;
          enemy.y = Math.min(165, enemy.y + 0.35);
          
          // Heal self over time
          if (!enemy.healTimer) enemy.healTimer = 0;
          enemy.healTimer++;
          if (enemy.healTimer > 120) {
            const healAmount = enemy.maxHealth * 0.02; // 2% max HP
            enemy.health = Math.min(enemy.maxHealth, enemy.health + healAmount);
            this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#00ff88', 15);
            enemy.healTimer = 0;
          }
        } else if (enemy.type === 'boss_berserker') {
          // Berserker boss: Gets faster as HP drops
          const hpPercent = enemy.health / enemy.maxHealth;
          const speedBoost = 1 + (1 - hpPercent) * 2; // Up to 3x speed at low HP
          enemy.movePattern += 0.03 * speedBoost;
          enemy.x += Math.cos(enemy.movePattern) * 1.5 * speedBoost;
          enemy.y = Math.min(175, enemy.y + 0.4 * speedBoost);
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
        } else if (enemy.type === 'boss_summoner') {
          shootInterval = rageMode ? 25 : 40;
        } else if (enemy.type === 'boss_bomber') {
          shootInterval = rageMode ? 45 : 70;
        } else if (enemy.type === 'boss_healer') {
          shootInterval = rageMode ? 30 : 45;
        } else if (enemy.type === 'boss_berserker') {
          const hpPercent = enemy.health / enemy.maxHealth;
          shootInterval = Math.max(10, Math.floor(40 * hpPercent)); // Faster as HP drops
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
    
    const diffMultipliers = this.getDifficultyMultipliers();
    
    this.bullets.push({
      x: enemy.x,
      y: enemy.y,
      vx: (dx / dist) * 4.5,
      vy: (dy / dist) * 4.5,
      radius: 5,
      damage: Math.floor(20 * diffMultipliers.enemyDamage),
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
    } else if (enemy.type === 'boss_summoner') {
      // Summoner: Homing orbs
      const orbCount = rageMode ? 4 : 2;
      for (let i = 0; i < orbCount; i++) {
        const angle = (Math.PI * 2 * i) / orbCount + enemy.movePattern;
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * 3,
          vy: Math.sin(angle) * 3,
          radius: 7,
          damage: 22,
          fromPlayer: false
        });
      }
    } else if (enemy.type === 'boss_bomber') {
      // Bomber: Large explosive bullets
      const playerDx = this.player.x + this.player.width / 2 - (enemy.x + enemy.width / 2);
      const playerDy = this.player.y + this.player.height / 2 - (enemy.y + enemy.height / 2);
      const angle = Math.atan2(playerDy, playerDx);
      
      // Main bomb
      this.bullets.push({
        x: enemy.x + enemy.width / 2,
        y: enemy.y + enemy.height / 2,
        vx: Math.cos(angle) * 2.5,
        vy: Math.sin(angle) * 2.5,
        radius: 12,
        damage: 40,
        fromPlayer: false
      });
      
      // Shrapnel in rage mode
      if (rageMode) {
        for (let i = 0; i < 6; i++) {
          const shrapAngle = angle + (i - 2.5) * 0.4;
          this.bullets.push({
            x: enemy.x + enemy.width / 2,
            y: enemy.y + enemy.height / 2,
            vx: Math.cos(shrapAngle) * 3.5,
            vy: Math.sin(shrapAngle) * 3.5,
            radius: 5,
            damage: 18,
            fromPlayer: false
          });
        }
      }
    } else if (enemy.type === 'boss_healer') {
      // Healer: Spiral pattern
      const spiralCount = rageMode ? 12 : 8;
      for (let i = 0; i < spiralCount; i++) {
        const angle = (Math.PI * 2 * i) / spiralCount + enemy.movePattern * 2;
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * 2.5,
          vy: Math.sin(angle) * 2.5,
          radius: 6,
          damage: 18,
          fromPlayer: false
        });
      }
    } else if (enemy.type === 'boss_berserker') {
      // Berserker: Chaotic spray that gets denser at low HP
      const hpPercent = enemy.health / enemy.maxHealth;
      const bulletCount = Math.floor(8 + (1 - hpPercent) * 16); // 8-24 bullets
      
      for (let i = 0; i < bulletCount; i++) {
        const angle = (Math.PI * 2 * i) / bulletCount + Math.random() * 0.3;
        const speed = 2.5 + Math.random() * 2;
        this.bullets.push({
          x: enemy.x + enemy.width / 2,
          y: enemy.y + enemy.height / 2,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 7,
          damage: 20 + Math.floor((1 - hpPercent) * 15), // More damage at low HP
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
    const weaponFireRate = Math.max(40,
      (this.currentWeapon.fireRate - this.weaponLevel * 10) * (1 - Math.min(0.5, 0.12 * this.runStacks.firerate)));
    if (now - this.lastShot < weaponFireRate) return;
    
    const dx = this.mouseX - (this.player.x + this.player.width / 2);
    const dy = this.mouseY - (this.player.y + this.player.height / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      const baseAngle = Math.atan2(dy, dx);
      const bulletCount = this.currentWeapon.bulletCount + Math.floor(this.weaponLevel / 3) + this.runStacks.multishot;
      const spread = this.runStacks.multishot > 0 ? Math.max(this.currentWeapon.spreadAngle, 0.1) : this.currentWeapon.spreadAngle;
      
      for (let i = 0; i < bulletCount; i++) {
        const offset = (i - (bulletCount - 1) / 2) * spread;
        const angle = baseAngle + offset;

        this.bullets.push({
          x: this.player.x + this.player.width / 2,
          y: this.player.y + this.player.height / 2,
          vx: Math.cos(angle) * this.currentWeapon.bulletSpeed,
          vy: Math.sin(angle) * this.currentWeapon.bulletSpeed,
          radius: this.currentWeapon.bulletSize + this.weaponLevel * 0.3,
          damage: this.currentWeapon.damage + this.weaponLevel * 5,
          fromPlayer: true,
          ...((this.currentWeapon.pierce || this.runStacks.pierce)
            ? { pierceRemaining: (this.currentWeapon.pierce ?? 0) + this.runStacks.pierce + this.getSkillValue('pierce') }
            : {})
        });
      }
      
      this.lastShot = now;
      this.sound.play('shoot');
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
    
    // Boss Rush mode: Every wave is a boss
    if (this.currentGameMode === 'boss_rush') {
      this.bossWarning = 180;
      this.bossWarningTimer = 0;
      this.sound.play('boss');

      setTimeout(() => {
        this.spawnBoss();
        this.screenFlash = 1.0;
        this.screenFlashColor = '#ff0000';
        this.screenShake = 40;
      }, 3000);
      
      this.bossSpawned = true;
      return;
    }
    
    // Boss every 5 waves
    if (this.wave % 5 === 0 && !this.bossSpawned) {
      // Boss warning system
      this.bossWarning = 180; // 3 seconds warning
      this.bossWarningTimer = 0;
      this.sound.play('boss');
      
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
      
      if (rand < 0.25) type = this.wave >= 4 && rand < 0.1 ? 'splitter' : 'basic';
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
    this.sound.play('wave');
    this.waveDamageTaken = false; // Reset for next wave
    
    // Check Speedrunner achievement
    if (this.wave === 10) {
      const elapsedTime = (Date.now() - this.gameStartTime) / 1000; // seconds
      if (elapsedTime <= 120) { // 2 minutes
        this.unlockAchievement('speedrunner');
      }
      
      // Check difficulty achievements
      if (this.currentDifficulty === 'easy') this.unlockAchievement('easy_master');
      if (this.currentDifficulty === 'normal') this.unlockAchievement('normal_champion');
      if (this.currentDifficulty === 'hard') this.unlockAchievement('hard_warrior');
      if (this.currentDifficulty === 'nightmare') this.unlockAchievement('nightmare_survivor');
    }
    
    // Check Ultimate Champion achievement
    if (this.wave === 20 && this.currentDifficulty === 'nightmare') {
      this.unlockAchievement('ultimate_champion');
    }
    
    // Award skill point every 5 waves
    if (this.wave % 5 === 0) {
      this.skillPoints++;
      this.saveSkills();
      // Show visual notification
      this.createDamageNumber(this.canvasWidth / 2, this.canvasHeight / 2, this.skillPoints, '#ffd700');
    }
    
    // Award coin every 15 waves
    if (this.wave % 15 === 0) {
      const coinMultiplier = 1 + this.getUpgradeEffect('coinMultiplier');
      const waveCoins = Math.floor(1 * coinMultiplier);
      this.totalCoins += waveCoins;
      this.saveCoins();
      // Show visual notification with coin symbol
      this.createDamageNumber(this.canvasWidth / 2, this.canvasHeight / 2 + 40, waveCoins, '#ffd700');
    }
  }
  
  spawnEnemy(type: Exclude<Enemy['type'], 'boss' | 'boss_tank' | 'boss_speed' | 'boss_sniper' | 'boss_summoner' | 'boss_bomber' | 'boss_healer' | 'boss_berserker'>) {
    const configs = {
      basic: { width: 30, height: 30, health: 70, speed: 1.2 },
      splitter: { width: 38, height: 38, health: 120, speed: 1.0 },
      fast: { width: 25, height: 25, health: 45, speed: 2.5 },
      tank: { width: 50, height: 50, health: 250, speed: 0.7 },
      shooter: { width: 35, height: 35, health: 90, speed: 0.9 },
      healer: { width: 28, height: 28, health: 60, speed: 1.0 },
      exploder: { width: 32, height: 32, health: 50, speed: 1.5 },
      dodger: { width: 22, height: 22, health: 38, speed: 2.8 },
      miniboss: { width: 70, height: 70, health: 400, speed: 0.8 }
    };
    
    const config = configs[type];
    
    // Get difficulty multipliers
    const diffMultipliers = this.getDifficultyMultipliers();
    
    // Wave scaling
    const healthScale = 1 + (this.wave - 1) * 0.3; // +30% HP per wave (was 20%)
    const speedScale = 1 + (this.wave - 1) * 0.12; // +12% speed per wave (was 8%)
    
    // Apply difficulty multipliers
    const finalHealthScale = healthScale * diffMultipliers.enemyHP;
    const finalSpeedScale = speedScale * diffMultipliers.enemySpeed;
    
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
      health: Math.floor(config.health * finalHealthScale),
      maxHealth: Math.floor(config.health * finalHealthScale),
      speed: config.speed * finalSpeedScale * (this.hasMutator('frenzy') ? 1.4 : 1),
      type,
      shootTimer: 0,
      movePattern: 0
    });
  }
  
  spawnBoss() {
    const bossIteration = Math.floor(this.wave / 5);
    const healthScale = 1 + bossIteration * 1.2; // +120% HP per boss iteration (was 80%)
    const baseHealth = 1500; // Increased from 1000
    
    // Random boss type with more variety
    const bossTypes = ['normal', 'tank', 'speed', 'sniper', 'summoner', 'bomber', 'healer', 'berserker'] as const;
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
    } else if (bossType === 'summoner') {
      // Summoner Boss: Spawns minions, medium HP, slow
      boss = {
        x: this.canvasWidth / 2 - 85,
        y: -170,
        width: 170,
        height: 170,
        health: Math.floor(baseHealth * healthScale * 1.3 + this.wave * 110),
        maxHealth: Math.floor(baseHealth * healthScale * 1.3 + this.wave * 110),
        speed: 0.4,
        type: 'boss_summoner',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'summoner',
        summonTimer: 0
      };
    } else if (bossType === 'bomber') {
      // Bomber Boss: Explosive attacks, medium-high HP
      boss = {
        x: this.canvasWidth / 2 - 90,
        y: -180,
        width: 180,
        height: 180,
        health: Math.floor(baseHealth * healthScale * 1.5 + this.wave * 120),
        maxHealth: Math.floor(baseHealth * healthScale * 1.5 + this.wave * 120),
        speed: 0.6,
        type: 'boss_bomber',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'bomber'
      };
    } else if (bossType === 'healer') {
      // Healer Boss: Regenerates health, medium HP
      boss = {
        x: this.canvasWidth / 2 - 80,
        y: -160,
        width: 160,
        height: 160,
        health: Math.floor(baseHealth * healthScale * 1.4 + this.wave * 105),
        maxHealth: Math.floor(baseHealth * healthScale * 1.4 + this.wave * 105),
        speed: 0.55,
        type: 'boss_healer',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'healer',
        healTimer: 0
      };
    } else if (bossType === 'berserker') {
      // Berserker Boss: Gets faster and stronger as HP drops
      boss = {
        x: this.canvasWidth / 2 - 95,
        y: -190,
        width: 190,
        height: 190,
        health: Math.floor(baseHealth * healthScale * 1.8 + this.wave * 130),
        maxHealth: Math.floor(baseHealth * healthScale * 1.8 + this.wave * 130),
        speed: 0.5,
        type: 'boss_berserker',
        shootTimer: 0,
        movePattern: 0,
        bossType: 'berserker'
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
          if ((bullet as any).hitEnemies?.includes(enemy)) continue;

          if (this.circleRectCollision(bullet.x, bullet.y, bullet.radius,  
                                       enemy.x, enemy.y, enemy.width, enemy.height)) {
            // Apply damage multiplier from permanent upgrades
            const damageMultiplier = (1 + this.getUpgradeEffect('damage')) * (1 + 0.15 * this.runStacks.dmg);
            const baseDamage = this.ultimateActive ? bullet.damage * 2 : bullet.damage;
            const damage = baseDamage * damageMultiplier;
            
            // Critical hit chance (5% base + skill bonus)
            const baseCritChance = 0.05;
            const critBonus = this.getSkillValue('crit') / 100;
            const isCritical = Math.random() < (baseCritChance + critBonus);
            const finalDamage = isCritical ? damage * 2 : damage;
            
            enemy.health -= finalDamage;
            
            // Pierce - only remove bullet if no pierce remaining
            const pierceCount = this.getSkillValue('pierce');
            if (!bullet.hasOwnProperty('pierceRemaining')) {
              (bullet as any).pierceRemaining = pierceCount;
            }
            
            if ((bullet as any).pierceRemaining <= 0) {
              this.bullets.splice(i, 1);
            } else {
              (bullet as any).pierceRemaining--;
              ((bullet as any).hitEnemies ??= []).push(enemy);
            }
            
            this.createParticles(bullet.x, bullet.y, isCritical ? '#ff00ff' : '#ffff00');
            this.sound.play(isCritical ? 'crit' : 'hit');
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
              const volatileBlast = this.hasMutator('volatile') && enemy.type !== 'exploder';
              if (enemy.type === 'exploder' || volatileBlast) {
                // Explosion damage to nearby enemies and player
                const explosionRadius = volatileBlast ? 70 : 100;
                
                // Damage player if nearby
                const playerDx = this.player.x + this.player.width / 2 - (enemy.x + enemy.width / 2);
                const playerDy = this.player.y + this.player.height / 2 - (enemy.y + enemy.height / 2);
                const playerDist = Math.sqrt(playerDx * playerDx + playerDy * playerDy);
                
                if (playerDist < explosionRadius && this.player.invulnerable === 0 && !this.hasShield) {
                  this.player.health -= volatileBlast ? 15 : 30;
                  this.player.invulnerable = 60;
                  this.waveDamageTaken = true;
                  this.sound.play('hurt');
                  this.screenShake = 25;
                }
                
                // Damage other enemies
                this.enemies.forEach(other => {
                  if (other !== enemy) {
                    const otherDx = other.x + other.width / 2 - (enemy.x + enemy.width / 2);
                    const otherDy = other.y + other.height / 2 - (enemy.y + enemy.height / 2);
                    const otherDist = Math.sqrt(otherDx * otherDx + otherDy * otherDy);
                    
                    if (otherDist < explosionRadius) {
                      other.health -= volatileBlast ? 30 : 50;
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
              if (enemy.type === 'splitter') this.spawnSplitChildren(enemy);
              this.onRunKill();
              this.createShockwave(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2,
                enemy.type.startsWith('boss') ? '#ff4444' : '#ffffff', enemy.type.startsWith('boss') ? 160 : 45);
              this.sound.play(enemy.type === 'exploder' || volatileBlast || enemy.type.startsWith('boss') ? 'explosion' : 'kill');
              
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
              this.ultimateCharge = Math.min(this.ultimateMaxCharge, this.ultimateCharge + Math.round(chargeGain * (1 + 0.25 * this.runStacks.ult)));
              
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
                           enemy.type === 'splitter' ? 60 :
                           enemy.type === 'fast' ? 50 : 25;
              
              const diffMultipliers = this.getDifficultyMultipliers();
              this.score += Math.floor(baseScore * this.combo.multiplier * diffMultipliers.scoreBonus * this.mutatorScoreMultiplier);
              
              this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000', 20);
              
              // Random power-up spawn (10% chance)
              if (Math.random() < (this.hasMutator('frenzy') ? 0.3 : 0.1)) {
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
            // Shield power-up blocks all damage
            if (this.hasShield) {
              this.sound.play('shield');
              this.createDamageNumber(this.player.x, this.player.y, 0, '#8a2be2');
              this.createParticles(bullet.x, bullet.y, '#8a2be2', 15);
              this.screenFlash = 0.2;
              this.screenFlashColor = '#8a2be2';
            } else {
              // Shield chance from permanent upgrade
              const shieldChance = this.getUpgradeEffect('shieldChance');
              const hasShieldProc = Math.random() < shieldChance;
              
              if (hasShieldProc) {
                this.createDamageNumber(this.player.x, this.player.y, 0, '#00ffff');
                this.createParticles(bullet.x, bullet.y, '#00ffff', 15);
                this.screenFlash = 0.2;
                this.screenFlashColor = '#00ffff';
              } else {
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
                  this.sound.play('hurt');
                  this.createParticles(bullet.x, bullet.y, '#ff0000', 15);
                }
              }
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
            const diffMultipliers = this.getDifficultyMultipliers();
            this.player.health -= Math.floor(30 * diffMultipliers.enemyDamage);
            this.player.invulnerable = 60;
            this.waveDamageTaken = true;
            this.sound.play('hurt');
            this.screenShake = 20;
            this.createParticles(this.player.x + this.player.width / 2, 
                               this.player.y + this.player.height / 2, '#ff0000', 20);
          }
        }
      }
    }
    
    this.sweepDeadEnemies();

    // Power-ups vs Player
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const powerUp = this.powerUps[i];
      const dx = this.player.x + this.player.width / 2 - powerUp.x;
      const dy = this.player.y + this.player.height / 2 - powerUp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < powerUp.size + 20) {
        this.collectPowerUp(powerUp.type);
        this.sound.play('powerup');
        this.powerUps.splice(i, 1);
        this.createParticles(powerUp.x, powerUp.y, '#ffd700', 30);
      }
    }
  }
  
  // Enemies killed by area damage (explosions) are removed here and credited like normal kills
  private sweepDeadEnemies() {
    if (!this.enemies.some(e => e.health <= 0)) return;
    const dead = this.enemies.filter(e => e.health <= 0);
    this.enemies = this.enemies.filter(e => e.health > 0);
    for (const enemy of dead) {
      this.kills++;
      this.killStreak++;
      this.lastKillTime = Date.now();
      this.combo.count++;
      this.combo.timer = 180;
      this.combo.multiplier = Math.min(5, 1 + Math.floor(this.combo.count / 5) * 0.5);
      const base = enemy.type.startsWith('boss') ? 1000 : enemy.type === 'miniboss' ? 300 : enemy.type === 'tank' ? 100 : 25;
      this.score += Math.floor(base * this.combo.multiplier * this.getDifficultyMultipliers().scoreBonus * this.mutatorScoreMultiplier);
      if (enemy.type === 'splitter') this.spawnSplitChildren(enemy);
      this.onRunKill();
      this.createParticles(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff8800', 15);
      this.createShockwave(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffffff', 45);
      this.sound.play('kill');
    }
  }

  spawnSplitChildren(parent: Enemy) {
    const childHealth = Math.max(20, Math.floor(parent.maxHealth * 0.3));
    for (const dir of [-1, 1]) {
      this.enemies.push({
        x: parent.x + dir * 14,
        y: parent.y,
        width: 20,
        height: 20,
        health: childHealth,
        maxHealth: childHealth,
        speed: parent.speed * 2.2,
        type: 'fast',
        shootTimer: 0,
        movePattern: 0
      });
    }
    this.createParticles(parent.x + parent.width / 2, parent.y + parent.height / 2, '#00c8a0', 20);
  }

  createShockwave(x: number, y: number, color: string, maxRadius: number) {
    if (this.shockwaves.length < 30) {
      this.shockwaves.push({ x, y, radius: 4, maxRadius, color });
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
    this.sound.play('ultimate');
    this.createShockwave(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#ffd700', 600);
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
    
    let dirX = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    let dirY = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    if (dirX === 0 && dirY === 0 && Math.hypot(this.touchMove.x, this.touchMove.y) > 0.3) {
      dirX = this.touchMove.x;
      dirY = this.touchMove.y;
    }
    
    if (dirX === 0 && dirY === 0) return;
    
    const length = Math.sqrt(dirX * dirX + dirY * dirY);
    this.dashDirection = {
      x: dirX / length,
      y: dirY / length
    };
    
    this.dashDuration = 10;
    this.dashCooldown = Math.round(120 * (1 - Math.min(0.5, 0.2 * this.runStacks.dash))); // 2 seconds
    this.sound.play('dash');
    this.createShockwave(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#00ffff', 60);
    
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
    const maxParticles = this.lowFx ? 250 : 600;
    if (this.lowFx) count = Math.ceil(count / 2);
    count = Math.min(count, maxParticles - this.particles.length);
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
    
    // Time Flow tint (stronger the slower time runs)
    if (this.hasMutator('timeflow') && this.timeScale < 0.95) {
      this.ctx.fillStyle = `rgba(80, 120, 255, ${(1 - this.timeScale) * 0.18})`;
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }

    // Slow motion tint
    if (this.slowMotion > 0) {
      this.ctx.fillStyle = 'rgba(100, 100, 255, 0.1)';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
    
    // Grid background (single batched path)
    this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (let i = 0; i < this.canvasWidth; i += 50) {
      this.ctx.moveTo(i, 0);
      this.ctx.lineTo(i, this.canvasHeight);
    }
    for (let i = 0; i < this.canvasHeight; i += 50) {
      this.ctx.moveTo(0, i);
      this.ctx.lineTo(this.canvasWidth, i);
    }
    this.ctx.stroke();
    
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
    
    // Particles (glow only on high quality and while the count is moderate)
    const particleGlow = !this.lowFx && this.particles.length <= 200;
    this.particles.forEach(p => {
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = p.life / 60;
      if (particleGlow) {
        this.ctx.shadowBlur = 5;
        this.ctx.shadowColor = p.color;
      }
      const size = p.size * (0.35 + 0.65 * Math.min(1, p.life / 40));
      this.ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    });
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;

    // Shockwave rings
    this.shockwaves.forEach(w => {
      this.ctx.strokeStyle = w.color;
      this.ctx.lineWidth = 3 * (1 - w.radius / w.maxRadius) + 1;
      this.ctx.globalAlpha = Math.max(0, 0.8 * (1 - w.radius / w.maxRadius));
      this.ctx.beginPath();
      this.ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      this.ctx.stroke();
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
    
    // Parry ring
    if (this.parryTimer > 0) {
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.globalAlpha = 0.35 + 0.5 * (this.parryTimer / 12);
      this.ctx.beginPath();
      this.ctx.arc(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2,
                   this.parryRadius * (0.7 + 0.3 * (this.parryTimer / 12)), 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
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
    const bulletGlow = !this.lowFx && this.bullets.length <= 120;
    this.bullets.forEach(bullet => {
      const bulletColor = bullet.reflected ? '#ffffff' : bullet.fromPlayer ? this.currentWeapon.color : '#ff0000';
      if (!this.lowFx && bullet.fromPlayer) {
        // Short fading trail behind player bullets
        this.ctx.strokeStyle = bulletColor;
        this.ctx.lineWidth = bullet.radius * 1.2;
        this.ctx.globalAlpha = 0.35;
        this.ctx.beginPath();
        this.ctx.moveTo(bullet.x, bullet.y);
        this.ctx.lineTo(bullet.x - bullet.vx * 1.8, bullet.y - bullet.vy * 1.8);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1;
      }
      this.ctx.fillStyle = bulletColor;
      if (bulletGlow) {
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = bulletColor;
      }
      this.ctx.beginPath();
      this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.shadowBlur = 0;
    
    // Enemies
    this.enemies.forEach(enemy => {
      const colors: Record<string, string> = {
        basic: '#888888',
        splitter: '#00c8a0',
        fast: '#ff00ff',
        tank: '#ffaa00',
        shooter: '#ff0000',
        boss: '#ff0000',
        boss_tank: '#ff8800',
        boss_speed: '#00ffff',
        boss_sniper: '#ff00ff',
        boss_summoner: '#9400d3',
        boss_bomber: '#ff4500',
        boss_healer: '#00ff88',
        boss_berserker: '#8b0000',
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
      if (!this.lowFx) {
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = colors[enemy.type] || '#ff0000';
      }
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
          boss_summoner: '🔮 SUMMONER',
          boss_bomber: '💣 BOMBER',
          boss_healer: '💚 HEALER',
          boss_berserker: '😡 BERSERKER',
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
  
  leaderboardKey(mode: LeaderboardMode, difficulty: Difficulty, type: '24h' | 'alltime', mutator: string = ''): string {
    return `${mode}|${difficulty}|${type}|${mode === 'mutator' ? mutator : ''}`;
  }

  loadLeaderboard(mode: LeaderboardMode = this.leaderboardGameMode,
                  difficulty: Difficulty = this.leaderboardDifficulty,
                  mutator: ActiveMutatorId = this.leaderboardMutator) {
    const apiMode = mode === 'boss_rush' ? 'boss_rush' : 'classic';
    const apiMutator = mode === 'mutator' ? mutator : '';
    for (const type of ['alltime', '24h'] as const) {
      this.http.get<LeaderboardEntry[]>(
        `${this.apiUrl}/leaderboard?type=${type}&gameMode=${apiMode}&difficulty=${difficulty}&mutator=${apiMutator}`
      ).subscribe({
        next: (data) => {
          this.leaderboards[this.leaderboardKey(mode, difficulty, type, mutator)] =
            this.deduplicateLeaderboard(data).slice(0, 10);
        },
        error: (err) => {
          console.error(`Failed to load ${mode}/${difficulty}/${type} leaderboard:`, err);
        }
      });
    }
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

  switchLeaderboardGameMode(mode: LeaderboardMode) {
    this.leaderboardGameMode = mode;
    this.loadLeaderboard();
  }

  switchLeaderboardMutator(mutator: ActiveMutatorId) {
    this.leaderboardMutator = mutator;
    this.loadLeaderboard();
  }

  switchLeaderboardDifficulty(difficulty: Difficulty) {
    this.leaderboardDifficulty = difficulty;
    this.loadLeaderboard();
  }

  getCurrentLeaderboard(): LeaderboardEntry[] {
    return this.leaderboards[
      this.leaderboardKey(this.leaderboardGameMode, this.leaderboardDifficulty, this.leaderboardType, this.leaderboardMutator)
    ] ?? [];
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
      kills: this.kills,
      gameMode: this.currentGameMode,
      difficulty: this.currentDifficulty,
      mutator: this.activeMutator === 'none' ? '' : this.activeMutator
    };
    
    console.log('Submitting score to:', `${this.apiUrl}/leaderboard`);
    
    this.http.post<{ success: boolean, leaderboard: LeaderboardEntry[] }>(
      `${this.apiUrl}/leaderboard`,
      entry
    ).subscribe({
      next: (response) => {
        console.log('Score submitted successfully:', response);
        
        // Show the board the score was just submitted to
        const usedMutator = this.activeMutator;
        this.leaderboardGameMode = this.currentGameMode === 'boss_rush' ? 'boss_rush' : usedMutator !== 'none' ? 'mutator' : 'classic';
        if (usedMutator !== 'none') this.leaderboardMutator = usedMutator;
        this.leaderboardDifficulty = this.currentDifficulty;
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
    if (this.showLeaderboard && this.leaderboardDifficulty !== this.currentDifficulty) {
      this.leaderboardDifficulty = this.currentDifficulty;
      this.loadLeaderboard();
    }
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
      },
      {
        id: 'sharpshooter',
        title: 'Sharpshooter',
        description: 'Get 10 critical hits in one game',
        icon: '🎯',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'dodge_master',
        title: 'Dodge Master',
        description: 'Dodge 50 bullets in one game',
        icon: '🌀',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'tank',
        title: 'Tank',
        description: 'Survive 100 hits in one game',
        icon: '🛡️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'glass_cannon',
        title: 'Glass Cannon',
        description: 'Reach wave 10 with less than 50 health',
        icon: '💔',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'pacifist',
        title: 'Pacifist... NOT!',
        description: 'Kill 20 enemies in one wave',
        icon: '😈',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'collector',
        title: 'Collector',
        description: 'Pick up 50 power-ups',
        icon: '🎁',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'ultimate_master',
        title: 'Ultimate Master',
        description: 'Use ultimate ability 20 times',
        icon: '🌟',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'dash_expert',
        title: 'Dash Expert',
        description: 'Use dash 100 times',
        icon: '💨',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'slow_mo_lover',
        title: 'Slow-Mo Lover',
        description: 'Use slow motion 30 times',
        icon: '⏱️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'millionaire',
        title: 'Millionaire',
        description: 'Score 1,000,000 points',
        icon: '💵',
        unlocked: false,
        condition: (stats) => stats.score >= 1000000
      },
      {
        id: 'headhunter',
        title: 'Headhunter',
        description: 'Kill 100 Tank enemies',
        icon: '🎖️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'speed_killer',
        title: 'Speed Killer',
        description: 'Kill 100 Fast enemies',
        icon: '⚡',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'sniper',
        title: 'Sniper',
        description: 'Kill 50 Shooter enemies',
        icon: '🔭',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'ninja',
        title: 'Ninja',
        description: 'Complete wave 15 without using slow motion',
        icon: '🥷',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'rambo',
        title: 'Rambo',
        description: 'Kill 30 enemies without reloading',
        icon: '🔫',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'perfectionist',
        title: 'Perfectionist',
        description: 'Get 95% accuracy in one game',
        icon: '💯',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'easy_master',
        title: 'Easy Mode Master',
        description: 'Complete wave 10 on Easy difficulty',
        icon: '😊',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'normal_champion',
        title: 'Normal Champion',
        description: 'Complete wave 10 on Normal difficulty',
        icon: '⚔️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'hard_warrior',
        title: 'Hard Warrior',
        description: 'Complete wave 10 on Hard difficulty',
        icon: '💀',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'nightmare_survivor',
        title: 'Nightmare Survivor',
        description: 'Complete wave 10 on Nightmare difficulty',
        icon: '👹',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'ultimate_champion',
        title: 'Ultimate Champion',
        description: 'Complete wave 20 on Nightmare difficulty',
        icon: '🏆',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'sprayer',
        title: 'Spray and Pray',
        description: 'Shoot 1000 bullets in one game',
        icon: '🌊',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'explosion_lover',
        title: 'Explosion Lover',
        description: 'Kill 50 enemies with explosive bullets',
        icon: '💥',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'pierce_master',
        title: 'Pierce Master',
        description: 'Kill 2 enemies with one bullet 25 times',
        icon: '🏹',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'skill_master',
        title: 'Skill Master',
        description: 'Max out any skill',
        icon: '🎓',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'all_rounder',
        title: 'All-Rounder',
        description: 'Unlock all skills',
        icon: '🌈',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'arsenal',
        title: 'Arsenal',
        description: 'Try all 6 weapons in one game',
        icon: '🗡️',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'one_shot',
        title: 'One Shot, One Kill',
        description: 'Kill a Tank enemy with one shot',
        icon: '🎯',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'close_call',
        title: 'Close Call',
        description: 'Survive with exactly 1 health',
        icon: '💀',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'speedrunner',
        title: 'Speedrunner',
        description: 'Reach wave 10 in under 2 minutes',
        icon: '⏰',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'marathon',
        title: 'Marathon',
        description: 'Play for 30 minutes in one game',
        icon: '🏃',
        unlocked: false,
        condition: (stats) => false // Checked in game
      },
      {
        id: 'come_back',
        title: 'Comeback King',
        description: 'Win with less than 10% health remaining',
        icon: '👑',
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
  
  resetSkills() {
    // Reset all skill levels to 0 at the start of each wave
    this.skills.forEach(skill => {
      skill.currentLevel = 0;
    });
    this.saveSkills();
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
    .then(res => {
      if (!res.ok) throw new Error('Delete failed');
      return res.json();
    })
    .then(() => {
      // Refresh all relevant views
      this.loadLeaderboard();
      if (this.adminTab === 'stats') {
        this.loadAdminStats();
      }
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
  
  resetAllShopProgress() {
    const confirm = window.confirm('⚠️ FIGYELEM! Ez törli az ÖSSZES felhasználó érméit és fejlesztéseit! Biztosan folytatod?');
    if (!confirm) return;
    
    const doubleConfirm = window.confirm('🚨 UTOLSÓ FIGYELMEZTETÉS! Ez a művelet visszavonhatatlan! Tényleg törölni akarod mindenki bolt adatát?');
    if (!doubleConfirm) return;
    
    const token = this.authService.getToken();
    if (!token) return;
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resetAllShopProgress', token })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert(`✅ Sikeres reset! ${data.affectedUsers} felhasználó bolt adatai törölve.`);
      } else {
        alert('❌ Hiba történt: ' + (data.error || 'Ismeretlen hiba'));
      }
    })
    .catch(err => {
      console.error('Failed to reset shop progress:', err);
      alert('❌ Hiba a shop reset során!');
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
  
  openChangePasswordModal(user: any) {
    this.changingPasswordUser = user;
    this.newPasswordInput = '';
    this.showPasswordChangeModal = true;
  }
  
  closeChangePasswordModal() {
    this.showPasswordChangeModal = false;
    this.changingPasswordUser = null;
    this.newPasswordInput = '';
  }
  
  changeUserPassword() {
    const token = this.authService.getToken();
    if (!token || !this.changingPasswordUser) return;
    
    if (!this.newPasswordInput || this.newPasswordInput.length < 4) {
      alert('❌ A jelszónak legalább 4 karakter hosszúnak kell lennie!');
      return;
    }
    
    if (!confirm(`Biztosan megváltoztatod ${this.changingPasswordUser.username} jelszavát? Ez minden eszközön kijelentkezteti a felhasználót!`)) {
      return;
    }
    
    fetch('/.netlify/functions/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'changePassword',
        token,
        userId: this.changingPasswordUser.id,
        newPassword: this.newPasswordInput
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        alert('✅ Jelszó sikeresen megváltoztatva! A felhasználó minden eszközön kijelentkezett.');
        this.closeChangePasswordModal();
        this.loadAdminUsers();
      } else {
        alert('❌ Hiba: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(err => {
      console.error('Failed to change password:', err);
      alert('❌ Hiba a jelszó változtatásakor!');
    });
  }
  
  ngOnDestroy() {
    this.sound.stopMusic();
    this.subscriptions.unsubscribe();
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.adInterval) {
      clearInterval(this.adInterval);
    }
  }
}
