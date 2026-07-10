import type { FC } from 'react'
import { TABULAR_UPLOAD_ACCEPT } from '../../utils/readEncodedTextFile'

interface SQPUploaderProps {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  fileName: string | null
}

export const SQPUploader: FC<SQPUploaderProps> = ({
  onFileChange,
  onClear,
  fileName,
}) => (
  <div className="sqp-upload">
    <input
      type="file"
      accept={TABULAR_UPLOAD_ACCEPT}
      onChange={onFileChange}
      className="sqp-upload__input"
      id="sqp-file"
    />
    <label htmlFor="sqp-file" className="sqp-upload__label">
      Choose File
    </label>
    {fileName && (
      <>
        <span className="sqp-upload__name">{fileName}</span>
        <button
          type="button"
          onClick={onClear}
          className="sqp-upload__clear"
          aria-label="Clear file"
        >
          Clear
        </button>
      </>
    )}
  </div>
)
