import type { FC } from 'react'

interface SQPErrorStateProps {
  message: string
  detail?: string
}

export const SQPErrorState: FC<SQPErrorStateProps> = ({ message, detail }) => (
  <div className="sqp-error">
    <p className="sqp-error__title">Error</p>
    <p className="sqp-error__message">{message}</p>
    {detail && <p className="sqp-error__detail">{detail}</p>}
  </div>
)
