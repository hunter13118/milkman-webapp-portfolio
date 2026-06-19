import { Link, NavLink, useLocation } from 'react-router-dom';
import { profile } from '../data/profile.js';

export default function Nav() {
  const { pathname } = useLocation();
  const onHome = pathname === '/';

  const sectionHref = (id) => (onHome ? `#${id}` : `/#${id}`);

  return (
    <header className="nav">
      <div className="nav-identity">
        <Link to="/" className="nav-brand">
          {profile.name}
        </Link>
        <span className="nav-title">{profile.title}</span>
      </div>
      <nav className="nav-links" aria-label="Primary">
        {onHome ? (
          <>
            <a href={sectionHref('philosophy')}>AI craft</a>
            <a href={sectionHref('featured')}>Featured</a>
            <a href={sectionHref('skills')}>Skills</a>
            <a href={sectionHref('experience')}>Experience</a>
            <a href={sectionHref('contact')}>Contact</a>
          </>
        ) : (
          <Link to="/">Home</Link>
        )}
        <NavLink to="/projects" className={({ isActive }) => (isActive ? 'nav-active' : undefined)}>
          Projects
        </NavLink>
      </nav>
    </header>
  );
}
