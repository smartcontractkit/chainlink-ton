// ---------------------------------------------------------------------------
//   AST-based post-processing of acton's generated TypeScript wrappers
//
//   acton (the Tolk toolchain) generates a fairly ergonomic-hostile TS API
//   for a few recurring patterns. These transforms rewrite the generated
//   output, using the TypeScript AST (via ts-morph) rather than regexes, so
//   struct-scoping and nesting are handled by a real parser instead of
//   brittle brace/line matching.
// ---------------------------------------------------------------------------

import {
  MethodDeclaration,
  Node,
  ObjectLiteralExpression,
  SourceFile,
  SyntaxKind,
  TypeNode,
} from 'ts-morph'

// ---------------------------------------------------------------------------
//   shared struct-block helpers
// ---------------------------------------------------------------------------

interface StructBlock {
  name: string
  objectLiteral: ObjectLiteralExpression
}

/** Object-literal methods (`create(...) {}`) aren't exposed via a `getMethod` lookup. */
function getObjectMethod(
  obj: ObjectLiteralExpression,
  name: string,
): MethodDeclaration | undefined {
  const prop = obj.getProperty(name)
  return prop && Node.isMethodDeclaration(prop) ? prop : undefined
}

/** Find every `export const StructName = { create(...), ... }` block. Generic structs
 *  (e.g. `CellRef<T>`-carrying messages) only have `create`/`toCell`, no `fromSlice`/`store`. */
function getStructBlocks(sourceFile: SourceFile): StructBlock[] {
  const blocks: StructBlock[] = []
  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const nameNode = varDecl.getNameNode()
    if (!Node.isIdentifier(nameNode)) continue

    const init = varDecl.getInitializer()
    if (!init || !Node.isObjectLiteralExpression(init)) continue
    if (!getObjectMethod(init, 'create')) continue

    blocks.push({ name: nameNode.getText(), objectLiteral: init })
  }
  return blocks
}

/** Unwrap a `T | null` union, reporting whether it was nullable. */
function unwrapNullable(typeNode: TypeNode): { inner: TypeNode; nullable: boolean } {
  if (Node.isUnionTypeNode(typeNode)) {
    const nonNull = typeNode.getTypeNodes().filter((t) => t.getText() !== 'null')
    if (nonNull.length === 1) {
      return { inner: nonNull[0], nullable: true }
    }
  }
  return { inner: typeNode, nullable: false }
}

// ---------------------------------------------------------------------------
//   Errors block sorting
//
//   acton's internal hash map is unordered, so `static Errors = { ... }`
//   entries come out in platform-specific order. Sort by (value, key) for
//   cross-platform determinism (macOS vs Linux).
// ---------------------------------------------------------------------------

export function sortErrorsBlocks(sourceFile: SourceFile): void {
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
function getSnakedFields(block: ObjectLiteralExpression): Map<string, SnakedFieldInfo> {
  const fields = new Map<string, SnakedFieldInfo>()
  const createMethod = getObjectMethod(block, 'create')
  const typeNode = createMethod?.getParameters()[0]?.getTypeNode()
  if (!typeNode || !Node.isTypeLiteral(typeNode)) return fields

  for (const member of typeNode.getMembers()) {
    if (!Node.isPropertySignature(member)) continue
    const fieldType = member.getTypeNode()
    if (!fieldType) continue

    const { inner, nullable } = unwrapNullable(fieldType)
    if (!Node.isTypeReference(inner) || inner.getTypeName().getText() !== 'SnakedCell') continue

    const itemType = inner.getTypeArguments()[0]?.getText()
    if (itemType) fields.set(member.getName(), { itemType, nullable })
  }
  return fields
}

function transformSnakedStore(
  block: ObjectLiteralExpression,
  field: string,
  info: SnakedFieldInfo,
): void {
  const storeMethod = getObjectMethod(block, 'store')
  if (!storeMethod) return
  const storeExpr = snakeStoreExpr(info.itemType)

  for (const stmt of storeMethod.getStatements()) {
    if (!Node.isExpressionStatement(stmt)) continue
    const expr = stmt.getExpression()
    if (!Node.isCallExpression(expr)) continue

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
  block: ObjectLiteralExpression,
  field: string,
  info: SnakedFieldInfo,
): void {
  const fromSliceMethod = getObjectMethod(block, 'fromSlice')
  const returnStmt = fromSliceMethod?.getStatements().find(Node.isReturnStatement)
  const obj = returnStmt?.getExpression()
  if (!obj || !Node.isObjectLiteralExpression(obj)) return

  const prop = obj.getProperty(field)
  if (!prop || !Node.isPropertyAssignment(prop)) return
  const init = prop.getInitializer()
  if (!init) return
  const loadExpr = snakeLoadExpr(info.itemType)

  if (!info.nullable) {
    if (Node.isCallExpression(init) && init.getText() === 's.loadRef()') {
      init.replaceWithText(`loadSnakedCellOf(s, ${loadExpr})`)
    }
  } else {
    if (
      Node.isConditionalExpression(init) &&
      init.getText() === 's.loadBoolean() ? s.loadRef() : null'
    ) {
      init.replaceWithText(`s.loadBoolean() ? loadSnakedCellOf(s, ${loadExpr}) : null`)
    }
  }
}

/** Get methods pass stack arguments directly; SnakedCell fields need re-wrapping into a cell. */
function transformSnakedStackBoundary(
  sourceFile: SourceFile,
  allFields: Map<string, SnakedFieldInfo>,
): void {
  const rewraps: Array<{ prop: Node; text: string }> = []

  for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
    const typeProp = node.getProperty('type')
    const cellProp = node.getProperty('cell')
    if (
      !typeProp ||
      !cellProp ||
      !Node.isPropertyAssignment(typeProp) ||
      !Node.isPropertyAssignment(cellProp)
    ) {
      continue
    }
    if (typeProp.getInitializer()?.getText() !== "'cell'") continue

    const cellInit = cellProp.getInitializer()
    if (!cellInit || !Node.isPropertyAccessExpression(cellInit)) continue

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
    if (Node.isPropertyAssignment(prop)) prop.setInitializer(text)
  }
}

export function transformSnakedCell(sourceFile: SourceFile): void {
  const typeAlias = sourceFile.getTypeAlias('SnakedCell')
  if (!typeAlias) return

  typeAlias.getTypeNode()?.replaceWithText('T[]')
  sourceFile.insertText(typeAlias.getEnd(), SNAKED_HELPERS)

  const blocks = getStructBlocks(sourceFile)
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

// ---------------------------------------------------------------------------
//   CellRef<T> ergonomic transform
//
//   acton generates `type CellRef<T> = { ref: T }`, leaking serialization
//   details into the API. This rewrites the generated output so that fields
//   typed as `CellRef<T>` become just `T`, and the store/load functions
//   handle the cell-ref wrapping internally.
// ---------------------------------------------------------------------------

function transformStoreCellRefHelper(sourceFile: SourceFile): void {
  const fn = sourceFile.getFunction('storeCellRef')
  if (!fn) return
  const param = fn.getParameters()[0]
  if (!param || param.getName() !== 'cell') return

  param.rename('value')
  param.getTypeNode()?.replaceWithText('T')
}

function transformLoadCellRefHelper(sourceFile: SourceFile): void {
  const fn = sourceFile.getFunction('loadCellRef')
  if (!fn) return

  fn.getReturnTypeNode()?.replaceWithText('T')
  const returnStmt = fn.getStatements().find(Node.isReturnStatement)
  const expr = returnStmt?.getExpression()
  if (!expr || !Node.isObjectLiteralExpression(expr)) return

  const [prop] = expr.getProperties()
  if (prop && Node.isPropertyAssignment(prop) && prop.getName() === 'ref') {
    returnStmt!.replaceWithText(`return ${prop.getInitializer()!.getText()};`)
  }
}

function transformReadCellRefMethod(sourceFile: SourceFile): void {
  for (const cls of sourceFile.getClasses()) {
    const method = cls.getInstanceMethod('readCellRef')
    if (!method) continue

    method.getReturnTypeNode()?.replaceWithText('T')
    const returnStmt = method.getStatements().find(Node.isReturnStatement)
    const expr = returnStmt?.getExpression()
    if (!expr || !Node.isObjectLiteralExpression(expr)) continue

    const [prop] = expr.getProperties()
    if (prop && Node.isPropertyAssignment(prop) && prop.getName() === 'ref') {
      returnStmt!.replaceWithText(`return ${prop.getInitializer()!.getText()};`)
    }
  }
}

/** Replace every remaining `CellRef<X>` type reference with `X`, one at a time (positions shift after each edit). */
function replaceCellRefTypeReferences(sourceFile: SourceFile): void {
  while (true) {
    const ref = sourceFile
      .getDescendantsOfKind(SyntaxKind.TypeReference)
      .find((t) => t.getTypeName().getText() === 'CellRef')
    if (!ref) break

    const arg = ref.getTypeArguments()[0]
    ref.replaceWithText(arg?.getText() ?? ref.getText())
  }
}

/** Strip `.ref` property accesses left over from values that used to be `CellRef<T>`. */
function removeRefPropertyAccesses(sourceFile: SourceFile): void {
  while (true) {
    const access = sourceFile
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .find((p) => p.getName() === 'ref')
    if (!access) break

    access.replaceWithText(access.getExpression().getText())
  }
}

export function transformCellRef(sourceFile: SourceFile): void {
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
function removeCellRefTypeAlias(sourceFile: SourceFile): void {
  const typeAlias = sourceFile.getTypeAlias('CellRef')
  if (!typeAlias) return

  const start = typeAlias.getStart()
  let end = typeAlias.getEnd()
  if (sourceFile.getFullText()[end] === '\n') end += 1

  sourceFile.replaceText([start, end], '')
}

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

function isInsideInterface(node: Node): boolean {
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    if (Node.isInterfaceDeclaration(parent)) return true
  }
  return false
}

function makeQueryIdFieldsOptional(sourceFile: SourceFile): void {
  const signatures = sourceFile.getDescendantsOfKind(SyntaxKind.PropertySignature).filter((sig) => {
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
function addQueryIdCreateDefaults(sourceFile: SourceFile): void {
  for (const block of getStructBlocks(sourceFile)) {
    const createMethod = getObjectMethod(block.objectLiteral, 'create')
    const typeNode = createMethod?.getParameters()[0]?.getTypeNode()
    if (!typeNode || !Node.isTypeLiteral(typeNode)) continue

    const field = typeNode
      .getMembers()
      .find((m) => Node.isPropertySignature(m) && QUERY_ID_NAMES.has(m.getName()))
    if (!field || !Node.isPropertySignature(field)) continue
    const fieldName = field.getName()

    const returnStmt = createMethod!.getStatements().find(Node.isReturnStatement)
    const obj = returnStmt?.getExpression()
    if (!obj || !Node.isObjectLiteralExpression(obj)) continue
    if (obj.getProperty(fieldName)) continue

    const hasSpreadArgs = obj
      .getProperties()
      .some((p) => Node.isSpreadAssignment(p) && p.getExpression().getText() === 'args')
    if (!hasSpreadArgs) continue

    obj.addPropertyAssignment({ name: fieldName, initializer: `args.${fieldName} ?? 0n` })
  }
}

/** Default omitted query IDs when get-method args are pushed onto the stack. */
function addQueryIdStackDefaults(sourceFile: SourceFile): void {
  const accesses = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((p) => QUERY_ID_NAMES.has(p.getName()) && p.getExpression().getText() === 'msg')
    .filter((p) => {
      const parent = p.getParent()
      return Node.isPropertyAssignment(parent) && parent.getName() === 'value'
    })

  for (const access of accesses) {
    access.replaceWithText(`msg.${access.getName()} ?? 0n`)
  }
}

export function transformQueryId(sourceFile: SourceFile): void {
  const text = sourceFile.getFullText()
  if (!text.includes('queryId') && !text.includes('queryID')) return

  makeQueryIdFieldsOptional(sourceFile)
  addQueryIdCreateDefaults(sourceFile)
  addQueryIdStackDefaults(sourceFile)
}

// ---------------------------------------------------------------------------
//   map<K, V> / map<K, ()> ergonomic transform
//
//   acton represents a `map<K, V>` struct/message field as @ton/core's
//   `Dictionary<K, V>`, forcing every caller to build an empty Dictionary by
//   hand (picking the matching key/value serializers) before it can be
//   populated. This rewrites the generated output so those fields are plain
//   `Map<K, V>` instead: the generated store()/fromSlice()/getter code
//   converts to/from a Dictionary internally.
//
//   `map<K, ()>` fields (value is the empty tensor, used where only key
//   presence matters) become `Set<K>` instead — a `Map<K, []>` would still
//   force every caller to invent a throwaway `[]` value per key, so a `Set`
//   is the more faithful, more ergonomic fit.
// ---------------------------------------------------------------------------

const MAP_HELPERS = `

function dictToMap<K extends c.DictionaryKeyTypes, V>(d: c.Dictionary<K, V>): Map<K, V> {
    const map = new Map<K, V>();
    for (const [k, v] of d) {
        map.set(k, v);
    }
    return map;
}

function mapToDict<K extends c.DictionaryKeyTypes, V>(m: Map<K, V>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<V>): c.Dictionary<K, V> {
    const d = c.Dictionary.empty<K, V>(keySerializer, valueSerializer);
    for (const [k, v] of m) {
        d.set(k, v);
    }
    return d;
}
`

const SET_HELPERS = `

function dictToSet<K extends c.DictionaryKeyTypes>(d: c.Dictionary<K, []>): Set<K> {
    const set = new Set<K>();
    for (const k of d.keys()) {
        set.add(k);
    }
    return set;
}

function setToDict<K extends c.DictionaryKeyTypes>(s: Set<K>, keySerializer: c.DictionaryKey<K>, valueSerializer: c.DictionaryValue<[]>): c.Dictionary<K, []> {
    const d = c.Dictionary.empty<K, []>(keySerializer, valueSerializer);
    for (const k of s) {
        d.set(k, []);
    }
    return d;
}
`

function isMapTypeArgs(typeArgs: TypeNode[]): boolean {
  return typeArgs.length === 2 && typeArgs[1].getText() !== '[]'
}

function isSetTypeArgs(typeArgs: TypeNode[]): boolean {
  return typeArgs.length === 2 && typeArgs[1].getText() === '[]'
}

/** True if a `c.Dictionary<K, V>` reference is the generic infra return type of a
 *  `readDictionary<K, V>`-shaped helper (its type arguments are just its own
 *  declaration's type parameters), rather than a concrete field's type. */
function isGenericDictionaryPassthrough(ref: Node, keyText: string, valueText: string): boolean {
  for (let owner: Node | undefined = ref; owner; owner = owner.getParent()) {
    if (Node.isMethodDeclaration(owner) || Node.isFunctionDeclaration(owner)) {
      const typeParamNames = owner.getTypeParameters().map((tp) => tp.getName())
      return typeParamNames.includes(keyText) && typeParamNames.includes(valueText)
    }
  }
  return false
}

function transformDictionaryLoadCalls(
  sourceFile: SourceFile,
  isMatch: (typeArgs: TypeNode[]) => boolean,
  wrapperFn: string,
): void {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression()
    if (!Node.isPropertyAccessExpression(expr)) return false
    const name = expr.getName()
    if (name === 'load' && expr.getExpression().getText() !== 'c.Dictionary') return false
    if (name !== 'load' && name !== 'readDictionary') return false
    return isMatch(call.getTypeArguments())
  })

  for (const call of calls) {
    call.replaceWithText(`${wrapperFn}(${call.getText()})`)
  }
}

function transformDictionaryStoreCalls(
  sourceFile: SourceFile,
  isMatch: (typeArgs: TypeNode[]) => boolean,
  wrapperFn: string,
): void {
  const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression()
    if (!Node.isPropertyAccessExpression(expr) || expr.getName() !== 'storeDict') return false
    return isMatch(call.getTypeArguments())
  })

  for (const call of calls) {
    const [collectionArg, keysArg, valueArg] = call.getArguments()
    if (!collectionArg || !keysArg || !valueArg) continue
    collectionArg.replaceWithText(
      `${wrapperFn}(${collectionArg.getText()}, ${keysArg.getText()}, ${valueArg.getText()})`,
    )
  }
}

function replaceDictionaryTypeReferences(
  sourceFile: SourceFile,
  isMatch: (typeArgs: TypeNode[]) => boolean,
  toTypeText: (keyText: string, valueText: string) => string,
): boolean {
  let changed = false
  while (true) {
    const ref = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference).find((t) => {
      if (t.getTypeName().getText() !== 'c.Dictionary') return false
      const args = t.getTypeArguments()
      if (!isMatch(args)) return false
      return !isGenericDictionaryPassthrough(t, args[0].getText(), args[1].getText())
    })
    if (!ref) break

    const args = ref.getTypeArguments()
    ref.replaceWithText(toTypeText(args[0].getText(), args[1].getText()))
    changed = true
  }
  return changed
}

export function transformDictionaryMaps(sourceFile: SourceFile): void {
  transformDictionaryLoadCalls(sourceFile, isMapTypeArgs, 'dictToMap')
  transformDictionaryStoreCalls(sourceFile, isMapTypeArgs, 'mapToDict')
  transformDictionaryLoadCalls(sourceFile, isSetTypeArgs, 'dictToSet')
  transformDictionaryStoreCalls(sourceFile, isSetTypeArgs, 'setToDict')

  const changedMaps = replaceDictionaryTypeReferences(
    sourceFile,
    isMapTypeArgs,
    (key, value) => `Map<${key}, ${value}>`,
  )
  const changedSets = replaceDictionaryTypeReferences(
    sourceFile,
    isSetTypeArgs,
    (key) => `Set<${key}>`,
  )
  if (!changedMaps && !changedSets) return

  const anchor = sourceFile.getFunction('loadCellRef')
  if (!anchor) return
  sourceFile.insertText(
    anchor.getEnd(),
    (changedMaps ? MAP_HELPERS : '') + (changedSets ? SET_HELPERS : ''),
  )
}
