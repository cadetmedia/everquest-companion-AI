// itemCategories.ts — an item page's categories as the wiki's Item Page Blueprint lists them (Help:Contents,
// read 2026-10-23; owner: "how come the app doesn't have as much details for my new pet summon mummy than
// the old one does?"), in its groups, a blank line between: the classes, the slots, the weapon skill, the
// kinds (alphabetical, as the blueprint has them), the zones. Read off the statsblock the window gave and
// the log's facts; nothing the window or the log did not show. Pure.

/** The blueprint's class order (recent pages: Shadow Knight before Shaman, 13 of 17 full lists). */
const CLASSES: readonly (readonly [string, string])[] = [
  ['BRD', 'Bard'], ['BST', 'Beastlord'], ['BER', 'Berserker'], ['CLR', 'Cleric'], ['DRU', 'Druid'], ['ENC', 'Enchanter'],
  ['MAG', 'Magician'], ['MNK', 'Monk'], ['NEC', 'Necromancer'], ['PAL', 'Paladin'], ['RNG', 'Ranger'], ['ROG', 'Rogue'],
  ['SHD', 'Shadow Knight'], ['SHM', 'Shaman'], ['WAR', 'Warrior'], ['WIZ', 'Wizard']
]

/** Slot word -> category, as the cached pages file them (`FINGER` -> Fingers, 214 pages; `EAR` -> Ear). */
const SLOTS: Readonly<Record<string, string>> = {
  PRIMARY: 'Primary', SECONDARY: 'Secondary', RANGE: 'Range', AMMO: 'Ammo', ARMS: 'Arms', BACK: 'Back', CHEST: 'Chest',
  EAR: 'Ear', FACE: 'Face', FEET: 'Feet', FINGER: 'Fingers', HANDS: 'Hands', HEAD: 'Head', LEGS: 'Legs', NECK: 'Neck',
  SHOULDERS: 'Shoulders', SHOULDER: 'Shoulders', WAIST: 'Waist', WRIST: 'Wrist'
}

/** Weapon skill -> category (`1H Piercing` is filed under Piercing on the pages, as the blueprint lists it). */
const SKILLS: Readonly<Record<string, string>> = {
  '1h slashing': '1H Slashing', '2h slashing': '2H Slashing', '1h blunt': '1H Blunt', '2h blunt': '2H Blunt',
  '1h piercing': 'Piercing', piercing: 'Piercing', '2h piercing': '2H Piercing', archery: 'Archery',
  'hand to hand': 'Hand to Hand', throwing: 'Throwing'
}

/** The line's value after `Label:` up to the next `<br>`. */
const lineOf = (block: string, label: string): string | undefined => new RegExp(`(?:^|\\n)${label}:\\s*([^<\\n]*)`, 'i').exec(block)?.[1]?.trim()

/** `ALL`, `ALL except BRD WAR`, or codes: the classes the item allows, in the blueprint's order. */
export function classesOf(cls: string): string[] {
  const words = cls.toUpperCase().split(/\s+/).filter(Boolean)
  const all = words[0] === 'ALL'
  const out = words.includes('EXCEPT') ? words.slice(words.indexOf('EXCEPT') + 1) : []
  return CLASSES.filter(([code]) => (all ? !out.includes(code) : words.includes(code))).map(([, name]) => `${name} Equipment`)
}

/** What the item is besides where it is worn: its effects, a container, a quest item, the log's facts. */
function kindsOf(block: string, facts: ItemCategoryFacts): string[] {
  const flags = (block.split('\n').find((l) => l.trim() !== '') ?? '').toLowerCase()
  return [
    ...(/\bCapacity:/i.test(block) ? ['Containers'] : []),
    ...(facts.focusEffect !== undefined && facts.focusEffect !== '' ? ['Focus Items'] : []),
    ...(/^Pet Illusion:/im.test(block) ? ['Pet Illusion Items'] : []),
    ...(facts.crafted ? ['Player Crafted'] : []),
    ...(/\bquest\b/.test(flags) ? ['Quest Items'] : []),
    ...(facts.soldBy ? ['Vendor Sold'] : []),
    ...(/\(Combat\b/.test(block) ? ['Weapon Procs'] : []),
    ...(/Weight Reduction:\s*[1-9]/i.test(block) ? ['Weight Reduction'] : []),
    ...(/\(Worn\b/.test(block) ? ['Worn Effects'] : [])
  ]
}

export interface ItemCategoryFacts {
  focusEffect?: string
  crafted: boolean
  soldBy: boolean
  /** The zones the log saw it drop in. */
  zones: readonly string[]
}

/** The page's category groups, in the blueprint's order; empty groups dropped. */
export function itemCategoryGroups(statsblock: string | undefined, facts: ItemCategoryFacts): string[][] {
  const block = statsblock ?? ''
  const slot = lineOf(block, 'Slot')
  // Classes and slots only for an item that is worn: a quest item's `Class: ALL` files it nowhere.
  const worn = slot !== undefined && slot !== ''
  const cls = lineOf(block, 'Class')
  const skill = lineOf(block, 'Skill')?.replace(/\s+Atk Delay.*$/i, '').toLowerCase()
  const groups = [
    worn && cls !== undefined ? classesOf(cls) : [],
    worn ? [...new Set(slot.toUpperCase().split(/\s+/).flatMap((s) => (SLOTS[s] === undefined ? [] : [SLOTS[s]])))] : [],
    skill !== undefined && SKILLS[skill] !== undefined ? [SKILLS[skill]] : [],
    kindsOf(block, facts),
    [...new Set(facts.zones.filter((z) => z !== ''))].sort((a, b) => a.localeCompare(b))
  ]
  return groups.filter((g) => g.length > 0)
}
