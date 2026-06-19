import { projectHref, siteUrls } from '../config/site.js';

export const projects = [
  {
    id: 'milkman-audiobook',
    name: 'MilkMan Audiobook Generator',
    showRepo: false,
    tagline:
      'Long-form books → NLP extraction → multi-engine TTS → per-clip QA → downloadable audiobooks',
    stack: ['React', 'Vite', 'Flask', 'BookNLP', 'XTTS v2', 'Playwright'],
    highlights: [
      'BERT-based NLP + coreference for character/voice attribution at book scale',
      'GPU-hot TTS pipeline (XTTS v2, F5-TTS) with librosa quality gates and regen loops',
      '7-step wizard, Flask/React/Node stack, 29+ Playwright E2E scenarios (TDD)',
      'Evolved from an early audiobook prototype into a full production pipeline',
    ],
    image: '/assets/screenshot-hero-v2.png',
    showcaseComponent: 'milkman',
    showcasePath: projectHref(siteUrls.milkmanApp, siteUrls.milkmanRepo),
    liveLabel: siteUrls.milkmanApp ? 'Open app' : 'View on GitHub',
  },
  {
    id: 'war-council',
    name: 'War Council',
    showRepo: false,
    tagline: 'Local-first MCP orchestration — route tasks, tournament votes, RAG, live Battle Log',
    stack: ['Node MCP', 'Ollama', 'HNSW RAG', 'SSE Dashboard', 'Cursor hooks'],
    highlights: [
      'MCP server coordinating 11+ local/cloud LLM & VLM models with RAG over repos',
      'coding_delivery arc: plan → Cursor patches → tests + capture_visual_audit + Hypeman',
      'Tournament votes, Battle Log SSE dashboard, 19-agent conductor workflow',
    ],
    image: '/assets/screenshot-wc-hero.png',
    showcaseComponent: 'war-council',
    showcasePath: projectHref(siteUrls.warCouncil, siteUrls.warCouncilRepo),
    liveLabel: siteUrls.warCouncil ? 'Open Command Center' : 'View on GitHub',
  },
  {
    id: 'copilot-tts',
    name: 'Copilot TTS',
    repo: 'copilot-tts',
    tagline: 'TTS experimentation workspace — voices, workers, Copilot agent integration',
    stack: ['Python', 'TTS pipelines', 'Agent framework'],
    highlights: [
      'Shared War Council agent roster',
      'AudioEngineer / VoiceWrangler specialization',
      'Design council UX references',
    ],
    image: '/assets/screenshot-standalone-hero.png',
    showcasePath: siteUrls.copilotTtsRepo,
    liveLabel: 'View on GitHub',
  },
  {
    id: 'cloudpilot',
    name: 'CloudPilot',
    repo: 'cloudpilot',
    tagline: 'Visual-to-Cloud mission control — Gemini grounds your canvas in enterprise standards',
    stack: ['React', 'Clerk', 'Cloudflare Workers', 'Gemini 2.5 Pro', 'Playwright'],
    highlights: [
      'Clerk-gated demo at /projects/cloudpilot — portfolio stays public',
      'demo · BYOK · operator capability tiers on one edge route',
      '2M-token standards corpus ingest, compliance audit, Terraform synthesis',
    ],
    image: '/assets/cloudpilot-hero.png',
    showcasePath: siteUrls.cloudPilotApp,
    repoPath: siteUrls.cloudPilotRepo,
    liveLabel: 'Open CloudPilot',
  },
  {
    id: 'context-fabric',
    name: 'Context Fabric',
    repo: 'context-fabric',
    tagline: 'Enterprise AI context layer — permission-aware graph, meeting briefs, MCP server',
    stack: ['React', 'Clerk', 'TypeScript', 'MCP', 'Cloudflare'],
    highlights: [
      'Clerk tier gates demo vs personal-friend real flow',
      'In-browser deterministic demo — no API keys required',
      'Graph-backed context for enterprise AI agents',
    ],
    showcasePath: siteUrls.contextFabricApp,
    repoPath: 'https://github.com/hunter13118/context-fabric',
    liveLabel: 'Open Context Fabric',
  },
  {
    id: 'gyokan',
    name: 'Gyōkan (Parallel Reader)',
    repo: 'gyokan',
    tagline: 'JP⇄EN parallel reading PWA — Edge TTS, offline bundles, FSRS reviews',
    stack: ['React', 'Clerk', 'sql.js', 'OPFS', 'PWA'],
    highlights: [
      'Parallel JP/EN reader with aligned paragraph pairs',
      'Offline bundle compile pipeline + Edge TTS playback',
      'FSRS spaced repetition review mode',
    ],
    showcasePath: siteUrls.gyokanApp,
    repoPath: 'https://github.com/hunter13118/gyokan',
    liveLabel: 'Open Gyōkan',
  },
  {
    id: 'ebookavplayer',
    name: 'Ebook AV Player',
    repo: 'ebookavplayer',
    tagline: 'Visual audiobook engine — EPUB to game-style voiced reading experience',
    stack: ['React', 'Clerk', 'FastAPI', 'Playwright'],
    highlights: [
      'Game-style scene player with voice prefs',
      'Embedded demo mode when backend unavailable',
      'Library + player dual-view UX',
    ],
    showcasePath: siteUrls.ebookAvPlayerApp,
    repoPath: 'https://github.com/hunter13118/ebookavplayer',
    liveLabel: 'Open Ebook AV',
  },
  {
    id: 'grade-the-grader',
    name: 'Grade the Grader',
    repo: 'grade-the-grader',
    tagline: 'Four parallel Gemini judges score AI output — matrix, radar, dissent',
    stack: ['React', 'Clerk', 'Gemini Flash', 'Recharts', 'Playwright'],
    highlights: [
      'Preset + custom rubrics with multi-judge consensus',
      'Score matrix, radar chart, and dissent highlighting',
      'Session history persisted in-browser',
    ],
    showcasePath: siteUrls.gradeTheGraderApp,
    repoPath: 'https://github.com/hunter13118/grade-the-grader',
    liveLabel: 'Open Grader',
  },
  {
    id: 'specterboard',
    name: 'SpecterBoard',
    repo: 'specterboard',
    tagline: 'Daily metric ghost leaderboard — streaks, rivals, AI smack talk',
    stack: ['React', 'Clerk', 'PWA', 'Gemini', 'Canvas share cards'],
    highlights: [
      'Track any daily metric against ghost rivals',
      'Streak counter + shareable PNG cards',
      'Gemini-generated daily smack talk',
    ],
    showcasePath: siteUrls.specterboardApp,
    repoPath: 'https://github.com/hunter13118/specterboard',
    liveLabel: 'Open SpecterBoard',
  },
];

/** Homepage live embeds — everything else lives on /projects */
export const FEATURED_PROJECT_IDS = ['milkman-audiobook', 'war-council'];

export const featuredProjects = projects.filter((p) => FEATURED_PROJECT_IDS.includes(p.id));
export const catalogProjects = projects.filter((p) => !FEATURED_PROJECT_IDS.includes(p.id));

export const aiPrinciples = [
  {
    title: 'Orchestrate, don’t monologue',
    body: 'Cheap conductor + local specialists. Cursor tokens for synthesis and patches, not for bulk exploration.',
  },
  {
    title: 'Verify before you ship',
    body: 'TDD gates, Playwright screenshots, and tournament arcs on architecture — AI output is a draft until tests say otherwise.',
  },
  {
    title: 'Memory-first context',
    body: 'RAG and repo maps before reading dozens of files — keeps humans employable by making systems auditable.',
  },
  {
    title: 'Observable by default',
    body: 'Battle Log, report_action, and explicit escalation tiers — you can see when premium models were worth it.',
  },
];

export const skills = [
  {
    group: 'Frontend & mobile',
    items: ['React', 'React Native', 'Angular', 'Next.js', 'Redux', 'Tailwind', 'TypeScript'],
  },
  {
    group: 'Backend & data',
    items: ['Java', 'Spring Boot', 'Node.js', 'Go', 'Ruby on Rails', 'PostgreSQL', 'GraphQL', 'REST'],
  },
  {
    group: 'Testing & QA',
    items: ['Playwright', 'Cypress', 'Serenity', 'Selenium', 'Cucumber', 'Mockito', 'WireMock'],
  },
  {
    group: 'Cloud & DevOps',
    items: ['GCP', 'Azure', 'AWS', 'GitHub Actions', 'CI/CD', 'Camunda'],
  },
  {
    group: 'AI / ML & orchestration',
    items: [
      'PyTorch',
      'CUDA',
      'BookNLP',
      'Coqui XTTS',
      'MCP',
      'Ollama',
      'RAG',
      'GitHub Copilot',
      'Claude',
    ],
  },
];
