/**
 * <voxnovel-showcase-scroll> — Self-contained Scroll Experience Web Component
 *
 * A full Apple-style scroll-driven product showcase for The MilkMan.
 * Drop into any page. Zero dependencies. Pure Shadow DOM encapsulation.
 *
 * Usage:
 *   <script src="./voxnovel-scroll.js"></script>
 *   <voxnovel-showcase-scroll></voxnovel-showcase-scroll>
 *
 * Attributes:
 *   screenshots — Base path for screenshot images (default: "../milkman-portfolio/e2e/screenshots")
 *   href        — CTA button destination (default: http://localhost:3000)
 */
class VoxNovelShowcaseScroll extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const screenshotBase = this.getAttribute('screenshots') || '../milkman-portfolio/e2e/screenshots';
    const href = this.getAttribute('href') || 'http://localhost:3000';

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="showcase-root">
        <div class="scroll-progress"></div>
        <nav class="nav" aria-label="Showcase slides">
          <div class="nav-brand">Milkman Audiobook Generator</div>
          <div class="nav-steps">
            ${Array.from({length: 6}, (_, i) => `<div class="nav-step${i === 0 ? ' active' : ''}" data-section="${i}" role="button" tabindex="0" aria-label="Slide ${i + 1}"></div>`).join('')}
          </div>
        </nav>

        <div class="snap-track" tabindex="0">
        <!-- HERO -->
        <section class="hero" data-index="0">
          <div class="hero-badge">AI-Powered Audiobook Creation</div>
          <h1>Your book.<br><span class="gradient-text">Every voice.</span></h1>
          <p class="hero-sub">Upload an EPUB. Extract characters with NLP. Clone voices. Generate a full audiobook with per-clip quality control.</p>
          <div class="hero-cta">
            <a href="${href}" class="btn btn-primary" target="_blank">Launch Generator</a>
            <a href="#" class="btn btn-ghost" data-scroll="1">Explore ↓</a>
          </div>
        </section>

        <!-- FEATURE 1 -->
        <section data-index="1">
          <div class="feature-section">
            <div class="feature-text" data-animate>
              <div class="feature-label">Step 2.5 — Engine Selection</div>
              <h2 class="feature-title">Dual-engine<br>architecture</h2>
              <p class="feature-desc">Choose XTTS v2 for GPU-accelerated voice cloning with emotion transfer, or F5-TTS for lightning-fast CPU synthesis. Switch mid-workflow, lose nothing.</p>
              <ul class="feature-bullets">
                <li>Real-time UI adapts to engine capabilities</li>
                <li>Preview any voice before committing to full generation</li>
                <li>A/B comparison: same line, both engines, instant feedback</li>
              </ul>
            </div>
            <div class="feature-visual" data-animate>
              <img class="feature-screenshot" src="${screenshotBase}/engine-selector/01-xtts-default.png" alt="XTTS engine selector">
            </div>
          </div>
        </section>

        <!-- FEATURE 2 -->
        <section data-index="2">
          <div class="feature-section reverse">
            <div class="feature-text" data-animate>
              <div class="feature-label">Quality Control</div>
              <h2 class="feature-title">Surgical<br>regeneration</h2>
              <p class="feature-desc">Flag individual clips that don't pass muster. Regenerate one, ten, or a hundred — without re-running the entire audiobook. Non-destructive by design.</p>
              <ul class="feature-bullets">
                <li>Per-clip quality scoring with visual indicators</li>
                <li>Batch select by threshold — fix everything below 0.7 in one click</li>
                <li>GPU stays hot via persistent AudioWorker — no model reload</li>
              </ul>
            </div>
            <div class="feature-visual" data-animate>
              <img class="feature-screenshot" src="${screenshotBase}/regen-review-audit/03-modal-one-selected.png" alt="Per-clip regeneration">
            </div>
          </div>
        </section>

        <!-- STEPS -->
        <section data-index="3">
          <div class="steps-section">
            <h2>Seven steps to a<br>complete audiobook</h2>
            <p class="section-sub">Each step is a checkpoint. Skip forward, jump back, lose nothing.</p>
            <div class="steps-grid">
              ${[
                { num: '1', name: 'Upload', desc: 'EPUB / TXT' },
                { num: '2', name: 'Extract', desc: 'BookNLP' },
                { num: '2.5', name: 'Engine', desc: 'XTTS / F5' },
                { num: '3', name: 'Voices', desc: 'Clone & Assign' },
                { num: '4', name: 'Generate', desc: 'GPU Synthesis' },
                { num: '5', name: 'Review', desc: 'QA & Regen' },
                { num: '6', name: 'Export', desc: 'M4B / MP3' },
              ].map((s, i) => `
                <div class="step-card" data-animate data-delay="${i * 100}">
                  <div class="step-num">${s.num}</div>
                  <div class="step-name">${s.name}</div>
                  <div class="step-desc">${s.desc}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- TECH -->
        <section data-index="4">
          <div class="tech-section">
            <h2>Built different</h2>
            <div class="tech-grid">
              ${[
                { icon: '⚛️', name: 'React + Vite', role: 'Frontend — 7-step wizard UI' },
                { icon: '🐍', name: 'Flask', role: 'API — async job orchestration' },
                { icon: '🔊', name: 'XTTS v2', role: 'Voice cloning — GPU persistent' },
                { icon: '⚡', name: 'F5-TTS', role: 'Fast synthesis — CPU fallback' },
                { icon: '📚', name: 'BookNLP', role: 'Character extraction — NER + coref' },
                { icon: '🎮', name: 'RTX 5090', role: '32 GB VRAM — model stays hot' },
              ].map((t, i) => `
                <div class="tech-card" data-animate data-delay="${i * 100}">
                  <div class="tech-icon">${t.icon}</div>
                  <div class="tech-name">${t.name}</div>
                  <div class="tech-role">${t.role}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </section>

        <!-- CTA -->
        <section class="cta-section" data-index="5">
          <h2>Ready to <span class="gradient-text">hear your book?</span></h2>
          <p class="cta-sub">Local-first. No API keys. No subscriptions. Just your GPU and your story.</p>
          <a href="${href}" class="cta-btn" target="_blank">Launch Milkman Audiobook Generator →</a>
        </section>
        </div>
      </div>
    `;

    this.initAnimations();
  }

  scrollToSection(section, behavior = 'smooth') {
    const track = this.shadowRoot.querySelector('.snap-track');
    if (!section || !track) return;
    const top =
      section.offsetTop - (track.clientHeight - section.offsetHeight) / 2;
    track.scrollTo({ top: Math.max(0, top), behavior });
  }

  initAnimations() {
    const track = this.shadowRoot.querySelector('.snap-track');
    const progressBar = this.shadowRoot.querySelector('.scroll-progress');
    const sections = this.shadowRoot.querySelectorAll('section[data-index]');
    const navSteps = this.shadowRoot.querySelectorAll('.nav-step');
    const animElements = this.shadowRoot.querySelectorAll('[data-animate]');

    const scrollToIndex = (idx, behavior = 'smooth') => {
      const section = sections[idx];
      if (section) this.scrollToSection(section, behavior);
    };

    const updateActiveSlide = () => {
      const trackRect = track.getBoundingClientRect();
      const trackMid = trackRect.top + trackRect.height / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      sections.forEach((s) => {
        const r = s.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        const d = Math.abs(mid - trackMid);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = parseInt(s.dataset.index, 10);
        }
      });
      navSteps.forEach((step, i) => step.classList.toggle('active', i === bestIdx));
    };

    const onScroll = () => {
      const scrollTop = track.scrollTop;
      const scrollHeight = track.scrollHeight - track.clientHeight;
      progressBar.style.width = `${scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0}%`;
      updateActiveSlide();
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    track.addEventListener('scrollend', updateActiveSlide, { passive: true });
    updateActiveSlide();

    // Animate on scroll (re-triggers on scroll back)
    const animObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0;
            setTimeout(() => entry.target.classList.add('visible'), parseInt(delay, 10));
          } else {
            entry.target.classList.remove('visible');
          }
        });
      },
      { threshold: 0.2, root: track },
    );

    animElements.forEach((el) => animObs.observe(el));

    navSteps.forEach((step) => {
      const go = () => scrollToIndex(parseInt(step.dataset.section, 10));
      step.addEventListener('click', go);
      step.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });

    const exploreBtn = this.shadowRoot.querySelector('[data-scroll]');
    if (exploreBtn) {
      exploreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToIndex(parseInt(exploreBtn.dataset.scroll, 10));
      });
    }
  }

  getStyles() {
    return `
      :host {
        display: block;
        height: 100%;
        max-height: 100%;
        overflow: hidden;
        contain: layout style;
      }

      .showcase-root {
        --navy: #0a0e1a;
        --navy-light: #0f1729;
        --navy-mid: #1a2744;
        --amber: #f59e0b;
        --amber-dim: rgba(245, 158, 11, 0.15);
        --green: #10b981;
        --blue: #60a5fa;
        --slate: #94a3b8;
        --slate-dim: #64748b;
        --white: #e6edf3;
        --nav-h: 56px;

        font-family: 'Inter', -apple-system, sans-serif;
        background: var(--navy);
        color: var(--white);
        overflow: hidden;
        height: 100%;
        max-height: 100%;
        min-height: 0;
        position: relative;
      }

      .snap-track {
        height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        scroll-behavior: smooth;
        scroll-snap-type: y mandatory;
        overscroll-behavior-y: contain;
        scrollbar-width: none;
        -ms-overflow-style: none;
        outline: none;
      }
      .snap-track::-webkit-scrollbar { display: none; }

      * { margin: 0; padding: 0; box-sizing: border-box; }

      .scroll-progress {
        position: absolute;
        top: 0;
        left: 0;
        width: 0%;
        height: 3px;
        background: linear-gradient(90deg, var(--amber), var(--green));
        z-index: 1000;
        transition: width 0.1s linear;
        pointer-events: none;
      }

      .nav {
        position: absolute;
        top: 3px;
        left: 0;
        right: 0;
        height: var(--nav-h);
        padding: 12px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 999;
        background: linear-gradient(180deg, rgba(10,14,26,0.92) 0%, rgba(10,14,26,0.55) 70%, transparent 100%);
        backdrop-filter: blur(8px);
        pointer-events: none;
      }
      .nav-steps, .nav-brand { pointer-events: auto; }
      .nav-brand { font-size: 14px; font-weight: 700; color: var(--amber); letter-spacing: -0.5px; }
      .nav-steps { display: flex; gap: 6px; }
      .nav-step {
        width: 24px;
        height: 3px;
        border-radius: 2px;
        background: #2d3f5e;
        transition: all 0.4s ease;
        cursor: pointer;
      }
      .nav-step:hover { background: #475569; }
      .nav-step.active { background: var(--amber); width: 36px; }

      section {
        height: 100%;
        min-height: 100%;
        flex-shrink: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: calc(var(--nav-h) + 24px) 40px 32px;
        position: relative;
        scroll-snap-align: center;
        scroll-snap-stop: always;
      }

      /* Per-section background gradients */
      section[data-index="1"] { background: radial-gradient(ellipse at 30% 70%, rgba(245,158,11,0.04) 0%, transparent 50%); }
      section[data-index="2"] { background: radial-gradient(ellipse at 70% 40%, rgba(16,185,129,0.04) 0%, transparent 50%); }
      section[data-index="3"] { background: radial-gradient(ellipse at 50% 50%, rgba(96,165,250,0.04) 0%, transparent 50%); }
      section[data-index="4"] { background: radial-gradient(ellipse at 40% 60%, rgba(245,158,11,0.04) 0%, transparent 50%); }
      section[data-index="5"] { background: radial-gradient(ellipse at 50% 30%, rgba(16,185,129,0.05) 0%, transparent 60%); }

      .gradient-text {
        background: linear-gradient(135deg, var(--amber) 0%, #fbbf24 50%, var(--green) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }

      /* HERO */
      .hero { text-align: center; background: radial-gradient(ellipse at 50% 30%, rgba(245,158,11,0.06) 0%, transparent 60%); }
      .hero-badge {
        display: inline-block; font-size: 11px; font-weight: 600;
        letter-spacing: 2px; text-transform: uppercase; color: var(--amber);
        background: var(--amber-dim); border: 1px solid rgba(245,158,11,0.3);
        padding: 6px 16px; border-radius: 20px; margin-bottom: 32px;
        opacity: 0; transform: translateY(20px); animation: fadeUp 0.8s 0.2s forwards;
      }
      .hero h1 {
        font-size: clamp(48px, 8vw, 96px); font-weight: 900;
        letter-spacing: -3px; line-height: 1.05; margin-bottom: 24px;
        opacity: 0; transform: translateY(40px); animation: fadeUp 1s 0.4s forwards;
      }
      .hero-sub {
        font-size: clamp(16px, 2vw, 22px); color: var(--slate);
        max-width: 600px; line-height: 1.6; margin: 0 auto 48px;
        opacity: 0; transform: translateY(30px); animation: fadeUp 1s 0.6s forwards;
      }
      .hero-cta {
        display: flex; gap: 16px; justify-content: center;
        opacity: 0; transform: translateY(20px); animation: fadeUp 0.8s 0.8s forwards;
      }
      .btn {
        padding: 14px 32px; border-radius: 8px; font-size: 14px;
        font-weight: 600; cursor: pointer; text-decoration: none;
        transition: all 0.3s ease; border: none; font-family: inherit;
      }
      .btn-primary {
        background: var(--amber); color: var(--navy);
        box-shadow: 0 4px 24px rgba(245,158,11,0.3);
      }
      .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(245,158,11,0.4); }
      .btn-ghost {
        background: transparent; color: var(--white);
        border: 1px solid #2d3f5e;
      }
      .btn-ghost:hover { border-color: var(--amber); color: var(--amber); }

      /* FEATURES */
      .feature-section {
        display: grid; grid-template-columns: 1fr 1fr; gap: 80px;
        max-width: 1200px; width: 100%; align-items: center;
      }
      .feature-section.reverse { direction: rtl; }
      .feature-section.reverse > * { direction: ltr; }
      .feature-text {
        opacity: 0; transform: translateX(-60px);
        transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .feature-section.reverse .feature-text { transform: translateX(60px); }
      .feature-text.visible { opacity: 1; transform: translateX(0); }
      .feature-label { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--amber); margin-bottom: 16px; }
      .feature-title { font-size: clamp(28px, 4vw, 44px); font-weight: 800; letter-spacing: -1.5px; line-height: 1.15; margin-bottom: 20px; }
      .feature-desc { font-size: 16px; color: var(--slate); line-height: 1.7; margin-bottom: 28px; }
      .feature-bullets { list-style: none; display: flex; flex-direction: column; gap: 12px; }
      .feature-bullets li { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; color: var(--slate); }
      .feature-bullets li::before { content: '→'; color: var(--amber); font-weight: 700; flex-shrink: 0; }
      .feature-visual {
        opacity: 0; transform: translateX(60px) scale(0.9);
        transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1) 0.2s;
      }
      .feature-section.reverse .feature-visual { transform: translateX(-60px) scale(0.9); }
      .feature-visual.visible { opacity: 1; transform: translateX(0) scale(1); }
      .feature-screenshot {
        width: 100%; border-radius: 12px; border: 1px solid #2d3f5e;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4); transition: transform 0.3s ease;
      }
      .feature-screenshot:hover { transform: scale(1.02); }

      /* STEPS */
      .steps-section { text-align: center; max-width: 1000px; }
      .steps-section h2 { font-size: clamp(24px, 3.5vw, 36px); font-weight: 800; letter-spacing: -1.5px; margin-bottom: 12px; line-height: 1.15; }
      .section-sub { font-size: 18px; color: var(--slate); margin-bottom: 24px; }
      .steps-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 12px; width: 100%; }
      .step-card {
        background: var(--navy-light); border: 1px solid #2d3f5e; border-radius: 12px;
        padding: 14px 10px; text-align: center; opacity: 0; transform: translateY(40px);
        transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .step-card.visible { opacity: 1; transform: translateY(0); }
      .step-card:hover { border-color: var(--amber); transform: translateY(-4px); box-shadow: 0 8px 32px rgba(245,158,11,0.15); }
      .step-num { font-size: 24px; font-weight: 800; color: var(--amber); margin-bottom: 8px; }
      .step-name { font-size: 12px; font-weight: 600; color: var(--white); margin-bottom: 4px; }
      .step-desc { font-size: 11px; color: var(--slate-dim); }

      /* TECH */
      .tech-section { text-align: center; max-width: 900px; }
      .tech-section h2 { font-size: clamp(32px, 5vw, 52px); font-weight: 800; letter-spacing: -2px; margin-bottom: 32px; }
      .tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; }
      .tech-card {
        background: var(--navy-light); border: 1px solid #2d3f5e; border-radius: 12px;
        padding: 24px; text-align: left; opacity: 0; transform: translateY(30px);
        transition: all 0.5s ease;
      }
      .tech-card.visible { opacity: 1; transform: translateY(0); }
      .tech-card:hover { border-color: var(--blue); }
      .tech-icon { font-size: 24px; margin-bottom: 12px; }
      .tech-name { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
      .tech-role { font-size: 12px; color: var(--slate-dim); }

      /* CTA */
      .cta-section { text-align: center; }
      .cta-section h2 { font-size: clamp(36px, 6vw, 64px); font-weight: 900; letter-spacing: -2px; margin-bottom: 24px; }
      .cta-sub { font-size: 18px; color: var(--slate); margin-bottom: 40px; }
      .cta-btn {
        display: inline-block; padding: 16px 40px;
        background: linear-gradient(135deg, var(--amber), #d97706);
        color: var(--navy); font-weight: 700; font-size: 14px;
        border-radius: 50px; text-decoration: none; transition: all 0.3s ease;
        box-shadow: 0 8px 32px rgba(245,158,11,0.3);
      }
      .cta-btn:hover { transform: translateY(-2px) scale(1.05); box-shadow: 0 12px 48px rgba(245,158,11,0.4); }

      /* ANIMATIONS */
      @keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }

      /* Embedded portfolio viewport (~640px tall) */
      @media (max-height: 720px) {
        section[data-index="3"] {
          padding: calc(var(--nav-h) + 8px) 20px 12px;
        }
        section[data-index="3"] .steps-section h2 { font-size: 1.35rem; margin-bottom: 6px; }
        section[data-index="3"] .section-sub { font-size: 0.8rem; margin-bottom: 12px; line-height: 1.4; }
        section[data-index="3"] .steps-grid { gap: 6px; }
        section[data-index="3"] .step-card { padding: 8px 4px; border-radius: 8px; }
        section[data-index="3"] .step-num { font-size: 15px; margin-bottom: 2px; }
        section[data-index="3"] .step-name { font-size: 9px; }
        section[data-index="3"] .step-desc { font-size: 8px; line-height: 1.2; }
      }

      /* RESPONSIVE */
      @media (max-width: 768px) {
        section { padding: 60px 24px; }
        .feature-section { grid-template-columns: 1fr; gap: 40px; }
        .feature-section.reverse { direction: ltr; }
        .steps-grid { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); }
        .nav { padding: 16px 24px; }
      }
    `;
  }
}

customElements.define('voxnovel-showcase-scroll', VoxNovelShowcaseScroll);
