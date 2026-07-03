/** Dialogue extraction rules — shared by Gemini and freemium extract prompts (mirrors server/analyze/dialogue_rules.py). */

export const DIALOGUE_EXTRACTION = `
DIALOGUE EXTRACTION PIPELINE (apply in order for every paragraph):

Step 1 — QUOTED SPEECH: Every span inside quotation marks becomes its own line.
  kind=dialogue, character_id=the speaker (slug), text=spoken words ONLY.
  Strip quote marks from text — the marks are not spoken aloud.

Step 2 — SPEECH TAGS: Any attribution outside quotes (said X, asked Y, he replied,
  she whispered, etc.) becomes a separate narrator line IMMEDIATELY after the
  dialogue it attributes (or before, if the book puts the tag first).
  kind=narration, character_id=narrator, line_weight=normal.
  Text must match the book EXACTLY — copy the tag verbatim:
    Source: he said quietly.  → text='he said quietly.'  (keep "he", do NOT write "Kuro")
    Source: said Mei.         → text='said Mei.'
  Never paraphrase, substitute names for pronouns, or invent words not in the source.
  Use kind=delivery ONLY for stylized HOW (sang, yelled, screamed, sobbed,
  laughed, muttered with emphasis) — NOT for plain said/asked/replied.

Step 3 — NARRATOR EXPOSITION: All remaining prose (scene description, action,
  interior summary that is not quoted speech) → kind=narration, character_id=narrator.

Step 4 — THOUGHTS: Internal monologue → kind=thought, character_id=thinker.

INTERRUPTED DIALOGUE (common pattern — follow exactly):
  Source: "Whatever you wish for," he said quietly. "The coin only summoned me."
  Output lines:
    1. character_id=kuro, kind=dialogue, text='Whatever you wish for,'
    2. character_id=narrator, kind=narration, text='he said quietly.'
    3. character_id=kuro, kind=dialogue, text='The coin only summoned me.'

CHAINED QUOTATIONS (back-to-back with no tag between):
  Source: "Hello," Mei said. "Are you lost?"
  → dialogue mei: 'Hello,'
  → narration narrator: 'Mei said.'  (verbatim)
  → dialogue mei: 'Are you lost?'

  Source: "No." "Then follow me."
  (no attribution between two quoted spans)
  → dialogue speaker A (first quote)
  → dialogue speaker B (second quote — MUST be the other present character; alternate turns)

SPEAKER RESOLUTION (character_id only — never rewrite tag text):
  - Explicit tag ('said Mei', 'Mei said', 'asked Kuro') → preceding dialogue gets that character.
  - Chained quotes with NO tag between them → alternate speakers among present_character_ids.
  - Pronoun in tag ('he said') → assign character_id on the PRECEDING dialogue line from gender +
    present_character_ids + who did NOT speak last (prefer the other speaker).
  - Self-identification in dialogue ("I'm Mei", "My name is Kuro") overrides turn order.

VERBATIM COVERAGE (critical): every word of the source book appears in exactly
one line, unchanged. No summarizing, skipping, merging distinct sentences, or
substituting words. bookNLP-style segmentation with AI scene/character attribution.
`;

export const DIALOGUE_EXAMPLES = `
Examples:
  Source: "It is cold," sang Mira.
  → dialogue mira: 'It is cold,'
  → delivery narrator (minor): 'sang Mira'  (stylized HOW → delivery OK)

  Source: "Hello," said Orin.
  → dialogue orin: 'Hello,'
  → narration narrator: 'said Orin.'  (verbatim tag from the book)

  Source: "Why?" "Because."
  → dialogue character_a: 'Why?'
  → dialogue character_b: 'Because.'  (alternate — different speakers)

  Source: The wind picked up. Mei shivered.
  → narration narrator: 'The wind picked up. Mei shivered.'
`;

export const EXTRACTION_RULES = `
${DIALOGUE_EXTRACTION}
${DIALOGUE_EXAMPLES}

Additional rules:
- Multi-speaker runs without "said X": use context (prior lines, scene
  present_character_ids, gender, conversation turn-taking) to pick the correct
  character_id. When uncertain between two present characters, prefer the one
  who did not speak last.
- SELF-IDENTIFICATION overrides turn-taking: if dialogue text clearly identifies
  the speaker ("It is I, PersonA", "I am PersonA", "PersonA speaking", first-person
  confession of identity), attribute to that character even when turn order suggests
  otherwise. Only override when the narrator explicitly attributes the line to
  someone else in the same beat or the text is unmistakably narrator prose.
- importance: 'primary' = recurring/named POV or major; 'secondary' = named but
  minor; 'background' = unnamed/crowd. Be conservative with 'primary'.
- Segment scenes on location change, time skip, or POV shift.
- NARRATOR/POV IDENTITY: the narrating voice is not always the same character.
  If the text is first-person ("I", "my") and the "I" is a named character
  established elsewhere (in this chunk or in KNOWN CHARACTERS below), attribute
  narration lines to that character's id, not the generic "narrator" — unless
  the book's style is consistently third-person/omniscient, in which case use
  "narrator" throughout. Re-evaluate at every POV/section shift; do not assume
  the same narrating identity carries across a scene break without re-checking
  the text's own pronouns and cues.
- KNOWN CHARACTERS CONTINUITY: if a "KNOWN CHARACTERS" list is provided below,
  it lists characters already identified elsewhere in this book. Before
  inventing a new id for someone in this chunk (e.g. "unnamed-male-protagonist",
  "the blacksmith", "he"), check whether they match a known character by name,
  alias, role, or description — if so, reuse that character's EXISTING id
  exactly. Only create a new id for a genuinely new character. Do not merge two
  distinct known characters into one, and do not invent a new alias-style id
  for someone who is clearly the protagonist or another already-known name.
- CHAPTER BOUNDARIES: Source text uses "## Chapter N: Title" section headers from the
  EPUB spine. Every scene MUST set chapter=N matching the section it was extracted from.
  Start a new scene at each chapter boundary unless the entire chapter is one continuous
  beat in the same location. Never assign lines from Chapter 2+ to chapter=1.
- SCENE TITLES (display labels): scene.title is a short evocative SETTING name for the
  reader — NOT the chapter title. Think film location cards: "Forest at Night",
  "Castle Gate at Dusk", "Rooftop at Sunset", "Market Square in the Rain".
  Derive from location + time-of-day/mood in background_desc. Keep under ~6 words.
  Put the formal chapter name only in the chapter field, never in scene.title.
- expression: normal|whisper|yell|sad|angry — match delivery when emotional.
- environment: open|indoor|hall|cave — acoustic space; default from scene location.
- intensity: 0.0–1.0 (0.5 subtle, 1.0 full).
`;
