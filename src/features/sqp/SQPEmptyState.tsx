import type { FC } from 'react'

export const SQPEmptyState: FC = () => (
  <div className="sqp-empty">
    <p className="sqp-empty__title">No data yet</p>
    <p className="sqp-empty__desc">
      Upload an Amazon Brand Analytics &quot;Search Query Performance&quot; CSV to get started.
    </p>
    <p className="sqp-empty__hint">
      Row 0 is skipped. Row 1 = headers. Row 2+ = data.
    </p>
  </div>
)
