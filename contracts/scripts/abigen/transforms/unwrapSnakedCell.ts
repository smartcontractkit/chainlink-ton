// ---------------------------------------------------------------------------
//   SnakedCell<T> ergonomic transform
//
//   acton generates `type SnakedCell<T> = c.Cell`, forcing every caller to
//   manually snake-encode arrays before calling `.create()`. This rewrites
//   the generated output so that `SnakedCell<T>` is `T[]` and the generated
//   `store()` / `fromSlice()` methods handle the snake encoding
//   automatically — the same way `lisp_list<T>` already works.
// ---------------------------------------------------------------------------
// Primitive Tolk integer types that appear as SnakedCell<T> type parameters.
// These don't have generated `.store` / `.fromSlice` methods, so we inline

import * as morph from 'ts-morph'
import * as common from '../common'

// the store/load expressions.
const PRIMITIVE_SNAKE_ITEMS: Record<string, [store: string, load: string]> = {
  uint8: ['(v, b) => b.storeUint(v, 8)', '(s) => s.loadUintBig(8)'],
  uint64: ['(v, b) => b.storeUint(v, 64)', '(s) => s.loadUintBig(64)'],
  uint128: ['(v, b) => b.storeUint(v, 128)', '(s) => s.loadUintBig(128)'],
  uint160: ['(v, b) => b.storeUint(v, 160)', '(s) => s.loadUintBig(160)'],
  uint192: ['(v, b) => b.storeUint(v, 192)', '(s) => s.loadUintBig(192)'],
  uint256: ['(v, b) => b.storeUint(v, 256)', '(s) => s.loadUintBig(256)'],
  'c.Address': ['(v, b) => b.storeAddress(v)', '(s) => s.loadAddress()'],
}

function snakeStoreExpr(itemType: string): string {
  return PRIMITIVE_SNAKE_ITEMS[itemType]?.[0] ?? `${itemType}.store`
}

function snakeLoadExpr(itemType: string): string {
  return PRIMITIVE_SNAKE_ITEMS[itemType]?.[1] ?? `${itemType}.fromSlice`
}

const SNAKED_HELPERS = `

function storeSnakedCellOf<T>(v: SnakedCell<T>, b: c.Builder, storeFn_T: StoreCallback<T>): void {
    if (v.length === 0) {
        b.storeRef(c.Cell.EMPTY);
        return;
    }
    const cells: c.Builder[] = [];
    let builder = c.beginCell();
    for (const value of v) {
        let itemB = c.beginCell();
        storeFn_T(value, itemB);
        if (builder.availableBits < itemB.bits || builder.availableRefs <= 1) {
            cells.push(builder);
            builder = c.beginCell();
        }
        builder.storeBuilder(itemB);
    }
    cells.push(builder);
    let current = cells[cells.length - 1].endCell();
    for (let i = cells.length - 2; i >= 0; i--) {
        cells[i].storeRef(current);
        current = cells[i].endCell();
    }
    b.storeRef(current);
}

function loadSnakedCellOf<T>(s: c.Slice, loadFn_T: LoadCallback<T>): SnakedCell<T> {
    let outArr = [] as T[];
    let head = s.loadRef().beginParse();
    while (head.remainingBits > 0 || head.remainingRefs > 0) {
        if (head.remainingBits > 0) {
            outArr.push(loadFn_T(head));
        }
        if (head.remainingRefs > 0) {
            head = head.loadRef().beginParse();
        } else {
            break;
        }
    }
    return outArr;
}
`
interface SnakedFieldInfo {
  itemType: string
  nullable: boolean
}
/** Snaked-cell fields declared in a struct's `create(args: { ... })` parameter type. */
function getSnakedFields(block: morph.ObjectLiteralExpression): Map<string, SnakedFieldInfo> {
  const fields = new Map<string, SnakedFieldInfo>()
  const createMethod = common.getObjectMethod(block, common.codecInterface.create)
  const typeNode = createMethod?.getParameters()[0]?.getTypeNode()
  if (!typeNode || !morph.Node.isTypeLiteral(typeNode)) return fields

  for (const member of typeNode.getMembers()) {
    if (!morph.Node.isPropertySignature(member)) continue
    const fieldType = member.getTypeNode()
    if (!fieldType) continue

    const { inner, nullable } = common.unwrapNullable(fieldType)
    if (!morph.Node.isTypeReference(inner) || inner.getTypeName().getText() !== 'SnakedCell')
      continue

    const itemType = inner.getTypeArguments()[0]?.getText()
    if (itemType) fields.set(member.getName(), { itemType, nullable })
  }
  return fields
}

function transformSnakedStore(
  block: morph.ObjectLiteralExpression,
  field: string,
  info: SnakedFieldInfo,
): void {
  const storeMethod = common.getObjectMethod(block, common.codecInterface.store)
  if (!storeMethod) return
  const storeExpr = snakeStoreExpr(info.itemType)

  for (const stmt of storeMethod.getStatements()) {
    if (!morph.Node.isExpressionStatement(stmt)) continue
    const expr = stmt.getExpression()
    if (!morph.Node.isCallExpression(expr)) continue

    if (!info.nullable) {
      if (expr.getExpression().getText() !== 'b.storeRef') continue
      const args = expr.getArguments()
      if (args.length !== 1 || args[0].getText() !== `self.${field}`) continue
      stmt.replaceWithText(`storeSnakedCellOf(self.${field}, b, ${storeExpr});`)
    } else {
      if (expr.getExpression().getText() !== 'storeTolkNullable') continue
      const typeArgs = expr.getTypeArguments()
      if (typeArgs.length !== 1 || typeArgs[0].getText() !== `SnakedCell<${info.itemType}>`)
        continue
      const args = expr.getArguments()
      if (args.length !== 3 || args[0].getText() !== `self.${field}`) continue
      if (args[2].getText() !== '(v,b) => b.storeRef(v)') continue
      stmt.replaceWithText(
        `storeTolkNullable<SnakedCell<${info.itemType}>>(self.${field}, b, (v,b) => storeSnakedCellOf(v, b, ${storeExpr}));`,
      )
    }
  }
}

function transformSnakedLoad(
  block: morph.ObjectLiteralExpression,
  field: string,
  info: SnakedFieldInfo,
): void {
  const fromSliceMethod = common.getObjectMethod(block, common.codecInterface.fromSlice)
  const returnStmt = fromSliceMethod?.getStatements().find(morph.Node.isReturnStatement)
  const obj = returnStmt?.getExpression()
  if (!obj || !morph.Node.isObjectLiteralExpression(obj)) return

  const prop = obj.getProperty(field)
  if (!prop || !morph.Node.isPropertyAssignment(prop)) return
  const init = prop.getInitializer()
  if (!init) return
  const loadExpr = snakeLoadExpr(info.itemType)

  if (!info.nullable) {
    if (morph.Node.isCallExpression(init) && init.getText() === 's.loadRef()') {
      init.replaceWithText(`loadSnakedCellOf(s, ${loadExpr})`)
    }
  } else {
    if (
      morph.Node.isConditionalExpression(init) &&
      init.getText() === 's.loadBoolean() ? s.loadRef() : null'
    ) {
      init.replaceWithText(`s.loadBoolean() ? loadSnakedCellOf(s, ${loadExpr}) : null`)
    }
  }
}

/** Get methods pass stack arguments directly; SnakedCell fields need re-wrapping into a cell. */
function transformSnakedStackBoundary(
  sourceFile: morph.SourceFile,
  allFields: Map<string, SnakedFieldInfo>,
): void {
  const rewraps: Array<{ prop: morph.Node; text: string }> = []

  for (const node of sourceFile.getDescendantsOfKind(morph.SyntaxKind.ObjectLiteralExpression)) {
    const typeProp = node.getProperty('type')
    const cellProp = node.getProperty('cell')
    if (
      !typeProp ||
      !cellProp ||
      !morph.Node.isPropertyAssignment(typeProp) ||
      !morph.Node.isPropertyAssignment(cellProp)
    ) {
      continue
    }
    if (typeProp.getInitializer()?.getText() !== "'cell'") continue

    const cellInit = cellProp.getInitializer()
    if (!cellInit || !morph.Node.isPropertyAccessExpression(cellInit)) continue

    const field = cellInit.getName()
    const info = allFields.get(field)
    if (!info) continue

    const objText = cellInit.getExpression().getText()
    const storeExpr = snakeStoreExpr(info.itemType)
    rewraps.push({
      prop: cellProp,
      text: `makeCellFrom<SnakedCell<${info.itemType}>>(${objText}.${field}, (v,b) => storeSnakedCellOf(v, b, ${storeExpr}))`,
    })
  }

  for (const { prop, text } of rewraps) {
    if (morph.Node.isPropertyAssignment(prop)) prop.setInitializer(text)
  }
}

export default function unwrapSnakedCell(sourceFile: morph.SourceFile): void {
  const typeAlias = sourceFile.getTypeAlias('SnakedCell')
  if (!typeAlias) return

  typeAlias.getTypeNode()?.replaceWithText('T[]')
  sourceFile.insertText(typeAlias.getEnd(), SNAKED_HELPERS)

  const blocks = common.getStructBlocks(sourceFile)
  const allSnakedFields = new Map<string, SnakedFieldInfo>()

  for (const block of blocks) {
    const fields = getSnakedFields(block.objectLiteral)
    for (const [field, info] of fields) {
      transformSnakedStore(block.objectLiteral, field, info)
      transformSnakedLoad(block.objectLiteral, field, info)
      allSnakedFields.set(field, info)
    }
  }

  transformSnakedStackBoundary(sourceFile, allSnakedFields)
}
