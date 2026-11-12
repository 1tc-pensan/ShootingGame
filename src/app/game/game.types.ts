export type GraphicsQuality = 'auto' | 'high' | 'low';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';
export type LeaderboardMode = 'classic' | 'boss_rush' | 'mutator';
export type GameMode = 'classic' | 'survival' | 'boss_rush' | 'time_attack';

export interface PermanentUpgrade {
  id: string;
  name: string;
  description: string;
  cost: number;
  level: number;
  maxLevel: number;
  effect: string;
  value: number;
}

export interface Player {
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

export interface PlayerCustomization {
  color: string;
  shape: 'square' | 'circle' | 'triangle' | 'diamond';
  backgroundColor: string;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromPlayer: boolean;
  reflected?: boolean;
  overcharged?: boolean;
}

export interface Enemy {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  speed: number;
  type: 'basic' | 'splitter' | 'fast' | 'tank' | 'shooter' | 'boss' | 'boss_tank' | 'boss_speed' | 'boss_sniper' | 'boss_summoner' | 'boss_bomber' | 'boss_healer' | 'boss_berserker' | 'healer' | 'exploder' | 'dodger' | 'miniboss';
  shootTimer: number;
  movePattern: number;
  bossType?: 'normal' | 'tank' | 'speed' | 'sniper' | 'summoner' | 'bomber' | 'healer' | 'berserker';
  dodgeTimer?: number;
  summonTimer?: number;
  healTimer?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface LeaderboardEntry {
  id?: number;
  name: string;
  score: number;
  wave: number;
  kills: number;
  date: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  condition: (stats: GameStats) => boolean;
}

export interface GameStats {
  score: number;
  wave: number;
  kills: number;
  totalGamesPlayed: number;
}

export interface PowerUp {
  x: number;
  y: number;
  type: 'health' | 'speed' | 'firerate' | 'shield';
  size: number;
  lifetime: number;
}

export interface ComboSystem {
  count: number;
  multiplier: number;
  timer: number;
}

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  life: number;
  vy: number;
  color: string;
}

export interface SpawnWarning {
  x: number;
  y: number;
  life: number;
  type: Enemy['type'];
}

export interface WeaponUpgrade {
  level: number;
  bulletCount: number;
  bulletSpread: number;
  bulletSize: number;
}

export interface Weapon {
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
  pierce?: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  maxLevel: number;
  currentLevel: number;
  cost: number;
  effect: SkillEffect;
}

export interface SkillEffect {
  type: 'damage' | 'health' | 'speed' | 'firerate' | 'crit' | 'regen' | 'dodge' | 'pierce' | 'explosion';
  value: number;
  perLevel: number;
}

export interface ColorOption {
  name: string;
  value: string;
  glowColor: string;
}

export interface LifetimeStats {
  games: number;
  totalScore: number;
  bestScore: number;
  bestWave: number;
  bestKills: number;
  totalKills: number;
  playSeconds: number;
  bossKills: number;
  bulletsFired: number;
  bulletsReflected: number;
  weaponGames: Record<string, number>;
  mutatorRuns: Record<string, number>;
  upgradePicks: Record<string, number>;
  synergiesUnlocked: Record<string, number>;
  bestByDifficulty: Record<string, number>;
}

export function emptyLifetimeStats(): LifetimeStats {
  return {
    games: 0, totalScore: 0, bestScore: 0, bestWave: 0, bestKills: 0, totalKills: 0,
    playSeconds: 0, bossKills: 0, bulletsFired: 0, bulletsReflected: 0,
    weaponGames: {}, mutatorRuns: {}, upgradePicks: {}, synergiesUnlocked: {}, bestByDifficulty: {}
  };
}
