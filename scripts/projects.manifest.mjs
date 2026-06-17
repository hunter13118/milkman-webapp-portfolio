/**
 * Portfolio sub-apps embedded at https://hunterthemilkman.com/projects/<slug>/
 * CloudPilot is integrated separately (Worker API routes + edge handlers).
 */
export const CLERK_PUBLISHABLE_FALLBACK =
  "pk_test_YnVyc3RpbmctdGFycG9uLTY1LmNsZXJrLmFjY291bnRzLmRdiQ";

/** @typedef {{ slug: string, name: string, repo: string, root: string, appDir: string, buildCmd?: string, clerk?: boolean, hero?: string }} SpaProject */

/** @type {SpaProject[]} */
export const SPA_PROJECTS = [
  {
    slug: "context-fabric",
    name: "Context Fabric",
    repo: "context-fabric",
    root: "../Context Fabric",
    appDir: "web",
    clerk: true,
  },
  {
    slug: "ebookavplayer",
    name: "Ebook AV Player",
    repo: "ebookavplayer",
    root: "../EbookAVPlayer",
    appDir: "web",
    clerk: true,
  },
  {
    slug: "gyokan",
    name: "Gyōkan (Parallel Reader)",
    repo: "gyokan",
    root: "../claude cowork files/Projects/Gyōkan",
    appDir: "pwa",
    clerk: true,
  },
  {
    slug: "grade-the-grader",
    name: "Grade the Grader",
    repo: "grade-the-grader",
    root: "../grade-the-grader",
    appDir: ".",
    clerk: true,
  },
  {
    slug: "specterboard",
    name: "SpecterBoard",
    repo: "specterboard",
    root: "../specterboard",
    appDir: ".",
    clerk: true,
  },
];

/** Portfolio cards for repos without a static /projects/ embed (yet). */
export const REPO_ONLY_PROJECTS = [
  {
    slug: "war-council",
    name: "War Council",
    repo: "war-council",
    tagline: "Local-first MCP orchestration — route tasks, tournament votes, RAG, live Battle Log",
  },
  {
    slug: "copilot-sonar",
    name: "Copilot TTS (Sonar)",
    repo: "copilot-sonar",
    tagline: "Neural TTS experimentation — voices, workers, Copilot agent integration",
  },
  {
    slug: "milkman-audiobook-maker",
    name: "MilkMan Audiobook Generator",
    repo: "milkman-audiobook-maker",
    tagline: "BookNLP extraction → multi-engine TTS → per-clip QA → downloadable audiobooks",
  },
];

export function projectBasePath(slug) {
  return `/projects/${slug}/`;
}
