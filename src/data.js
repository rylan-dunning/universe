// Real astronomical data. Distances in kilometers unless noted.
// Sources: NASA fact sheets (rounded). Orbits drawn circular & coplanar for clarity.

export const KM_PER_AU = 1.495978707e8;
export const KM_PER_LY = 9.4607304725808e12;
export const LY_PER_MLY = 1e6;

// --- Solar system (radius_km, orbit_km, color, spinDays, yearDays) ---
export const SUN = {
  name: 'Sun',
  radius: 696340,
  color: 0xffd27a,
  emissive: 0xffae3a,
};

export const PLANETS = [
  { name: 'Mercury', radius: 2440,  orbit: 0.387 * KM_PER_AU, color: 0x9a8478, year: 88 },
  { name: 'Venus',   radius: 6052,  orbit: 0.723 * KM_PER_AU, color: 0xd9b27a, year: 225 },
  { name: 'Earth',   radius: 6371,  orbit: 1.000 * KM_PER_AU, color: 0x4a90d9, year: 365,
    moons: [
      { name: 'Moon', radius: 1737, orbit: 384400, color: 0xbbbbbb, period: 27.3 },
    ] },
  { name: 'Mars',    radius: 3389,  orbit: 1.524 * KM_PER_AU, color: 0xc1440e, year: 687,
    moons: [
      { name: 'Phobos', radius: 11, orbit: 9376,  color: 0x886655, period: 0.32 },
      { name: 'Deimos', radius: 6,  orbit: 23463, color: 0x9a8a78, period: 1.26 },
    ] },
  { name: 'Jupiter', radius: 69911, orbit: 5.203 * KM_PER_AU, color: 0xc9a880, year: 4333,
    moons: [
      { name: 'Io',       radius: 1822, orbit: 421700,  color: 0xe6d96a, period: 1.77 },
      { name: 'Europa',   radius: 1561, orbit: 671100,  color: 0xd0c8b0, period: 3.55 },
      { name: 'Ganymede', radius: 2634, orbit: 1070400, color: 0x9a8a78, period: 7.15 },
      { name: 'Callisto', radius: 2410, orbit: 1882700, color: 0x6e6258, period: 16.69 },
    ] },
  { name: 'Saturn',  radius: 58232, orbit: 9.537 * KM_PER_AU, color: 0xe6cf94, year: 10759, ring: [74500, 140000],
    moons: [
      { name: 'Mimas',     radius: 198,  orbit: 185539,  color: 0xc8c8c8, period: 0.94 },
      { name: 'Enceladus', radius: 252,  orbit: 238042,  color: 0xeaffff, period: 1.37 },
      { name: 'Tethys',    radius: 533,  orbit: 294672,  color: 0xc8c0b0, period: 1.89 },
      { name: 'Dione',     radius: 561,  orbit: 377415,  color: 0xc0b8a8, period: 2.74 },
      { name: 'Rhea',      radius: 764,  orbit: 527068,  color: 0xb8b0a0, period: 4.52 },
      { name: 'Titan',     radius: 2575, orbit: 1221870, color: 0xd9a45c, period: 15.95 },
      { name: 'Iapetus',   radius: 735,  orbit: 3560820, color: 0x806858, period: 79.32 },
    ] },
  { name: 'Uranus',  radius: 25362, orbit: 19.19 * KM_PER_AU, color: 0x9fd5e6, year: 30687,
    moons: [
      { name: 'Miranda', radius: 235,  orbit: 129390,  color: 0xa8a8a8, period: 1.41 },
      { name: 'Ariel',   radius: 579,  orbit: 191020,  color: 0xb8b0a8, period: 2.52 },
      { name: 'Umbriel', radius: 585,  orbit: 266000,  color: 0x807870, period: 4.14 },
      { name: 'Titania', radius: 789,  orbit: 435910,  color: 0xa89888, period: 8.71 },
      { name: 'Oberon',  radius: 761,  orbit: 583520,  color: 0x988878, period: 13.46 },
    ] },
  { name: 'Neptune', radius: 24622, orbit: 30.07 * KM_PER_AU, color: 0x4b6cb7, year: 60190,
    moons: [
      { name: 'Triton', radius: 1353, orbit: 354759, color: 0xc8d0d0, period: -5.88 },
      { name: 'Nereid', radius: 170,  orbit: 5513400, color: 0x988878, period: 360.13 },
    ] },
  { name: 'Pluto',   radius: 1188,  orbit: 39.48 * KM_PER_AU, color: 0xc4a487, year: 90560,
    moons: [
      { name: 'Charon', radius: 606, orbit: 19591, color: 0x988878, period: 6.39 },
    ] },
];

// --- Galaxy (units = light-years) ---
export const GALAXY = {
  diameter_ly: 100000,
  thickness_ly: 1000,
  bulgeRadius_ly: 10000,
  armCount: 4,
  armWindings: 2.2,
  starCount: 60000,        // visible point-stars
  brightStarCount: 220,    // faceted hero stars near solar neighborhood
  sunOffset_ly: 26000,     // distance of the Sun from galactic center
};

// A few labeled real stars (distance in ly from Sun, color, radius_solar)
export const NEARBY_STARS = [
  { name: 'Proxima Centauri', dist: 4.24,  color: 0xff7755, r: 0.15 },
  { name: 'Alpha Centauri',   dist: 4.37,  color: 0xfff2c8, r: 1.2 },
  { name: 'Barnard\'s Star',  dist: 5.96,  color: 0xff8855, r: 0.2 },
  { name: 'Sirius',           dist: 8.6,   color: 0xcfe2ff, r: 1.7 },
  { name: 'Tau Ceti',         dist: 11.91, color: 0xffe5b3, r: 0.79 },
  { name: '40 Eridani',       dist: 16.45, color: 0xffd0a0, r: 0.81 },
  { name: 'Procyon',          dist: 11.46, color: 0xfff0d0, r: 2.0 },
  { name: 'Altair',           dist: 16.7,  color: 0xddeaff, r: 1.8 },
  { name: 'Vega',             dist: 25.0,  color: 0xb8cfff, r: 2.4 },
  { name: 'Arcturus',         dist: 36.7,  color: 0xffb070, r: 25 },
  { name: 'Capella',          dist: 42.9,  color: 0xfff0a8, r: 12 },
  { name: 'Aldebaran',        dist: 65.3,  color: 0xff8844, r: 45 },
  { name: 'Pleiades Cluster', dist: 444,   color: 0xb8d0ff, r: 60 },
  { name: 'Polaris',          dist: 433.0, color: 0xfff2c8, r: 37 },
  { name: 'Orion Nebula',     dist: 1344,  color: 0xff99cc, r: 90 },
  { name: 'Betelgeuse',       dist: 642.0, color: 0xff5533, r: 760 },
  { name: 'Rigel',            dist: 860.0, color: 0x9fbcff, r: 78 },
  { name: 'Antares',          dist: 550.0, color: 0xff6644, r: 680 },
  { name: 'Eagle Nebula',     dist: 7000,  color: 0xff99aa, r: 120 },
];

// --- Universe (units = millions of light-years, Mly) ---
export const UNIVERSE = {
  observableRadius_Mly: 46500, // ~46.5 Gly comoving
  galaxyCount: 8000,           // visible instanced galaxies
  filamentNoiseScale: 0.00012,
};

// A few real galaxy markers (distance in Mly)
export const NAMED_GALAXIES = [
  { name: 'Milky Way',           dist: 0,      color: 0xffe6a8 },
  { name: 'LMC',                 dist: 0.163,  color: 0xfff0c8 },
  { name: 'SMC',                 dist: 0.197,  color: 0xfff0c8 },
  { name: 'Andromeda (M31)',     dist: 2.537,  color: 0xfff0c8 },
  { name: 'Triangulum (M33)',    dist: 2.73,   color: 0xfff0c8 },
  { name: 'Local Group',         dist: 3.5,    color: 0xaaffcc },
  { name: 'M81',                 dist: 11.8,   color: 0xfff0c8 },
  { name: 'Centaurus A',         dist: 13.1,   color: 0xffd0a0 },
  { name: 'Sculptor Group',      dist: 12.7,   color: 0xaaffcc },
  { name: 'Sombrero (M104)',     dist: 29.3,   color: 0xfff0c8 },
  { name: 'Virgo Cluster (M87)', dist: 53.5,   color: 0xfff8e0 },
  { name: 'Fornax Cluster',      dist: 62,     color: 0xfff8e0 },
  { name: 'Norma Cluster',       dist: 220,    color: 0xfff8e0 },
  { name: 'Coma Cluster',        dist: 320,    color: 0xfff8e0 },
  { name: 'Laniakea Supercluster', dist: 250,  color: 0xaaffcc },
  { name: 'Hercules Supercluster', dist: 500,  color: 0xaaffcc },
  { name: 'Shapley Supercluster',  dist: 650,  color: 0xaaffcc },
  { name: 'Hercules-Corona Borealis Wall', dist: 10000, color: 0xaaccff },
  { name: 'GN-z11 (early galaxy)', dist: 13400, color: 0xff99cc },
];

// ---------------------------------------------------------------------------
// Educational fact sheets, keyed by body name. Used by the click-to-visit UI.
// Keep entries short and scannable.
// ---------------------------------------------------------------------------
export const FACTS = {
  // ---- Solar system ----
  'Sun': {
    type: 'G2V Yellow Dwarf Star',
    facts: [
      'Diameter: 1,392,700 km (109× Earth)',
      'Mass: 1.989×10³⁰ kg (333,000× Earth)',
      'Surface temp: ~5,500 °C; Core: ~15 million °C',
      'Age: ~4.6 billion years',
      'Holds 99.86% of the Solar System\u2019s mass',
    ],
  },
  'Mercury': {
    type: 'Terrestrial Planet',
    facts: [
      'Smallest planet; only ~1.4× the Moon',
      'A year is just 88 Earth days',
      'A day (sunrise to sunrise) lasts 176 Earth days',
      'No atmosphere; surface swings 430 °C → \u2212180 °C',
    ],
  },
  'Venus': {
    type: 'Terrestrial Planet',
    facts: [
      'Hottest planet: surface ~465 °C (lead melts at 327 °C)',
      'Atmosphere is 96% CO\u2082; pressure 92× Earth\u2019s',
      'Spins backwards \u2014 the Sun rises in the west',
      'A day is longer than its year',
    ],
  },
  'Earth': {
    type: 'Terrestrial Planet (your home)',
    facts: [
      'Only known world with surface liquid water and life',
      '71% of the surface is ocean',
      'Magnetic field deflects the solar wind',
      'Has one large moon (the Moon)',
    ],
  },
  'Mars': {
    type: 'Terrestrial Planet',
    facts: [
      'Home to Olympus Mons \u2014 the tallest volcano in the Solar System (22 km)',
      'Day is almost the same as Earth\u2019s: 24h 37m',
      'Thin CO\u2082 atmosphere, ~1% of Earth\u2019s pressure',
      'Two tiny moons: Phobos and Deimos',
    ],
  },
  'Jupiter': {
    type: 'Gas Giant',
    facts: [
      'Most massive planet \u2014 318× Earth, 2.5× all other planets combined',
      'The Great Red Spot is a storm wider than Earth that has lasted centuries',
      'Has at least 95 moons; Ganymede is bigger than Mercury',
      'A "day" is just under 10 hours \u2014 fastest rotation in the Solar System',
    ],
  },
  'Saturn': {
    type: 'Gas Giant',
    facts: [
      'Iconic ring system spans ~280,000 km but is only ~10 m thick on average',
      'Density is less than water \u2014 it would float',
      'Over 140 known moons; Titan has lakes of liquid methane',
      'Wind speeds reach 1,800 km/h at the equator',
    ],
  },
  'Uranus': {
    type: 'Ice Giant',
    facts: [
      'Rotates on its side: 98° axial tilt',
      'Coldest planetary atmosphere in the Solar System (\u2212224 °C)',
      'Methane in its atmosphere gives it a pale blue-green color',
      'Has 13 faint, dark rings',
    ],
  },
  'Neptune': {
    type: 'Ice Giant',
    facts: [
      'Most distant planet \u2014 30 AU from the Sun',
      'Strongest winds in the Solar System: up to 2,100 km/h',
      'A year lasts 165 Earth years',
      'Discovered in 1846 by mathematical prediction before observation',
    ],
  },
  'Moon': {
    type: 'Earth\u2019s Natural Satellite',
    facts: [
      'Diameter ~3,474 km \u2014 about 1/4 of Earth',
      '384,400 km from Earth on average (~1.3 light-seconds)',
      'Always shows the same face to Earth (tidally locked)',
      'Drifting away from Earth at ~3.8 cm per year',
    ],
  },  'Pluto': {
    type: 'Dwarf Planet (Kuiper Belt)',
    facts: [
      'Reclassified from planet to dwarf planet in 2006',
      'Diameter ~2,376 km — smaller than Earth’s Moon',
      '~39.5 AU from the Sun on average; orbit is highly elliptical',
      'A year lasts ~248 Earth years',
      'Has 5 moons; Charon is so large the pair orbit a point in space between them',
    ],
  },
  // ---- Galactic neighborhood ----
  'Proxima Centauri': {
    type: 'Red Dwarf Star',
    facts: [
      'Closest known star to the Sun: 4.24 light-years',
      'Hosts at least 3 known exoplanets, one in the habitable zone',
      'Only ~12% the mass of the Sun',
      'Will live for trillions of years',
    ],
  },
  'Alpha Centauri': {
    type: 'Triple Star System',
    facts: [
      'Three stars: A (Sun-like), B (orange dwarf), C (Proxima)',
      '4.37 light-years away',
      'Brightest \u201cstar\u201d Alpha Cen AB to the naked eye in southern skies',
    ],
  },
  'Barnard\'s Star': {
    type: 'Red Dwarf Star',
    facts: [
      'Has the largest proper motion of any known star (10.3″/yr)',
      'Just under 6 light-years away',
      '~14% of the Sun\u2019s mass',
    ],
  },
  'Sirius': {
    type: 'Binary Star System (A: A1V, B: White Dwarf)',
    facts: [
      'Brightest star in Earth\u2019s night sky',
      '8.6 light-years away \u2014 a near neighbor',
      'Sirius B was the first white dwarf ever discovered',
    ],
  },
  'Procyon': { type: 'Binary Star', facts: [
      '11.46 ly away; 8th brightest star',
      'Companion is a white dwarf'] },
  'Tau Ceti': {
    type: 'G-type Main Sequence Star',
    facts: [
      'Sun-like star only 11.9 light-years away',
      'One of the closest single solar analogs to the Sun',
      'At least 4 candidate planets, two near the habitable zone',
      'Long a favorite SETI target since the 1960s',
    ],
  },
  '40 Eridani': {
    type: 'Triple Star System (K-dwarf + White Dwarf + Red Dwarf)',
    facts: [
      '16.5 light-years away in the constellation Eridanus',
      '40 Eridani A is an orange dwarf, slightly smaller than the Sun',
      'Famously the fictional home of Mr. Spock’s planet Vulcan',
      'Hosts at least one confirmed exoplanet',
    ],
  },
  'Altair': { type: 'A-type Main Sequence', facts: [
      'Spins so fast (~286 km/s) it is visibly oblate',
      'Vertex of the Summer Triangle'] },
  'Vega': {
    type: 'A-type Main Sequence Star',
    facts: [
      '25 light-years away; 5th brightest star in the night sky',
      'Was the northern pole star around 12,000 BC and will be again in ~13,700 AD',
      'Has a debris disk \u2014 evidence of planet formation',
    ],
  },
  'Arcturus': { type: 'Red Giant', facts: [
      'Brightest star in the northern celestial hemisphere',
      '36.7 ly away; ~25× the Sun\u2019s diameter'] },
  'Capella': { type: 'Quadruple Star System', facts: [
      'Two yellow giants and two red dwarfs', '42.9 ly away'] },
  'Aldebaran': { type: 'Red Giant', facts: [
      'The "eye" of the constellation Taurus',
      '~45× the Sun\u2019s diameter'] },
  'Pleiades Cluster': { type: 'Open Star Cluster (M45)', facts: [
      'Over 1,000 stars; 7 visible to the naked eye',
      '444 ly away; only ~100 million years old'] },
  'Polaris': {
    type: 'Triple Star System (Cepheid Variable)',
    facts: [
      'Currently the North Star (within ~0.7° of true north)',
      'A yellow supergiant ~37× the Sun\u2019s diameter',
      'Will not always be the pole star \u2014 Earth\u2019s axis precesses every ~26,000 yrs',
    ],
  },
  'Orion Nebula': { type: 'Stellar Nursery (M42)', facts: [
      '1,344 ly away; visible to the naked eye',
      'New stars are forming inside it right now'] },
  'Betelgeuse': {
    type: 'Red Supergiant',
    facts: [
      '~640 light-years away; 700\u2013900× the Sun\u2019s radius',
      'If placed at the Sun, it would engulf Mars',
      'Will go supernova within ~100,000 years (or sooner)',
    ],
  },
  'Rigel': { type: 'Blue Supergiant', facts: [
      '~860 ly away; ~120,000× the Sun\u2019s luminosity',
      'Brightest star in Orion'] },
  'Antares': { type: 'Red Supergiant', facts: [
      '~550 ly away; 700× the Sun\u2019s radius',
      '"Heart of the Scorpion"'] },
  'Eagle Nebula': { type: 'Star-forming Region (M16)', facts: [
      'Home of the famous "Pillars of Creation"',
      '~7,000 ly away'] },
  'Galactic Center (Sgr A*)': {
    type: 'Supermassive Black Hole',
    facts: [
      'Mass: ~4.15 million Suns',
      '~26,000 light-years from Earth',
      'Imaged by the Event Horizon Telescope in 2022',
    ],
  },

  // ---- Universe / large-scale structure ----
  'Milky Way': {
    type: 'Barred Spiral Galaxy (us!)',
    facts: [
      'Diameter: ~100,000 light-years; ~1,000 ly thick',
      'Contains 100\u2013400 billion stars',
      'Mass (incl. dark matter): ~1.5 trillion solar masses',
      'Will collide with Andromeda in ~4.5 billion years',
    ],
  },
  'LMC': { type: 'Large Magellanic Cloud (Dwarf Galaxy)', facts: [
      '163,000 ly away; satellite of the Milky Way',
      'Hosted SN 1987A, the closest supernova in modern times'] },
  'SMC': { type: 'Small Magellanic Cloud (Dwarf Galaxy)', facts: [
      '197,000 ly away; visible to the naked eye in the south'] },
  'Andromeda (M31)': {
    type: 'Spiral Galaxy',
    facts: [
      'Closest large galaxy: 2.537 million light-years',
      'Trillion+ stars \u2014 likely larger than the Milky Way',
      'Approaching us at 110 km/s; will merge in ~4.5 Gyr',
      'Visible to the naked eye on dark nights',
    ],
  },
  'Triangulum (M33)': { type: 'Spiral Galaxy', facts: [
      '3rd largest in the Local Group; 2.73 Mly away',
      'Contains ~40 billion stars'] },
  'Local Group': { type: 'Galaxy Group', facts: [
      '~80 galaxies bound by gravity', 'Diameter ~10 million ly',
      'Dominated by the Milky Way and Andromeda'] },
  'M81': { type: 'Spiral Galaxy', facts: ['11.8 Mly away in Ursa Major',
      'Brightest member of the M81 Group'] },
  'Centaurus A': { type: 'Active Galaxy', facts: [
      '13.1 Mly; 5th brightest galaxy in the sky',
      'Massive jets powered by a supermassive black hole'] },
  'Sculptor Group': { type: 'Galaxy Group', facts: [
      'One of the closest groups beyond the Local Group',
      '~12.7 Mly away'] },
  'Sombrero (M104)': { type: 'Spiral Galaxy', facts: [
      'Striking dust lane gives it a hat-like profile',
      '29.3 Mly away'] },
  'Virgo Cluster (M87)': {
    type: 'Galaxy Cluster',
    facts: [
      '~1,300\u20132,000 galaxies; ~53.5 Mly away',
      'M87\u2019s central black hole was the first ever imaged (2019)',
      'The center of our local supercluster',
    ],
  },
  'Fornax Cluster': { type: 'Galaxy Cluster', facts: [
      'Second-richest cluster within 100 Mly',
      '~62 Mly away'] },
  'Norma Cluster': { type: 'Galaxy Cluster', facts: [
      'Near the Great Attractor', '~220 Mly away'] },
  'Coma Cluster': {
    type: 'Galaxy Cluster',
    facts: [
      '1,000+ identified galaxies; ~320 Mly away',
      'Where Fritz Zwicky inferred dark matter (1933)',
    ],
  },
  'Laniakea Supercluster': {
    type: 'Supercluster (our home)',
    facts: [
      '~520 million ly across; contains 100,000+ galaxies',
      'Includes the Milky Way and the Virgo Cluster',
      'Name means "immeasurable heaven" in Hawaiian',
    ],
  },
  'Hercules Supercluster': { type: 'Supercluster', facts: [
      '~500 Mly away', 'Part of the Hercules\u2013Corona Borealis Wall'] },
  'Shapley Supercluster': { type: 'Supercluster', facts: [
      'Largest concentration of galaxies in the nearby universe',
      '~650 Mly away'] },
  'Hercules-Corona Borealis Wall': { type: 'Galaxy Filament', facts: [
      'Largest known structure in the universe: ~10 billion ly across',
      'Discovered in 2013 from gamma-ray burst clustering'] },
  'GN-z11 (early galaxy)': {
    type: 'Early Galaxy (z = 10.957)',
    facts: [
      'Among the most distant known galaxies',
      'Light left it just 400 million years after the Big Bang',
      '~13.4 billion light-years lookback distance',
    ],
  },
};
export function formatDistanceKm(km) {
  if (km < 1000) return `${km.toFixed(1)} km`;
  if (km < KM_PER_AU * 0.01) return `${(km / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} thousand km`;
  if (km < KM_PER_LY * 0.001) return `${(km / KM_PER_AU).toFixed(3)} AU`;
  if (km < KM_PER_LY * 1000) return `${(km / KM_PER_LY).toFixed(3)} ly`;
  return `${(km / (KM_PER_LY * 1e6)).toFixed(3)} Mly`;
}

export function formatLength(m) {
  if (m < 1) return `${(m * 100).toFixed(1)} cm`;
  if (m < 1000) return `${m.toFixed(1)} m`;
  if (m < KM_PER_AU * 1000) return `${(m / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  return formatDistanceKm(m / 1000);
}

export function formatSpeed(mPerSec) {
  const c = 299792458;
  if (mPerSec < 1) return `${(mPerSec * 100).toFixed(1)} cm/s`;
  if (mPerSec < 1000) return `${mPerSec.toFixed(1)} m/s`;
  if (mPerSec < c * 0.001) return `${(mPerSec / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} km/s`;
  return `${(mPerSec / c).toLocaleString(undefined, { maximumFractionDigits: 2 })} c`;
}

// Speed in km/h and mph (capped to a sane display when superluminal).
export function formatSpeedTerrestrial(mPerSec) {
  const kph = mPerSec * 3.6;
  const mph = mPerSec * 2.2369362921;
  const fmt = (n) => n >= 1e9 ? n.toExponential(2)
                  : n >= 1000 ? Math.round(n).toLocaleString()
                  : n.toFixed(1);
  return `${fmt(kph)} km/h  /  ${fmt(mph)} mph`;
}

// Approx kinetic energy assuming ship mass scales with size.
// mass ≈ 80 kg/m³ × volume (length³) — roughly aerospace-vehicle density.
export function shipKineticEnergyJ(lengthMeters, mPerSec) {
  const mass = 80 * lengthMeters * lengthMeters * lengthMeters; // kg
  return 0.5 * mass * mPerSec * mPerSec;                         // joules
}

const ENERGY_LANDMARKS = [
  [4.184e6,  'a stick of dynamite'],
  [4.2e9,   'a lightning bolt'],
  [4.184e12, 'a kiloton of TNT'],
  [6.3e13,  'the Hiroshima bomb'],
  [4.184e15, 'a megaton nuke'],
  [2.1e17,  'the Tsar Bomba'],
  [1e21,    'humanity\u2019s annual energy use'],
  [1e23,    'a magnitude-9 earthquake'],
  [4.2e29,  'the dinosaur-killing Chicxulub impact'],
  [3.8e26,  'one second of the Sun\u2019s output'],
  [1e34,    'a year of the Sun\u2019s output'],
  [1e44,    'a supernova'],
  [1e47,    'a gamma-ray burst'],
  [1e54,    'all the energy in the observable universe'],
];

export function formatEnergyJ(j) {
  if (!isFinite(j) || j <= 0) return '0 J';
  if (j < 1) return `${j.toExponential(2)} J`;
  if (j < 1e6) return `${j.toLocaleString(undefined,{maximumFractionDigits:0})} J`;
  return `${j.toExponential(2)} J`;
}

// Find the closest landmark and report the multiple.
export function energyMetaphor(j) {
  if (!isFinite(j) || j <= 0) return '\u2014';
  // Sort once; OK each call (small list).
  const sorted = ENERGY_LANDMARKS.slice().sort((a,b) => a[0] - b[0]);
  // Find landmark such that j / landmark is most "human" (closest to 1..1000).
  let best = sorted[0];
  for (const lm of sorted) {
    if (j >= lm[0] * 0.5) best = lm;
  }
  const ratio = j / best[0];
  let qty;
  if (ratio < 1)        qty = `${(ratio * 100).toFixed(1)}% of`;
  else if (ratio < 10)  qty = `${ratio.toFixed(2)} \u00d7`;
  else if (ratio < 1e6) qty = `${Math.round(ratio).toLocaleString()} \u00d7`;
  else                  qty = `${ratio.toExponential(2)} \u00d7`;
  return `\u2248 ${qty} ${best[1]}`;
}

// Searchable index of every named body across all 3 scale tiers.
// Tier indexes match ScaleManager: 0 = solar, 1 = galactic, 2 = universe.
export const SEARCH_INDEX = (() => {
  const out = [];
  out.push({ name: 'Sun',  tier: 0 });
  out.push({ name: 'Moon', tier: 0 });
  for (const p of PLANETS) out.push({ name: p.name, tier: 0 });
  out.push({ name: 'Sun',                       tier: 1 });
  out.push({ name: 'Galactic Center (Sgr A*)',  tier: 1 });
  for (const s of NEARBY_STARS) out.push({ name: s.name, tier: 1 });
  for (const g of NAMED_GALAXIES) out.push({ name: g.name, tier: 2 });
  return out;
})();
