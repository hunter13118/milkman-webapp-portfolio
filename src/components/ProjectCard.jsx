import { Link } from 'react-router-dom';
import ProjectShowcase from './ProjectShowcase.jsx';

/**
 * @param {'featured' | 'catalog' | 'full'} variant
 * featured — live showcase first, copy collapsed (home hero cards)
 * catalog — thumbnail grid tile for /projects
 * full — legacy verbose layout
 */
export default function ProjectCard({ project, variant = 'full' }) {
  const isExternal =
    project.showcasePath?.startsWith('http') && !project.showcaseComponent;
  const isInternalApp = project.showcasePath?.startsWith('/') && !project.showcaseComponent;
  const hasLiveShowcase = Boolean(project.showcaseComponent);
  const isFeatured = variant === 'featured' && hasLiveShowcase;
  const isCatalog = variant === 'catalog';

  if (isCatalog) {
    return (
      <article className="catalog-card">
        <div className="catalog-card-visual">
          <img src={project.image} alt="" loading="lazy" />
        </div>
        <div className="catalog-card-body">
          {project.repo ? <p className="project-repo">{project.repo}</p> : null}
          <h3>{project.name}</h3>
          <p className="catalog-card-tagline">{project.tagline}</p>
          <p className="stack">{project.stack.slice(0, 4).join(' · ')}</p>
          <div className="project-actions catalog-card-actions">
            {isExternal && (
              <a
                href={project.showcasePath}
                className="btn btn-primary btn-sm"
                target="_blank"
                rel="noreferrer"
              >
                {project.liveLabel}
              </a>
            )}
            {isInternalApp && (
              <>
                <a href={project.showcasePath} className="btn btn-primary btn-sm">
                  {project.liveLabel}
                </a>
                {project.repoPath ? (
                  <a
                    href={project.repoPath}
                    className="btn btn-ghost btn-sm"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={`project-card${hasLiveShowcase ? ' project-card--live-showcase' : ''}${isFeatured ? ' project-card--featured' : ''}`}
      id={project.id}
    >
      {!hasLiveShowcase && (
        <div className="project-visual">
          <img src={project.image} alt="" loading="lazy" />
        </div>
      )}

      {isFeatured ? (
        <>
          <header className="project-featured-head">
            <h3>{project.name}</h3>
            <p className="stack stack-inline">{project.stack.join(' · ')}</p>
          </header>
          <ProjectShowcase project={project} />
          <details className="project-details">
            <summary>About this project</summary>
            <p className="project-tagline">{project.tagline}</p>
            <ul className="project-highlights">
              {project.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <>
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
            {isInternalApp && (
              <div className="project-actions">
                <a href={project.showcasePath} className="btn btn-primary">
                  {project.liveLabel}
                </a>
                {project.repoPath ? (
                  <a href={project.repoPath} className="btn btn-ghost" target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                ) : null}
              </div>
            )}
          </div>
          <ProjectShowcase project={project} />
        </>
      )}
    </article>
  );
}

export function ProjectsCatalogLink() {
  return (
    <Link to="/projects" className="btn btn-ghost">
      View all projects →
    </Link>
  );
}
