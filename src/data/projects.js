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
];

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
