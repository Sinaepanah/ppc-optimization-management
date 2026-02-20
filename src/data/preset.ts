import type { TopicProfile, Topic } from '../types'

function topic(id: string, name: string, include: string[], exclude: string[] = []): Topic {
  return { id, name, includePhrases: include, excludePhrases: exclude }
}

function makePreset(
  profileId: string,
  profileName: string,
  allowed: Topic[],
  excluded: Topic[]
): TopicProfile {
  return {
    id: profileId,
    name: profileName,
    allowedTopics: allowed,
    excludedTopics: excluded,
    minimumAllowedMatches: 1,
  }
}

/** Drinking water test strips: home tap/well, exclude pool/aquarium/hydroponics */
export function getDrinkingWaterPreset(): TopicProfile {
  const allowed: Topic[] = [
    topic('dw-1', 'Drinking water', [
      'drinking water',
      'tap water',
      'well water',
      'potable water',
      'drinking',
      'tap',
      'well',
      'potable',
    ], []),
    topic('dw-2', 'Home contaminants', [
      'lead',
      'chlorine',
      'nitrate',
      'nitrite',
      'fluoride',
      'manganese',
      'iron',
      'copper',
      'hardness',
      'ph',
      'tds',
    ], []),
    topic('dw-3', 'Home testing intent', [
      'water test kit',
      'water test strips',
      'test strips for water',
      'water testing',
      'water tester',
      'test kit',
      'test strips',
      'water quality',
    ], []),
  ]
  const excluded: Topic[] = [
    topic('dw-ex-1', 'Aquarium', [
      'aquarium',
      'fish tank',
      'reef tank',
      'reef',
      'marine',
      'koi pond',
      'freshwater tank',
      'saltwater tank',
      'saltwater',
      'fish',
    ], []),
    topic('dw-ex-2', 'Pool & spa', [
      'pool',
      'swimming pool',
      'hot tub',
      'spa',
      'jacuzzi',
    ], []),
    topic('dw-ex-3', 'Hydroponics', [
      'hydroponic',
      'nutrient solution',
      'grow tent',
    ], []),
  ]
  return makePreset('preset-drinking-water', 'Drinking Water Test Strips', allowed, excluded)
}

/** Pool & spa test strips: pool/hot tub, exclude drinking/aquarium/hydroponics */
export function getPoolPreset(): TopicProfile {
  const allowed: Topic[] = [
    topic('pool-1', 'Pool & spa water', [
      'pool',
      'swimming pool',
      'hot tub',
      'spa',
      'jacuzzi',
      'above ground pool',
      'in ground pool',
    ], []),
    topic('pool-2', 'Pool chemistry', [
      'chlorine',
      'bromine',
      'ph',
      'alkalinity',
      'cyanuric acid',
      'hardness',
      'total chlorine',
      'free chlorine',
    ], []),
    topic('pool-3', 'Pool testing intent', [
      'pool test strips',
      'pool test kit',
      'water test strips',
      'spa test strips',
      'hot tub test',
      'test kit',
      'water test kit',
      'water tester',
      'test strips',
      'pool tester',
    ], []),
  ]
  const excluded: Topic[] = [
    topic('pool-ex-1', 'Drinking water', [
      'drinking water',
      'tap water',
      'well water',
      'potable water',
    ], []),
    topic('pool-ex-2', 'Aquarium', [
      'aquarium',
      'fish tank',
      'reef tank',
      'reef',
      'marine',
      'koi pond',
      'saltwater',
      'fish',
    ], []),
    topic('pool-ex-3', 'Hydroponics', [
      'hydroponic',
      'nutrient solution',
      'grow tent',
    ], []),
  ]
  return makePreset('preset-pool', 'Pool & Spa Test Strips', allowed, excluded)
}

/** Aquarium test strips: fish tank/reef/marine/pond, exclude drinking/pool/hydroponics */
export function getAquariumPreset(): TopicProfile {
  const allowed: Topic[] = [
    topic('aq-1', 'Aquarium & water type', [
      'aquarium',
      'fish tank',
      'reef tank',
      'reef',
      'marine',
      'saltwater',
      'freshwater',
      'fresh water',
      'koi pond',
      'pond',
      'fish',
    ], []),
    topic('aq-2', 'Aquarium chemistry', [
      'ammonia',
      'nitrite',
      'nitrate',
      'ph',
      'kh',
      'gh',
      'chlorine',
      'alkalinity',
      'calcium',
      'magnesium',
    ], []),
    topic('aq-3', 'Aquarium testing intent', [
      'aquarium test strips',
      'aquarium test',
      'fish tank test',
      'water test strips',
      'water test kit',
      'water testing kit',
      'water tester',
      'pond test kit',
      'test kit',
      'test strips',
      'tester',
      'reef test',
      'marine test',
      'saltwater test',
      'fish water test',
    ], []),
  ]
  const excluded: Topic[] = [
    topic('aq-ex-1', 'Drinking water', [
      'drinking water',
      'tap water',
      'well water',
      'potable water',
    ], []),
    topic('aq-ex-2', 'Pool & spa', [
      'pool',
      'swimming pool',
      'hot tub',
      'spa',
      'jacuzzi',
    ], []),
    topic('aq-ex-3', 'Hydroponics', [
      'hydroponic',
      'nutrient solution',
      'grow tent',
    ], []),
  ]
  return makePreset('preset-aquarium', 'Aquarium & Pond Test Strips', allowed, excluded)
}

/** Urinalysis: urine/dipstick testing, UTI/kidney/diabetes screening, exclude water/pool/aquarium */
export function getUrinalysisPreset(): TopicProfile {
  const allowed: Topic[] = [
    topic('urine-1', 'Urine & urinalysis', [
      'urine',
      'urinalysis',
      'urine test',
      'urine testing',
      'urinary',
      'pee',
      'dipstick',
      'urine strip',
    ], []),
    topic('urine-2', 'Health conditions tested', [
      'uti',
      'urinary tract',
      'kidney',
      'bladder',
      'diabetes',
      'protein in urine',
      'ketones',
      'bilirubin',
      'glucose',
      'leukocytes',
      'nitrite',
      'specific gravity',
      'ph urine',
      'blood in urine',
    ], []),
    topic('urine-3', 'Urine testing intent', [
      'urine test strips',
      'urine test kit',
      'home urine test',
      'dipstick test',
      'urine dipstick',
      'test strips urine',
      'urine strips',
      'at home urine test',
      'urine tester',
      'test kit urine',
    ], []),
  ]
  const excluded: Topic[] = [
    topic('urine-ex-1', 'Drinking water', [
      'drinking water',
      'tap water',
      'well water',
      'potable water',
      'water quality',
    ], []),
    topic('urine-ex-2', 'Pool & spa', [
      'pool',
      'swimming pool',
      'hot tub',
      'spa',
      'jacuzzi',
    ], []),
    topic('urine-ex-3', 'Aquarium', [
      'aquarium',
      'fish tank',
      'reef tank',
      'koi pond',
      'pond water',
      'fish',
    ], []),
  ]
  return makePreset('preset-urinalysis', 'Urinalysis', allowed, excluded)
}

export type PresetId = 'drinking-water' | 'pool' | 'aquarium' | 'urinalysis'

export interface PresetOption {
  id: PresetId
  label: string
  getProfile: () => TopicProfile
}

export const PRESET_OPTIONS: PresetOption[] = [
  { id: 'drinking-water', label: 'Drinking Water Test Strips', getProfile: getDrinkingWaterPreset },
  { id: 'pool', label: 'Pool & Spa Test Strips', getProfile: getPoolPreset },
  { id: 'aquarium', label: 'Aquarium & Pond Test Strips', getProfile: getAquariumPreset },
  { id: 'urinalysis', label: 'Urinalysis', getProfile: getUrinalysisPreset },
]
