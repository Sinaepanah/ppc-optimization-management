import type { PageConfig, PageId } from '../config/pages'

interface TopTabsProps {
  pages: PageConfig[]
  activePage: PageId
  onSelect: (id: PageId) => void
}

export function TopTabs({ pages, activePage, onSelect }: TopTabsProps) {
  return (
    <nav className="top-tabs" role="navigation" aria-label="Main tabs">
      <div className="top-tabs__list">
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            className={`top-tabs__item ${activePage === page.id ? 'top-tabs__item--active' : ''}`}
            onClick={() => onSelect(page.id)}
            aria-pressed={activePage === page.id}
          >
            {page.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
