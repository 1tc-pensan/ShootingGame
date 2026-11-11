export type MutatorId = 'none' | 'timeflow' | 'volatile' | 'glass' | 'frenzy';
export type ActiveMutatorId = Exclude<MutatorId, 'none'>;

interface Text {
  hu: string;
  en: string;
}

export interface MutatorDef {
  id: ActiveMutatorId;
  icon: string;
  name: Text;
  desc: Text;
  scoreMultiplier: number;
}

export const MUTATORS: MutatorDef[] = [
  {
    id: 'timeflow',
    icon: '⏳',
    name: { hu: 'Időfolyam', en: 'Time Flow' },
    desc: { hu: 'Az idő csak akkor halad, ha mozogsz. Állva szinte megáll.', en: 'Time only moves when you move. Standing still nearly freezes it.' },
    scoreMultiplier: 1.25
  },
  {
    id: 'volatile',
    icon: '💥',
    name: { hu: 'Robbanékony', en: 'Volatile' },
    desc: { hu: 'Minden ellenség felrobban, amikor meghal - téged is sebez!', en: 'Every enemy explodes on death - and it hurts you too!' },
    scoreMultiplier: 1.25
  },
  {
    id: 'glass',
    icon: '🔮',
    name: { hu: 'Üvegágyú', en: 'Glass Cannon' },
    desc: { hu: '1 HP-d van, de dupla pontot kapsz.', en: 'You have 1 HP, but score is doubled.' },
    scoreMultiplier: 2
  },
  {
    id: 'frenzy',
    icon: '🔥',
    name: { hu: 'Őrjöngés', en: 'Frenzy' },
    desc: { hu: 'Az ellenségek 40%-kal gyorsabbak, de több power-up esik.', en: 'Enemies are 40% faster, but more power-ups drop.' },
    scoreMultiplier: 1.5
  }
];

export const MUTATOR_IDS: ActiveMutatorId[] = MUTATORS.map(m => m.id);

export function mutatorDef(id: MutatorId): MutatorDef | undefined {
  return MUTATORS.find(m => m.id === id);
}

export type RunUpgradeId =
  | 'dmg' | 'firerate' | 'speed' | 'maxhp' | 'multishot'
  | 'pierce' | 'vampire' | 'parry' | 'dash' | 'ult';

export interface RunUpgradeDef {
  id: RunUpgradeId;
  icon: string;
  name: Text;
  desc: Text;
  maxStacks: number;
}

export const RUN_UPGRADES: RunUpgradeDef[] = [
  { id: 'dmg', icon: '💢', name: { hu: 'Erő', en: 'Power' }, desc: { hu: '+15% sebzés', en: '+15% damage' }, maxStacks: 8 },
  { id: 'firerate', icon: '⚡', name: { hu: 'Tűzgyorsaság', en: 'Fire Rate' }, desc: { hu: '+12% tüzelési sebesség', en: '+12% fire rate' }, maxStacks: 4 },
  { id: 'speed', icon: '👟', name: { hu: 'Könnyű láb', en: 'Light Feet' }, desc: { hu: '+8% mozgási sebesség', en: '+8% move speed' }, maxStacks: 5 },
  { id: 'maxhp', icon: '❤️', name: { hu: 'Életerő', en: 'Vitality' }, desc: { hu: '+25 max HP és gyógyulás', en: '+25 max HP and heal' }, maxStacks: 6 },
  { id: 'multishot', icon: '🔱', name: { hu: 'Többlövés', en: 'Multishot' }, desc: { hu: '+1 lövedék lövésenként', en: '+1 bullet per shot' }, maxStacks: 3 },
  { id: 'pierce', icon: '🗡️', name: { hu: 'Átütés', en: 'Piercing' }, desc: { hu: 'A lövedékek +1 ellenségen mennek át', en: 'Bullets pass through +1 enemy' }, maxStacks: 4 },
  { id: 'vampire', icon: '🧛', name: { hu: 'Vámpír', en: 'Vampire' }, desc: { hu: 'Minden 4. ölés után +1 HP', en: '+1 HP every 4 kills' }, maxStacks: 4 },
  { id: 'parry', icon: '🛡️', name: { hu: 'Védő mester', en: 'Parry Master' }, desc: { hu: 'Nagyobb parry sugár, rövidebb várakozás', en: 'Bigger parry radius, shorter cooldown' }, maxStacks: 4 },
  { id: 'dash', icon: '💨', name: { hu: 'Sprinter', en: 'Sprinter' }, desc: { hu: '-20% dash várakozás', en: '-20% dash cooldown' }, maxStacks: 2 },
  { id: 'ult', icon: '🌟', name: { hu: 'Töltő', en: 'Charger' }, desc: { hu: '+25% ultimate töltés', en: '+25% ultimate charge' }, maxStacks: 4 }
];

export type RunStacks = Record<RunUpgradeId, number>;

export function emptyRunStacks(): RunStacks {
  return { dmg: 0, firerate: 0, speed: 0, maxhp: 0, multishot: 0, pierce: 0, vampire: 0, parry: 0, dash: 0, ult: 0 };
}
