import type { FC } from 'react'
import type { StrategyId } from './sqpStrategies'
import { STRATEGY_INFO } from './sqpStrategies'

interface SQPSidebarProps {
  activeStrategy: StrategyId
  onSelect: (id: StrategyId) => void
}

const STRATEGY_ORDER: StrategyId[] = [
  'overview',
  'defendWinners',
  'scaleConverters',
  'visibilityGaps',
  'clickLeak',
  'cartAddFriction',
  'keywordScoring',
]

export const SQPSidebar: FC<SQPSidebarProps> = ({
  activeStrategy,
  onSelect,
}) => (
  <nav className="sqp-sidebar" role="navigation" aria-label="SQP strategies">
    <ul className="sqp-sidebar__list">
      {STRATEGY_ORDER.map((id) => {
        const info = STRATEGY_INFO[id]
        return (
          <li key={id}>
            <button
              type="button"
              className={`sqp-sidebar__item ${activeStrategy === id ? 'sqp-sidebar__item--active' : ''}`}
              onClick={() => onSelect(id)}
              aria-pressed={activeStrategy === id}
            >
              {info.label}
            </button>
          </li>
        )
      })}
    </ul>
  </nav>
)
