import * as morph from 'ts-morph'
import * as common from '../common'
import { shallowInterface } from './cellRefs'

// ---------------------------------------------------------------------------
//   queryId / queryID omittable transform
//
//   acton generates `queryId: uint64` as a required field in every message
//   struct. In practice callers almost always pass 0n, so this makes the
//   field optional in create() args, send*() body types, and get-method
//   inline types, defaulting to 0n when omitted. Interface fields are left
//   required, since the value is always present after creation/deserialization.

// ---------------------------------------------------------------------------
const QUERY_ID_NAMES = new Set(['queryId', 'queryID'])

function isInsideInterface(node: morph.Node): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    if (morph.Node.isInterfaceDeclaration(parent)) return true
  }
  return false
}

function makeQueryIdFieldsOptional(sourceFile: morph.SourceFile): void {
  const signatures = sourceFile
    .getDescendantsOfKind(morph.SyntaxKind.PropertySignature)
    .filter((sig) => {
      if (!QUERY_ID_NAMES.has(sig.getName())) return false
      if (sig.hasQuestionToken()) return false
      if (sig.getTypeNode()?.getText() !== 'uint64') return false
      return !isInsideInterface(sig)
    })

  for (const sig of signatures) {
    sig.setHasQuestionToken(true)
  }
}

/** In every struct's create(), default the omitted queryId/queryID to 0n after the `...args` spread. */
function addQueryIdCreateDefaults(sourceFile: morph.SourceFile): void {
  for (const block of common.getStructBlocks(sourceFile)) {
    for (const methodName of [common.codecInterface.create, shallowInterface.create]) {
      const createMethod = common.getObjectMethod(block.objectLiteral, methodName)
      const typeNode = createMethod?.getParameters()[0]?.getTypeNode()
      if (!typeNode || !morph.Node.isTypeLiteral(typeNode)) continue

      const field = typeNode
        .getMembers()
        .find((m) => morph.Node.isPropertySignature(m) && QUERY_ID_NAMES.has(m.getName()))
      if (!field || !morph.Node.isPropertySignature(field)) continue
      const fieldName = field.getName()

      const returnStmt = createMethod!.getStatements().find(morph.Node.isReturnStatement)
      const obj = returnStmt?.getExpression()
      if (!obj || !morph.Node.isObjectLiteralExpression(obj)) continue
      if (obj.getProperty(fieldName)) continue

      const hasSpreadArgs = obj
        .getProperties()
        .some((p) => morph.Node.isSpreadAssignment(p) && p.getExpression().getText() === 'args')
      if (!hasSpreadArgs) continue

      obj.addPropertyAssignment({ name: fieldName, initializer: `args.${fieldName} ?? 0n` })
    }
  }
}

/** Default omitted query IDs when get-method args are pushed onto the stack. */
function addQueryIdStackDefaults(sourceFile: morph.SourceFile): void {
  const accesses = sourceFile
    .getDescendantsOfKind(morph.SyntaxKind.PropertyAccessExpression)
    .filter((p) => QUERY_ID_NAMES.has(p.getName()) && p.getExpression().getText() === 'msg')
    .filter((p) => {
      const parent = p.getParent()
      return morph.Node.isPropertyAssignment(parent) && parent.getName() === 'value'
    })

  for (const access of accesses) {
    access.replaceWithText(`msg.${access.getName()} ?? 0n`)
  }
}

export default function makeQueryIDOptional(sourceFile: morph.SourceFile): void {
  const text = sourceFile.getFullText()
  if (!text.includes('queryId') && !text.includes('queryID')) return

  makeQueryIdFieldsOptional(sourceFile)
  addQueryIdCreateDefaults(sourceFile)
  addQueryIdStackDefaults(sourceFile)
}
