import type { PageConfig, PageId } from '../config/pages'

interface SidebarProps {
  pages: PageConfig[]
  activePage: PageId
  onSelect: (id: PageId) => void
}

export function Sidebar({ pages, activePage, onSelect }: SidebarProps) {
  return (
    <aside className="sidebar" role="navigation" aria-label="Main categories">
      <nav className="sidebar__nav">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            className={`sidebar__item ${activePage === page.id ? 'sidebar__item--active' : ''}`}
            onClick={() => onSelect(page.id)}
            aria-pressed={activePage === page.id}
          >
            <span className="sidebar__icon">{page.icon}</span>
            <span className="sidebar__label">{page.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
