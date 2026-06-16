import { profile } from './data/profile.js';
import { projects, aiPrinciples, skills } from './data/projects.js';
import { experience } from './data/experience.js';
import Testimonials from './components/Testimonials.jsx';
import ProjectShowcase from './components/ProjectShowcase.jsx';
import './App.css';

function Nav() {
  return (
    <header className="nav">
      <div className="nav-identity">
        <a href="#" className="nav-brand">
          {profile.name}
        </a>
        <span className="nav-title">{profile.title}</span>
      </div>
      <nav className="nav-links" aria-label="Primary">
        <a href="#philosophy">AI craft</a>
        <a href="#projects">Projects</a>
        <a href="#skills">Skills</a>
        <a href="#testimonials">Testimonials</a>
        <a href="#experience">Experience</a>
        <a href="#contact">Contact</a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <h1 className="hero-tagline">{profile.tagline}</h1>
      <div className="hero-cta">
        <a href="#projects" className="btn btn-primary">
          See the work
        </a>
        {profile.resumeUrl ? (
          <a href={profile.resumeUrl} className="btn btn-ghost">
            Resume
          </a>
        ) : null}
        <a href={profile.warCouncilUrl} className="btn btn-ghost" target="_blank" rel="noreferrer">
          War Council live ↗
        </a>
      </div>
      <ul className="metrics">
        {profile.metrics.map((m) => (
          <li key={m.label}>
            <strong>{m.value}</strong>
            <span>{m.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AiPhilosophy() {
  return (
    <section className="section" id="philosophy">
      <h2 className="section-title">Working in the age of AI</h2>
      <p className="section-lead">
        Job security isn’t “prompt harder” — it’s shipping verified systems with clear escalation, memory, and
        observability. This workspace is built that way.
      </p>
      <div className="card-grid four">
        {aiPrinciples.map((p) => (
          <article key={p.title} className="card">
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ project }) {
  const isExternal =
    project.showcasePath?.startsWith('http') && !project.showcaseComponent;
  const hasLiveShowcase = Boolean(project.showcaseComponent);
  return (
    <article
      className={`project-card${hasLiveShowcase ? ' project-card--live-showcase' : ''}`}
      id={project.id}
    >
      {!hasLiveShowcase && (
        <div className="project-visual">
          <img src={project.image} alt="" loading="lazy" />
        </div>
      )}
      <div className="project-body">
        {project.showRepo !== false && project.repo ? (
          <p className="project-repo">{project.repo}</p>
        ) : null}
        <h3>{project.name}</h3>
        <p className="project-tagline">{project.tagline}</p>
        <ul className="project-highlights">
          {project.highlights.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
        <p className="stack">{project.stack.join(' · ')}</p>
        {isExternal && (
          <div className="project-actions">
            <a
              href={project.showcasePath}
              className="btn btn-primary"
              target="_blank"
              rel="noreferrer"
            >
              {project.liveLabel}
            </a>
          </div>
        )}
      </div>
      <ProjectShowcase project={project} />
    </article>
  );
}

function Projects() {
  return (
    <section className="section section-dark" id="projects">
      <h2 className="section-title">Workspace showcases</h2>
      <div className="project-list">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section className="section" id="skills">
      <h2 className="section-title">Capabilities</h2>
      <div className="card-grid">
        {skills.map((s) => (
          <article key={s.group} className="card">
            <h3>{s.group}</h3>
            <ul className="skill-list">
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function Experience() {
  return (
    <section className="section" id="experience">
      <h2 className="section-title">Experience</h2>
      <p className="section-lead">
        Consulting via {profile.employer ?? 'Daugherty / CGI'} since 2021, plus Catalyst Cityverse and
        personal AI platforms.
      </p>
      {experience.map((job) => (
        <article key={job.company} className="timeline-item">
          <div className="timeline-head">
            <h3>{job.role}</h3>
            <span>
              {job.company} · {job.period}
            </span>
          </div>
          <ul>
            {job.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}

function Contact() {
  return (
    <section className="section section-cta" id="contact">
      <h2 className="section-title">Let’s build something auditable</h2>
      <p className="section-lead">
        {profile.location}
        {profile.education ? ` · ${profile.education}` : ''}
        {profile.certifications?.length ? ` · ${profile.certifications.join(', ')}` : ''}
      </p>
      <div className="contact-links">
        {profile.email ? <a href={`mailto:${profile.email}`}>{profile.email}</a> : null}
        <a href={profile.linkedin} target="_blank" rel="noreferrer">
          LinkedIn
        </a>
        <a href={profile.github} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p>
        Built with React + Vite · Static showcases on Cloudflare Pages · Cursor orchestration-first
      </p>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <AiPhilosophy />
        <Projects />
        <Testimonials />
        <Skills />
        <Experience />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
