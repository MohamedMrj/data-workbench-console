import Link from 'next/link';

export function DocsShell({ title, eyebrow, description, sections, children }) {
  return (
    <main className="docs-shell">
      <div className="docs-topbar">
        <Link href="/" className="page-link">SQL Studio</Link>
        <nav className="docs-nav" aria-label="Documentation pages">
          <Link href="/docs/sql-studio" className="page-link">SQL Studio docs</Link>
          <Link href="/docs/procedure-runner" className="page-link">Procedure Runner docs</Link>
        </nav>
      </div>

      <section className="docs-hero surface">
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </section>

      <div className="docs-layout">
        <aside className="docs-toc surface">
          <strong>Innehåll</strong>
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

export function DocsSection({ id, title, children }) {
  return (
    <section id={id} className="docs-section surface">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function DocsCardGrid({ items }) {
  return (
    <div className="docs-grid">
      {items.map((item) => (
        <div className="docs-card" key={item.title}>
          <strong>{item.title}</strong>
          <span>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
