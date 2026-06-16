import { testimonials } from '../data/testimonials.js';

export default function Testimonials() {
  return (
    <section className="section section-dark" id="testimonials">
      <h2 className="section-title">What colleagues say</h2>
      <p className="section-lead">
        Peer recognition from senior-engineer criteria — paraphrased from colleague references.
      </p>
      <div className="testimonial-grid">
        {testimonials.map((t) => (
          <blockquote key={t.id} className="testimonial-card">
            {t.highlight && <p className="testimonial-highlight">“{t.highlight}”</p>}
            <p className="testimonial-quote">“{t.quote}”</p>
            <footer>
              <strong>{t.author}</strong>
              <span>
                {t.role}
                {t.company ? ` · ${t.company}` : ''}
              </span>
            </footer>
          </blockquote>
        ))}
      </div>
    </section>
  );
}
