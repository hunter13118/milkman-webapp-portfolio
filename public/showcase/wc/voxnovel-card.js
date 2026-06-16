/**
 * <voxnovel-showcase> — Self-contained Web Component
 *
 * A preview card for the MilkMan Audiobook Maker. Drop into any portfolio
 * or orchestrator app. Zero dependencies, pure vanilla custom element.
 *
 * Usage:
 *   <script src="/showcase/voxnovel-card.js"></script>
 *   <voxnovel-showcase></voxnovel-showcase>
 *
 * Attributes:
 *   href     — URL to navigate to on click (default: /)
 *   api      — Base URL for health endpoint (default: http://localhost:3000)
 *   target   — Link target (_blank, _self, etc. Default: _self)
 */
class VoxNovelShowcase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.fetchHealth();
    this.startParticles();
  }

  disconnectedCallback() {
    if (this._particleInterval) clearInterval(this._particleInterval);
  }

  get href() { return this.getAttribute('href') || '/'; }
  get api() { return this.getAttribute('api') || 'http://localhost:3000'; }
  get target() { return this.getAttribute('target') || '_self'; }

  async fetchHealth() {
    try {
      const res = await fetch(`${this.api}/api/health`, { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      this.updateStatus(data);
    } catch {
      this.updateStatus(null);
    }
  }

  updateStatus(data) {
    const el = this.shadowRoot.querySelector('.status');
    if (!data) {
      el.innerHTML = '<span class="dot offline"></span> Offline';
      return;
    }
    el.innerHTML = `
      <span class="dot online"></span> Operational
      <span class="engine">🔊 ${data.engine || 'XTTS v2'}</span>
      <span class="gpu">🎮 GPU Hot</span>
    `;
  }

  startParticles() {
    const canvas = this.shadowRoot.querySelector('.particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const card = this.shadowRoot.querySelector('.card');
    canvas.width = card.offsetWidth || 800;
    canvas.height = card.offsetHeight || 280;

    const particles = Array.from({ length: 25 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.4 + 0.1
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha})`;
        ctx.fill();
      });
      this._particleFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: linear-gradient(135deg, #0f1729 0%, #1a2744 100%);
          border: 1px solid #2d3f5e;
          border-radius: 16px;
          padding: 28px;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          color: #e6edf3;
          position: relative;
          overflow: hidden;
          width: 100%;
          min-height: 240px;
        }
        .card:hover {
          border-color: #f59e0b;
          transform: translateY(-4px) scale(1.02);
          box-shadow:
            0 12px 40px rgba(245, 158, 11, 0.2),
            0 4px 12px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(245, 158, 11, 0.1);
        }
        .card:active {
          transform: translateY(-2px) scale(1.01);
        }
        .particles {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0.6;
        }
        .card:hover .particles {
          opacity: 1;
        }
        .content {
          position: relative;
          z-index: 1;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .icon {
          font-size: 32px;
          filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.6));
          animation: pulse 3s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .title {
          font-size: 18px;
          font-weight: 700;
          color: #f59e0b;
          letter-spacing: -0.5px;
        }
        .subtitle {
          font-size: 11px;
          color: #8b9ab5;
          margin-top: 3px;
          font-weight: 500;
        }
        .description {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.6;
          margin-bottom: 18px;
        }
        .features {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 18px;
        }
        .feature {
          font-size: 10px;
          padding: 4px 10px;
          border-radius: 14px;
          background: rgba(245, 158, 11, 0.08);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.2);
          transition: all 0.3s ease;
          font-weight: 500;
        }
        .card:hover .feature {
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.4);
        }
        .steps {
          display: flex;
          gap: 4px;
          margin-bottom: 18px;
        }
        .step {
          width: 100%;
          height: 3px;
          border-radius: 2px;
          background: #2d3f5e;
          position: relative;
          overflow: hidden;
        }
        .step::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, #f59e0b, #10b981);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.6s ease;
        }
        .card:hover .step::after {
          transform: scaleX(1);
        }
        .card:hover .step:nth-child(1)::after { transition-delay: 0s; }
        .card:hover .step:nth-child(2)::after { transition-delay: 0.1s; }
        .card:hover .step:nth-child(3)::after { transition-delay: 0.2s; }
        .card:hover .step:nth-child(4)::after { transition-delay: 0.3s; }
        .card:hover .step:nth-child(5)::after { transition-delay: 0.4s; }
        .card:hover .step:nth-child(6)::after { transition-delay: 0.5s; }
        .card:hover .step:nth-child(7)::after { transition-delay: 0.6s; }
        .status {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          color: #8b9ab5;
          padding-top: 14px;
          border-top: 1px solid #1e3052;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          display: inline-block;
        }
        .dot.online {
          background: #10b981;
          box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
          animation: blink 2s ease-in-out infinite;
        }
        .dot.offline { background: #ef4444; }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .engine { color: #60a5fa; }
        .gpu { color: #34d399; }
        .arrow {
          position: absolute;
          top: 28px;
          right: 28px;
          font-size: 20px;
          color: #2d3f5e;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1;
        }
        .card:hover .arrow {
          color: #f59e0b;
          transform: translateX(6px);
        }
        .waveform {
          display: flex;
          align-items: center;
          gap: 2px;
          position: absolute;
          bottom: 28px;
          right: 28px;
          z-index: 1;
        }
        .bar {
          width: 3px;
          background: #f59e0b;
          border-radius: 2px;
          opacity: 0.3;
          transition: opacity 0.3s ease;
        }
        .card:hover .bar {
          opacity: 0.8;
          animation: wave 1s ease-in-out infinite;
        }
        .bar:nth-child(1) { height: 8px; animation-delay: 0s; }
        .bar:nth-child(2) { height: 14px; animation-delay: 0.1s; }
        .bar:nth-child(3) { height: 6px; animation-delay: 0.2s; }
        .bar:nth-child(4) { height: 18px; animation-delay: 0.3s; }
        .bar:nth-child(5) { height: 10px; animation-delay: 0.15s; }
        .bar:nth-child(6) { height: 14px; animation-delay: 0.25s; }
        .bar:nth-child(7) { height: 8px; animation-delay: 0.05s; }
        @keyframes wave {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.8); }
        }
      </style>
      <div class="card" onclick="this.getRootNode().host.navigate()">
        <canvas class="particles"></canvas>
        <span class="arrow">→</span>
        <div class="waveform">
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
          <div class="bar"></div>
        </div>
        <div class="content">
          <div class="header">
            <div>
              <div class="title">Milkman Audiobook Generator</div>
              <div class="subtitle">AI-Powered Voice Cloning</div>
            </div>
          </div>
          <div class="description">
            Full-pipeline audiobook creation — upload EPUB, extract characters via BookNLP,
            assign cloned voices, generate with XTTS v2 or F5-TTS, review & regen per-clip.
          </div>
          <div class="steps">
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
            <div class="step"></div>
          </div>
          <div class="features">
            <span class="feature">XTTS v2</span>
            <span class="feature">F5-TTS</span>
            <span class="feature">BookNLP</span>
            <span class="feature">Voice Clone</span>
            <span class="feature">Per-Clip QA</span>
            <span class="feature">7-Step Wizard</span>
          </div>
          <div class="status">
            <span class="dot offline"></span> Checking...
          </div>
        </div>
      </div>
    `;
  }

  navigate() {
    const url = this.href.startsWith('http') ? this.href : `${this.api}${this.href}`;
    if (this.target === '_blank') {
      window.open(url, '_blank');
    } else {
      window.location.href = url;
    }
  }
}

customElements.define('voxnovel-showcase', VoxNovelShowcase);
