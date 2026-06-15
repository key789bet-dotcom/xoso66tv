#!/usr/bin/env node
/**
 * Inspect TẤT CẢ lines trong asian_handicap và over_under
 * để biết line nào là "main pre-match" và line nào là alt/live/1st-half
 */
const fs = require('fs');
const path = require('path');

const dumpPath = process.argv[2] || '/tmp/odds-api-dump-1548217.json';
if (!fs.existsSync(dumpPath)) {
  console.error('File không tồn tại:', dumpPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
const odds = data.data && data.data.odds;
if (!odds) { console.error('Không có odds trong dump'); process.exit(1); }

console.log('═══ TOP-LEVEL ODDS MARKETS ═══');
Object.keys(odds).forEach(k => {
  const v = odds[k];
  console.log('  -', k, Array.isArray(v) ? `(${v.length} items)` : typeof v);
});

console.log('\n═══ ASIAN HANDICAP — group by line ═══');
const ahArr = odds.asian_handicap || odds.handicap || odds.asian || [];
const ahByLine = {};
ahArr.forEach(o => {
  const line = o.handicap;
  const key = String(line);
  if (!ahByLine[key]) ahByLine[key] = { line: line, items: [], bookmakers: new Set() };
  ahByLine[key].items.push(o);
  if (o.bookmaker_name) ahByLine[key].bookmakers.add(o.bookmaker_name);
});
const ahLines = Object.values(ahByLine).sort((a,b) => Math.abs(parseFloat(a.line)||0) - Math.abs(parseFloat(b.line)||0));
console.log('Total unique AH lines:', ahLines.length);
ahLines.forEach(l => {
  const home = l.items.find(o => /home/i.test(o.value_name||''));
  const away = l.items.find(o => /away/i.test(o.value_name||''));
  console.log(`  line=${l.line}  bookmakers=${l.bookmakers.size}  home=${home?home.odd_value:'-'}  away=${away?away.odd_value:'-'}  (sample: ${Array.from(l.bookmakers).slice(0,3).join(', ')})`);
});

console.log('\n═══ OVER/UNDER — group by line ═══');
const ouArr = odds.goals_over_under || odds.over_under || odds.totals || odds.goals || [];
const ouByLine = {};
ouArr.forEach(o => {
  const line = o.handicap || o.total;
  const key = String(line);
  if (!ouByLine[key]) ouByLine[key] = { line: line, items: [], bookmakers: new Set() };
  ouByLine[key].items.push(o);
  if (o.bookmaker_name) ouByLine[key].bookmakers.add(o.bookmaker_name);
});
const ouLines = Object.values(ouByLine).sort((a,b) => Math.abs((parseFloat(a.line)||0)-2.5) - Math.abs((parseFloat(b.line)||0)-2.5));
console.log('Total unique OU lines:', ouLines.length);
ouLines.forEach(l => {
  const over = l.items.find(o => /over/i.test(o.value_name||''));
  const under = l.items.find(o => /under/i.test(o.value_name||''));
  console.log(`  line=${l.line}  bookmakers=${l.bookmakers.size}  Over=${over?over.odd_value:'-'}  Under=${under?under.odd_value:'-'}  (sample: ${Array.from(l.bookmakers).slice(0,3).join(', ')})`);
});

console.log('\n═══ FAIR LINE ESTIMATION (từ x12) ═══');
const mwArr = odds.match_winner || odds['1x2'] || [];
const byBm = {};
mwArr.forEach(o => {
  const b = o.bookmaker_name;
  if (!byBm[b]) byBm[b] = {};
  if (/home/i.test(o.value_name||'')) byBm[b].home = parseFloat(o.odd_value);
  if (/draw/i.test(o.value_name||'')) byBm[b].draw = parseFloat(o.odd_value);
  if (/away/i.test(o.value_name||'')) byBm[b].away = parseFloat(o.odd_value);
});
Object.keys(byBm).slice(0, 5).forEach(b => {
  const m = byBm[b];
  if (m.home && m.away) {
    const ratio = m.away / m.home;  // away odds / home odds
    let estAH = 0;
    if (ratio > 5) estAH = -2;
    else if (ratio > 3) estAH = -1.5;
    else if (ratio > 2) estAH = -1;
    else if (ratio > 1.5) estAH = -0.5;
    else if (ratio > 1.1) estAH = -0.25;
    else if (ratio > 0.9) estAH = 0;
    else if (ratio > 0.6) estAH = 0.25;
    else estAH = 0.5;
    console.log(`  ${b}: home=${m.home} away=${m.away} ratio=${ratio.toFixed(2)} → est AH ~${estAH}`);
  }
});
