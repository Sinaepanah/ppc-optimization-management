import { read, utils } from 'xlsx'

const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

export const TABULAR_UPLOAD_ACCEPT = '.csv,.txt,.xlsx,.xls'

export function isSupportedTabularFile(file: File): boolean {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.txt')) return true
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return true
  return EXCEL_MIME_TYPES.has(file.type) || file.type === 'text/csv' || file.type === 'application/csv'
}

/**
 * Decode CSV/Excel exports: UTF-8, UTF-8 BOM, UTF-16 LE/BE (common when Excel saves "CSV").
 * Reading UTF-16 as UTF-8 produces garbage → one column / wrong splits → clicks never match.
 */
export async function readEncodedTextFile(file: File): Promise<string> {
  const lowerName = file.name.toLowerCase()
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buf = await file.arrayBuffer()
    const wb = read(buf, { type: 'array' })
    const firstSheet = wb.SheetNames[0]
    if (!firstSheet) return ''
    return utils.sheet_to_csv(wb.Sheets[firstSheet], { FS: ',', RS: '\n' })
  }

  const buf = await file.arrayBuffer()
  const view = new Uint8Array(buf)
  if (view.length >= 2) {
    if (view[0] === 0xff && view[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(view.subarray(2))
    }
    if (view[0] === 0xfe && view[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(view.subarray(2))
    }
  }
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(view.subarray(3))
  }
  return new TextDecoder('utf-8').decode(view)
}
