// Minimal TOML reader for Acton.toml.
//
// Acton.toml only uses a small subset of TOML: `[section.path]` table
// headers, and `key = value` pairs where value is a quoted string, an
// integer, a boolean, or a flat array of those. That's all this parser
// supports — it is not a general-purpose TOML implementation.

function stripComment(line: string): string {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' || ch === "'") {
      inString = !inString
    } else if (ch === '#' && !inString) {
      return line.slice(0, i)
    }
  }
  return line
}

function parseScalar(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^-?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  return trimmed
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim()
    if (inner === '') return []
    return splitTopLevel(inner).map(parseScalar)
  }
  return parseScalar(trimmed)
}

/** Split a comma-separated list, ignoring commas inside quoted strings. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inString: string | null = null
  let current = ''
  for (const ch of text) {
    if (inString) {
      current += ch
      if (ch === inString) inString = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = ch
      current += ch
    } else if (ch === '[') {
      depth++
      current += ch
    } else if (ch === ']') {
      depth--
      current += ch
    } else if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '') parts.push(current)
  return parts
}

export function parseToml(text: string): Record<string, any> {
  const root: Record<string, any> = {}
  let current = root

  for (const rawLine of text.split('\n')) {
    const line = stripComment(rawLine).trim()
    if (line === '') continue

    const tableMatch = line.match(/^\[([^\]]+)\]$/)
    if (tableMatch) {
      current = root
      for (const key of tableMatch[1].split('.').map((s) => s.trim())) {
        if (!(key in current)) current[key] = {}
        current = current[key]
      }
      continue
    }

    const kvMatch = line.match(/^([\w-]+)\s*=\s*(.+)$/)
    if (!kvMatch) continue
    const [, key, rawValue] = kvMatch
    current[key] = parseValue(rawValue)
  }

  return root
}
