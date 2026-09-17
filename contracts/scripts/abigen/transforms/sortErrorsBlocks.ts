import { SourceFile, Node } from 'ts-morph'

// ---------------------------------------------------------------------------
//   Errors block sorting
//
//   acton's internal hash map is unordered, so `static Errors = { ... }`
//   entries come out in platform-specific order. Sort by (value, key) for
//   cross-platform determinism (macOS vs Linux).
// ---------------------------------------------------------------------------

export default function sortErrorsBlocks(sourceFile: SourceFile): void {
  for (const cls of sourceFile.getClasses()) {
    const prop = cls.getStaticProperty('Errors')
    if (!prop || !Node.isPropertyDeclaration(prop)) continue

    const initializer = prop.getInitializer()
    if (!initializer || !Node.isObjectLiteralExpression(initializer)) continue

    const entries = initializer
      .getProperties()
      .filter(Node.isPropertyAssignment)
      .map((assignment) => {
        const nameNode = assignment.getNameNode()
        const key = Node.isStringLiteral(nameNode) ? nameNode.getLiteralValue() : nameNode.getText()
        const value = Number(assignment.getInitializer()!.getText())
        return { key, value }
      })
      .sort((a, b) => a.value - b.value || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    if (entries.length === 0) continue

    // Rebuild as raw text (rather than remove()+addPropertyAssignment()) so every
    // entry keeps its trailing comma, matching acton's own formatting.
    // `replaceWithText` re-indents continuation lines to the node's own
    // indentation, so these are *relative* to that base, not absolute.
    const body = entries.map(({ key, value }) => `    '${key}': ${value},`).join('\n')
    initializer.replaceWithText(`{\n${body}\n}`)
  }
}
