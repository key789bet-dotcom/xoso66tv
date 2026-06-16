/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║ LEAGUE LOGOS - Copy y chang diendanbongda.com lib/leagues.js     ║
 * ║                                                                    ║
 * ║ Logo URL: api-sports.io CDN public (free, KHÔNG cần API key)     ║
 * ║   Pattern: https://media.api-sports.io/football/leagues/{ID}.png ║
 * ║                                                                    ║
 * ║ Mục đích: API thethaoviet trả league.id của BetsAPI (khác        ║
 * ║   API-Sports ID), nên phải MAP MANUAL bằng keywords.             ║
 * ║                                                                    ║
 * ║ Cách dùng:                                                         ║
 * ║   const { getLeagueLogo } = require('./league-logos');           ║
 * ║   logo = getLeagueLogo('Premier League');                        ║
 * ╚══════════════════════════════════════════════════════════════════*/

const API_SPORTS_CDN = 'https://media.api-sports.io/football/leagues/';

// ─── HOT LEAGUES MAP (copy y chang từ diendanbongda) ───
// id = API-Sports league ID (dùng làm URL logo)
// keywords = match BetsAPI league name (lowercase)
const HOT_LEAGUES = [
  // === QUỐC TẾ ===
  { id: 1,    keywords: ['world cup', 'fifa world cup'],                            priority: 1 },
  { id: 2,    keywords: ['champions league', 'ucl', 'uefa champions'],             priority: 2 },
  { id: 3,    keywords: ['europa league', 'uel', 'uefa europa'],                   priority: 3 },
  { id: 848,  keywords: ['conference league', 'uefa conference'],                   priority: 4 },
  { id: 4,    keywords: ['euro championship', 'european championship'],             priority: 5 },
  { id: 9,    keywords: ['copa america'],                                            priority: 6 },
  { id: 15,   keywords: ['club world cup', 'fifa club world'],                      priority: 7 },

  // === TOP 5 CHÂU ÂU ===
  { id: 39,   keywords: ['premier league', 'english premier', 'epl'],              priority: 10 },
  { id: 140,  keywords: ['la liga', 'laliga', 'primera division'],                 priority: 11 },
  { id: 135,  keywords: ['serie a', 'italian serie'],                              priority: 12 },
  { id: 78,   keywords: ['bundesliga', 'german bundesliga'],                       priority: 13 },
  { id: 61,   keywords: ['ligue 1', 'ligue1', 'french ligue'],                     priority: 14 },

  // === HẠNG 2 TOP 5 ===
  { id: 40,   keywords: ['championship', 'efl championship', 'english championship'], priority: 15 },
  { id: 41,   keywords: ['league one', 'english league one'],                       priority: 16 },
  { id: 42,   keywords: ['league two', 'english league two'],                       priority: 17 },
  { id: 141,  keywords: ['segunda division', 'la liga 2'],                          priority: 18 },
  { id: 79,   keywords: ['2. bundesliga', 'bundesliga 2'],                          priority: 19 },

  // === CUP TOP 5 ===
  { id: 45,   keywords: ['fa cup', 'english fa cup'],                               priority: 25 },
  { id: 48,   keywords: ['efl cup', 'carabao cup', 'league cup'],                  priority: 26 },
  { id: 143,  keywords: ['copa del rey'],                                            priority: 27 },
  { id: 81,   keywords: ['dfb pokal', 'dfb-pokal'],                                 priority: 28 },
  { id: 137,  keywords: ['coppa italia'],                                            priority: 29 },

  // === CHÂU ÂU KHÁC ===
  { id: 88,   keywords: ['eredivisie', 'dutch eredivisie'],                         priority: 30 },
  { id: 94,   keywords: ['primeira liga', 'liga portugal', 'portuguese'],          priority: 31 },
  { id: 144,  keywords: ['jupiler', 'belgian pro', 'pro league'],                  priority: 32 },
  { id: 179,  keywords: ['scottish premiership', 'scottish premier'],               priority: 33 },
  { id: 203,  keywords: ['super lig', 'turkish super'],                             priority: 34 },
  { id: 197,  keywords: ['super league greece', 'greek super'],                     priority: 35 },
  { id: 119,  keywords: ['danish superliga'],                                        priority: 36 },
  { id: 113,  keywords: ['allsvenskan'],                                             priority: 37 },
  { id: 218,  keywords: ['austrian bundesliga'],                                     priority: 38 },
  { id: 207,  keywords: ['swiss super league'],                                      priority: 39 },

  // === CHÂU Á ===
  { id: 307,  keywords: ['saudi pro', 'saudi league', 'roshn'],                    priority: 40 },
  { id: 292,  keywords: ['k league', 'k-league', 'korean league'],                  priority: 41 },
  { id: 98,   keywords: ['j1 league', 'j-league', 'j league', 'japanese league'],  priority: 42 },
  { id: 99,   keywords: ['j2 league'],                                              priority: 43 },
  { id: 169,  keywords: ['chinese super league', 'csl', 'china super'],            priority: 44 },
  { id: 188,  keywords: ['a-league', 'australian a-league', 'a league'],            priority: 45 },
  { id: 296,  keywords: ['malaysia super', 'msl'],                                  priority: 46 },
  { id: 274,  keywords: ['thai league', 't1', 'thailand league'],                  priority: 47 },
  { id: 274,  keywords: ['indonesian liga', 'indonesia liga'],                     priority: 48 },
  { id: 17,   keywords: ['afc champions league', 'asian champions'],               priority: 49 },
  { id: 18,   keywords: ['afc cup'],                                                priority: 50 },
  { id: 7,    keywords: ['asian cup'],                                              priority: 51 },

  // === VIỆT NAM ===
  { id: 340,  keywords: ['v-league', 'v league', 'v.league', 'vleague', 'vdqg'],   priority: 60 },
  { id: 637,  keywords: ['v-league 2', 'v league 2', 'v.league 2', 'hang nhat'],   priority: 61 },
  { id: 341,  keywords: ['vietnamese cup', 'cup quoc gia', 'vietnam cup'],         priority: 62 },
  { id: 831,  keywords: ['super cup vietnam', 'sieu cup'],                         priority: 63 },

  // === AMERICAS ===
  { id: 253,  keywords: ['mls', 'major league soccer'],                            priority: 70 },
  { id: 252,  keywords: ['us open cup'],                                            priority: 71 },
  { id: 256,  keywords: ['usl championship'],                                       priority: 72 },
  { id: 257,  keywords: ['usl league one'],                                         priority: 73 },
  { id: 489,  keywords: ['usl league two', 'usl two'],                              priority: 74 },
  { id: 491,  keywords: ['usl w league', 'usl w'],                                  priority: 75 },
  { id: 71,   keywords: ['brasileirao', 'brazilian serie a', 'brazil serie a'],   priority: 76 },
  { id: 128,  keywords: ['argentine primera', 'argentina primera'],                priority: 77 },
  { id: 262,  keywords: ['liga mx', 'mexican primera', 'mexico liga'],             priority: 78 },
  { id: 13,   keywords: ['copa libertadores'],                                       priority: 79 },
  { id: 11,   keywords: ['copa sudamericana'],                                       priority: 80 },

  // === AUSTRALIA (NPL secondary leagues) ===
  { id: 491,  keywords: ['queensland npl', 'queensland premier', 'npl queensland'],priority: 85 },
  { id: 492,  keywords: ['npl nsw', 'nsw npl'],                                    priority: 86 },
  { id: 493,  keywords: ['npl victoria', 'victoria npl'],                          priority: 87 },
  { id: 494,  keywords: ['npl western australia', 'wa npl'],                       priority: 88 },
  { id: 495,  keywords: ['npl south australia', 'sa npl'],                         priority: 89 },

  // === AFRICA ===
  { id: 12,   keywords: ['caf champions league'],                                   priority: 90 },
  { id: 6,    keywords: ['africa cup of nations', 'afcon'],                        priority: 91 },
  { id: 233,  keywords: ['egyptian premier'],                                       priority: 92 },
  { id: 288,  keywords: ['south african premier'],                                  priority: 93 },

  // === GIẢI NHỎ / NICHE (giữ y chang diendanbongda) ===
  { id: 928,  keywords: ['u19', 'aff u19', 'southeast asia u19'],                  priority: 100 },
  { id: 1031, keywords: ['bhutan'],                                                  priority: 101 },
  { id: 388,  keywords: ['kazakhstan', 'kazakh'],                                    priority: 102 },

  // === NỮ ===
  { id: 525,  keywords: ['womens super league', 'fa wsl', 'wsl'],                  priority: 110 },
  { id: 253,  keywords: ['nwsl'],                                                    priority: 111 },
  { id: 8,    keywords: ['womens world cup', "women's world cup"],                 priority: 112 },
];

// ============ HELPER FUNCTIONS ============

/**
 * Match league name text (từ thethaoviet API) với HOT_LEAGUES entry
 */
function matchLeague(leagueName) {
  if (!leagueName) return null;
  const s = String(leagueName).toLowerCase().trim();
  return HOT_LEAGUES.find(l => l.keywords.some(k => s.includes(k))) || null;
}

/**
 * Lấy logo URL cho league name (trả '' nếu không match)
 */
function getLeagueLogo(leagueName) {
  const m = matchLeague(leagueName);
  return m ? (API_SPORTS_CDN + m.id + '.png') : '';
}

/**
 * Check xem league name có phải giải hot không
 */
function isPopularLeague(leagueName) {
  return matchLeague(leagueName) !== null;
}

module.exports = {
  HOT_LEAGUES,
  matchLeague,
  getLeagueLogo,
  isPopularLeague,
  API_SPORTS_CDN
};
