import MilkmanShowcase from './MilkmanShowcase.jsx';
import WarCouncilShowcase from './WarCouncilShowcase.jsx';

export default function ProjectShowcase({ project }) {
  if (project.showcaseComponent === 'milkman') {
    return (
      <div className="project-embed project-embed-wc" id={`embed-${project.id}`}>
        <MilkmanShowcase />
      </div>
    );
  }
  if (project.showcaseComponent === 'war-council') {
    return (
      <div className="project-embed project-embed-wc" id={`embed-${project.id}`}>
        <WarCouncilShowcase />
      </div>
    );
  }
  if (project.showcasePath?.startsWith('http')) {
    return (
      <div className="project-embed project-embed-link">
        <a href={project.showcasePath} className="btn btn-primary" target="_blank" rel="noreferrer">
          {project.liveLabel} ↗
        </a>
      </div>
    );
  }
  return null;
}
