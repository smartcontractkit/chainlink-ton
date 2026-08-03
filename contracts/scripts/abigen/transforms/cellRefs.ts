// ---------------------------------------------------------------------------
//   AST-based post-processing of acton's generated TypeScript wrappers
//
//   acton (the Tolk toolchain) generates a fairly ergonomic-hostile TS API
//   for a few recurring patterns. These transforms rewrite the generated
//   output, using the TypeScript AST (via ts-morph) rather than regexes, so
//   struct-scoping and nesting are handled by a real parser instead of
//   brittle brace/line matching.
// ---------------------------------------------------------------------------

import * as morph from 'ts-morph'

export const shallowInterface = {
  create: 'createShallow',
  fromSlice: 'fromSliceShallow',
  store: 'storeShallow',
  toCell: 'toCellShallow',
}

// ---------------------------------------------------------------------------
//   CellRef<T> ergonomic transform
//
//   acton generates `type CellRef<T> = { ref: T }`, leaking serialization
//   details into the API. This rewrites the generated output so that fields
//   typed as `CellRef<T>` become just `T`, and the store/load functions
//   handle the cell-ref wrapping internally.
// ---------------------------------------------------------------------------

function transformStoreCellRefHelper(sourceFile: morph.SourceFile): void {
  const fn = sourceFile.getFunction('storeCellRef')
  if (!fn) return
  const param = fn.getParameters()[0]
  if (!param || param.getName() !== 'cell') return

  param.rename('value')
  param.getTypeNode()?.replaceWithText('T')
}

function transformLoadCellRefHelper(sourceFile: morph.SourceFile): void {
  const fn = sourceFile.getFunction('loadCellRef')
  if (!fn) return

  fn.getReturnTypeNode()?.replaceWithText('T')
  const returnStmt = fn.getStatements().find(morph.Node.isReturnStatement)
  const expr = returnStmt?.getExpression()
  if (!expr || !morph.Node.isObjectLiteralExpression(expr)) return

  const [prop] = expr.getProperties()
  if (prop && morph.Node.isPropertyAssignment(prop) && prop.getName() === 'ref') {
    returnStmt!.replaceWithText(`return ${prop.getInitializer()!.getText()};`)
  }
}

function transformReadCellRefMethod(sourceFile: morph.SourceFile): void {
  for (const cls of sourceFile.getClasses()) {
    const method = cls.getInstanceMethod('readCellRef')
    if (!method) continue

    method.getReturnTypeNode()?.replaceWithText('T')
    const returnStmt = method.getStatements().find(morph.Node.isReturnStatement)
    const expr = returnStmt?.getExpression()
    if (!expr || !morph.Node.isObjectLiteralExpression(expr)) continue

    const [prop] = expr.getProperties()
    if (prop && morph.Node.isPropertyAssignment(prop) && prop.getName() === 'ref') {
      returnStmt!.replaceWithText(`return ${prop.getInitializer()!.getText()};`)
    }
  }
}

/** Replace every remaining `CellRef<X>` type reference with `X`, one at a time (positions shift after each edit). */
function replaceCellRefTypeReferences(sourceFile: morph.SourceFile): void {
  while (true) {
    const ref = sourceFile
      .getDescendantsOfKind(morph.SyntaxKind.TypeReference)
      .find((t) => t.getTypeName().getText() === 'CellRef')
    if (!ref) break

    const arg = ref.getTypeArguments()[0]
    ref.replaceWithText(arg?.getText() ?? ref.getText())
  }
}

/** Strip `.ref` property accesses left over from values that used to be `CellRef<T>`. */
function removeRefPropertyAccesses(sourceFile: morph.SourceFile): void {
  while (true) {
    const access = sourceFile
      .getDescendantsOfKind(morph.SyntaxKind.PropertyAccessExpression)
      .find((p) => p.getName() === 'ref')
    if (!access) break

    access.replaceWithText(access.getExpression().getText())
  }
}

export default function transformCellRef(sourceFile: morph.SourceFile): void {
  if (!sourceFile.getTypeAlias('CellRef')) return

  transformStoreCellRefHelper(sourceFile)
  transformLoadCellRefHelper(sourceFile)
  transformReadCellRefMethod(sourceFile)

  removeCellRefTypeAlias(sourceFile)
  replaceCellRefTypeReferences(sourceFile)
  removeRefPropertyAccesses(sourceFile)
}

/**
 * `TypeAliasDeclaration.remove()` also swallows a surrounding blank line, which
 * `acton`'s generated spacing doesn't expect. Delete just the declaration's own
 * text (through its own trailing newline) so blank lines around it are untouched.
 */
function removeCellRefTypeAlias(sourceFile: morph.SourceFile): void {
  const typeAlias = sourceFile.getTypeAlias('CellRef')
  if (!typeAlias) return

  const start = typeAlias.getStart()
  let end = typeAlias.getEnd()
  if (sourceFile.getFullText()[end] === '\n') end += 1

  sourceFile.replaceText([start, end], '')
}
