import Link from 'next/link';
import DocsThemeBoot from './docs-theme-boot';

export function DocsShell({ title, eyebrow, description, sections, children, steps = [], highlights = [] }) {
  return (
    <main className="docs-shell">
      <DocsThemeBoot />
      <div className="docs-topbar">
        <Link href="/" className="page-link">Back to app</Link>
        <nav className="docs-nav" aria-label="Documentation pages">
          <Link href="/docs/sql-studio" className="page-link">SQL Studio</Link>
          <Link href="/docs/procedure-runner" className="page-link">Procedure Runner</Link>
        </nav>
      </div>

      <section className="docs-hero surface">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        {highlights.length ? (
          <div className="docs-highlight-row" aria-label="Highlights">
            {highlights.map((item) => (
              <span className={`docs-highlight docs-highlight-${item.tone || 'neutral'}`} key={item.label}>
                {item.label}
              </span>
            ))}
          </div>
        ) : null}
        {steps.length ? (
          <ol className="docs-quick-steps" aria-label="Quick steps">
            {steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        ) : null}
      </section>

      <div className="docs-layout">
        <aside className="docs-toc surface">
          <strong>On this page</strong>
          {sections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>{section.label}</a>
          ))}
        </aside>
        <div className="docs-content">
          {children}
        </div>
      </div>
    </main>
  );
}

export function DocsMiniSection({ title, children }) {
  return (
    <div className="docs-mini-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function DocsSection({ id, title, intro, children, tone = 'default' }) {
  return (
    <section id={id} className={`docs-section surface docs-section-${tone}`}>
      <h2>{title}</h2>
      {intro ? <p className="docs-section-intro">{intro}</p> : null}
      {children}
    </section>
  );
}

export function DocsCardGrid({ items }) {
  return (
    <div className="docs-grid">
      {items.map((item) => (
        <div className={`docs-card docs-card-${item.tone || 'default'}`} key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}

export function DocsExample({ title, children }) {
  return (
    <div className="docs-example">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
