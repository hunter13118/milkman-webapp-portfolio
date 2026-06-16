/**
 * <war-council-showcase> — Compact War Council preview card
 */
class WarCouncilShowcase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.checkLive();
  }

  get href() {
    return this.getAttribute('href') || 'http://localhost:3737/command-center';
  }

  async checkLive() {
    const el = this.shadowRoot.querySelector('.status');
    try {
      const res = await fetch(this.href, { signal: AbortSignal.timeout(2500), mode: 'no-cors' });
      el.innerHTML = '<span class="dot online"></span> Command Center reachable';
    } catch {
      el.innerHTML = '<span class="dot offline"></span> Start stack — :3737 offline';
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: linear-gradient(145deg, #0f1729 0%, #0a0e1a 100%);
          border: 1px solid #2d3f5e;
          border-radius: 12px;
          padding: 1.5rem;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s;
          min-height: 200px;
        }
        .card:hover { border-color: #10b981; transform: translateY(-2px); }
        .title { font-size: 1.1rem; font-weight: 700; color: #f59e0b; margin-bottom: 0.35rem; }
        .sub { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem; }
        .tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem; }
        .tag {
          font-size: 0.7rem; padding: 0.25rem 0.5rem; border-radius: 4px;
          background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.25);
        }
        .status { font-size: 0.8rem; color: #94a3b8; }
        .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
        .dot.online { background: #10b981; }
        .dot.offline { background: #64748b; }
      </style>
      <div class="card" part="card">
        <div class="title">War Council</div>
        <div class="sub">MCP orchestration · Battle Log · local + cloud LLMs</div>
        <div class="tags">
          <span class="tag">smart_route</span>
          <span class="tag">coding_delivery</span>
          <span class="tag">RAG</span>
          <span class="tag">tournament_vote</span>
        </div>
        <div class="status"><span class="dot offline"></span> Checking…</div>
      </div>
    `;
    this.shadowRoot.querySelector('.card').addEventListener('click', () => {
      window.open(this.href, '_blank');
    });
  }
}

customElements.define('war-council-showcase', WarCouncilShowcase);
