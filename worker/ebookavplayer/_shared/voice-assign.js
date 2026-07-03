/** Per-character Edge voice assignment (mirrors server/audio/voices.py). */

const NARRATOR_DEFAULT = {
  male: "en-US-AndrewMultilingualNeural",
  female: "en-US-AvaMultilingualNeural",
};

const NATURAL_MALE = [
  "en-US-AndrewMultilingualNeural",
  "en-US-BrianMultilingualNeural",
  "en-US-ChristopherNeural",
  "en-US-DavisNeural",
  "en-US-EricNeural",
  "en-US-GuyNeural",
  "en-US-JasonNeural",
  "en-US-RogerNeural",
  "en-US-SteffanNeural",
  "en-US-TonyNeural",
  "en-GB-RyanNeural",
  "en-GB-ThomasNeural",
  "en-AU-WilliamMultilingualNeural",
];

const NATURAL_FEMALE = [
  "en-US-AvaMultilingualNeural",
  "en-US-AriaNeural",
  "en-US-EmmaMultilingualNeural",
  "en-US-JennyNeural",
  "en-US-MichelleNeural",
  "en-US-MonicaNeural",
  "en-US-NancyNeural",
  "en-US-SaraNeural",
  "en-GB-LibbyNeural",
  "en-GB-MaisieNeural",
  "en-GB-SoniaNeural",
  "en-AU-NatashaNeural",
];

const NATURAL_NEUTRAL = [
  "en-US-AndrewMultilingualNeural",
  "en-US-AvaMultilingualNeural",
];

export function poolForGender(gender) {
  const g = String(gender || "").toLowerCase();
  if (g.startsWith("m")) return NATURAL_MALE;
  if (g.startsWith("f")) return NATURAL_FEMALE;
  return NATURAL_NEUTRAL;
}

export function narratorVoice(gender = "male") {
  return NARRATOR_DEFAULT[gender] || NARRATOR_DEFAULT.male;
}

function bucket(gender, age) {
  const g = String(gender || "").toLowerCase();
  if (g.startsWith("m")) return "male";
  if (g.startsWith("f")) return "female";
  return "neutral";
}

function pitchOffset(bkt, idx, age) {
  let hz = 0;
  if (idx >= 1) hz += bkt === "male" ? -10 : 8;
  const ageL = String(age || "").toLowerCase();
  if (ageL === "child" || ageL === "young") hz += 6;
  else if (ageL === "old" || ageL === "elderly") hz -= 6;
  return Math.max(-18, Math.min(18, hz));
}

export function assignVoices(characters = []) {
  const assignments = {};
  const used = { male: 0, female: 0, neutral: 0 };
  const order = [...characters].sort((a, b) => {
    const rank = { primary: 0, secondary: 1, background: 2 };
    return (rank[a.importance] ?? 1) - (rank[b.importance] ?? 1);
  });

  for (const c of order) {
    const cid = c.id || c.name;
    if (!cid || cid === "narrator") continue;
    const bkt = bucket(c.gender, c.age);
    const pool = poolForGender(c.gender);
    const idx = used[bkt];
    used[bkt] += 1;
    const voice = pool[idx % pool.length];
    const pitchHz = pitchOffset(bkt, idx, c.age);
    assignments[cid] = {
      character_id: cid,
      voice,
      pitch: pitchHz ? `${pitchHz > 0 ? "+" : ""}${pitchHz}Hz` : "+0Hz",
      rate: "+0%",
    };
  }
  return assignments;
}

/**
 * Assign voices to characters not already in voiceState.assignments,
 * appending to the running per-bucket counters instead of re-sorting the
 * whole roster by importance. Used for per-chapter incremental compilation
 * so a character's voice never changes once assigned, at the cost of no
 * longer guaranteeing "primary" characters get first pick of the voice pool
 * across the whole book — only within the chapter they're first seen in.
 */
export function assignVoicesIncremental(newCharacters = [], voiceState) {
  const usedCounts = { ...(voiceState?.usedCounts || { male: 0, female: 0, neutral: 0 }) };
  const assignments = { ...(voiceState?.assignments || {}) };
  const order = [...newCharacters].sort((a, b) => {
    const rank = { primary: 0, secondary: 1, background: 2 };
    return (rank[a.importance] ?? 1) - (rank[b.importance] ?? 1);
  });

  for (const c of order) {
    const cid = c.id || c.name;
    if (!cid || cid === "narrator" || assignments[cid]) continue;
    const bkt = bucket(c.gender, c.age);
    const pool = poolForGender(c.gender);
    const idx = usedCounts[bkt];
    usedCounts[bkt] += 1;
    const voice = pool[idx % pool.length];
    const pitchHz = pitchOffset(bkt, idx, c.age);
    assignments[cid] = {
      character_id: cid,
      voice,
      pitch: pitchHz ? `${pitchHz > 0 ? "+" : ""}${pitchHz}Hz` : "+0Hz",
      rate: "+0%",
    };
  }
  return { usedCounts, assignments };
}

export function edgeVoiceCatalog(locale) {
  const rows = [];
  for (const id of [...NATURAL_MALE, ...NATURAL_FEMALE]) {
    const loc = id.split("-").slice(0, 2).join("-");
    if (locale && !loc.startsWith(locale)) continue;
    rows.push({
      id,
      label: id.replace(/Neural$/i, "").replace(/Multilingual/i, " "),
      locale: loc,
      gender: NATURAL_MALE.includes(id) ? "male" : "female",
      neural: true,
    });
  }
  return rows;
}
