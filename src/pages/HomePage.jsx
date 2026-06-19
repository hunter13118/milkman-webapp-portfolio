import { Link } from 'react-router-dom';
import { profile } from '../data/profile.js';
import { aiPrinciples, featuredProjects, skills } from '../data/projects.js';
import { experience } from '../data/experience.js';
import Testimonials from '../components/Testimonials.jsx';
import ProjectCard, { ProjectsCatalogLink } from '../components/ProjectCard.jsx';

function Hero() {
  return (
    <section className="hero" id="top">
      <h1 className="hero-tagline">{profile.tagline}</h1>
      <div className="hero-cta">
        <a href="#featured" className="btn btn-primary">
          See the work
        </a>
        {profile.resumeUrl ? (
          <a href={profile.resumeUrl} className="btn btn-ghost">
            Resume
          </a>
        ) : null}
        <Link to="/projects" className="btn btn-ghost">
          All projects
        </Link>
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

function FeaturedProjects() {
  return (
    <section className="section section-dark" id="featured">
      <div className="section-head-row">
        <div>
          <h2 className="section-title">Featured work</h2>
          <p className="section-lead section-lead-tight">
            Flagship systems with preview.{' '}
            <Link to="/projects" className="inline-link">
              Seven more projects
            </Link>{' '}
            — demos, PWAs, and tools — on the catalog page.
          </p>
        </div>
      </div>
      <div className="project-list">
        {featuredProjects.map((p) => (
          <ProjectCard key={p.id} project={p} variant="featured" />
        ))}
      </div>
      <div className="section-foot-cta">
        <ProjectsCatalogLink />
      </div>
    </section>
  );
}

function Skills() {
  return (
    <section className="section" id="skills">
      <h2 className="section-title">Capabilities</h2>
      <div className="card-grid skills-grid">
        {skills.map((s) => (
          <article key={s.group} className="card skill-card">
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

export default function HomePage() {
  return (
    <>
      <Hero />
      <AiPhilosophy />
      <FeaturedProjects />
      <Testimonials />
      <Skills />
      <Experience />
      <Contact />
    </>
  );
}
