/**
 * Decode CSV/Excel exports: UTF-8, UTF-8 BOM, UTF-16 LE/BE (common when Excel saves "CSV").
 * Reading UTF-16 as UTF-8 produces garbage → one column / wrong splits → clicks never match.
 */
export async function readEncodedTextFile(file: File): Promise<string> {
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
