/* 12 位短 id：数据库主键与前端临时 key 共用 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

export function newId(size = 12): string {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < size; i += 1) {
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length]
  }
  return out
}
