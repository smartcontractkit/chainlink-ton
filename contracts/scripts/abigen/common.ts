import { ObjectLiteralExpression, MethodDeclaration, Node, SourceFile, TypeNode } from 'ts-morph'

// ---------------------------------------------------------------------------
//   shared struct-block helpers
// ---------------------------------------------------------------------------
interface StructBlock {
  name: string
  objectLiteral: ObjectLiteralExpression
}
export interface CellRefFieldInfo {
  fieldName: string
  nullable: boolean
}
export interface CellRefStructInfo {
  name: string
  fields: CellRefFieldInfo[]
  typeParams: string[]
}
/** Object-literal methods (`create(...) {}`) aren't exposed via a `getMethod` lookup. */
export function getObjectMethod(
  obj: ObjectLiteralExpression,
  name: string,
): MethodDeclaration | undefined {
  const prop = obj.getProperty(name)
  return prop && Node.isMethodDeclaration(prop) ? prop : undefined
}
/** Find every `export const StructName = { create(...), ... }` block. Generic structs
 *  (e.g. `CellRef<T>`-carrying messages) only have `create`/`toCell`, no `fromSlice`/`store`. */
export function getStructBlocks(sourceFile: SourceFile): StructBlock[] {
  const blocks: StructBlock[] = []
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const nameNode = varDecl.getNameNode()
    if (!Node.isIdentifier(nameNode)) continue

    const init = varDecl.getInitializer()
    if (!init || !Node.isObjectLiteralExpression(init)) continue
    if (!getObjectMethod(init, codecInterface.create)) continue

    blocks.push({ name: nameNode.getText(), objectLiteral: init })
  }
  return blocks
}
/** Unwrap a `T | null` union, reporting whether it was nullable. */
export function unwrapNullable(typeNode: TypeNode): { inner: TypeNode; nullable: boolean } {
  if (Node.isUnionTypeNode(typeNode)) {
    const nonNull = typeNode.getTypeNodes().filter((t) => t.getText() !== 'null')
    if (nonNull.length === 1) {
      return { inner: nonNull[0], nullable: true }
    }
  }
  return { inner: typeNode, nullable: false }
} // ---------------------------------------------------------------------------
//   CellRef<T> ergonomic transform
//
//   acton generates `type CellRef<T> = { ref: T }`, leaking serialization
//   details into the API. This rewrites the generated output so that fields
//   typed as `CellRef<T>` become just `T`, and the store/load functions
//   handle the cell-ref wrapping internally.
// ---------------------------------------------------------------------------

export const codecInterface = {
  create: 'create',
  fromSlice: 'fromSlice',
  store: 'store',
  toCell: 'toCell',
}
