import { catalogProjects } from '../data/projects.js';
import ProjectCard from '../components/ProjectCard.jsx';

export default function ProjectsPage() {
  return (
    <div className="projects-page">
      <header className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-lead">
          Demos, tools, and experiments — each opens in its own app under{' '}
          <code>/projects/&lt;name&gt;/</code>. No login required to browse this catalog; individual apps
          gate their own features.
        </p>
      </header>
      <div className="catalog-grid">
        {catalogProjects.map((p) => (
          <ProjectCard key={p.id} project={p} variant="catalog" />
        ))}
      </div>
    </div>
  );
}
