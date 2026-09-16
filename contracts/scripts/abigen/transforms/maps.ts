import * as morph from 'ts-morph'

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

function isMapTypeArgs(typeArgs: morph.TypeNode[]): boolean {
  return typeArgs.length === 2 && typeArgs[1].getText() !== '[]'
}

function isSetTypeArgs(typeArgs: morph.TypeNode[]): boolean {
  return typeArgs.length === 2 && typeArgs[1].getText() === '[]'
}

/** True if a `c.Dictionary<K, V>` reference is the generic infra return type of a
 *  `readDictionary<K, V>`-shaped helper (its type arguments are just its own
 *  declaration's type parameters), rather than a concrete field's type. */
function isGenericDictionaryPassthrough(
  ref: morph.Node,
  keyText: string,
  valueText: string,
): boolean {
  for (let owner: morph.Node | undefined = ref; owner; owner = owner.getParent()) {
    if (morph.Node.isMethodDeclaration(owner) || morph.Node.isFunctionDeclaration(owner)) {
      const typeParamNames = owner.getTypeParameters().map((tp) => tp.getName())
      return typeParamNames.includes(keyText) && typeParamNames.includes(valueText)
    }
  }
  return false
}

function transformDictionaryLoadCalls(
  sourceFile: morph.SourceFile,
  isMatch: (typeArgs: morph.TypeNode[]) => boolean,
  wrapperFn: string,
): void {
  const calls = sourceFile.getDescendantsOfKind(morph.SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression()
    if (!morph.Node.isPropertyAccessExpression(expr)) return false
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
  sourceFile: morph.SourceFile,
  isMatch: (typeArgs: morph.TypeNode[]) => boolean,
  wrapperFn: string,
): void {
  const calls = sourceFile.getDescendantsOfKind(morph.SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression()
    if (!morph.Node.isPropertyAccessExpression(expr) || expr.getName() !== 'storeDict') return false
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
  sourceFile: morph.SourceFile,
  isMatch: (typeArgs: morph.TypeNode[]) => boolean,
  toTypeText: (keyText: string, valueText: string) => string,
): boolean {
  let changed = false
  while (true) {
    const ref = sourceFile.getDescendantsOfKind(morph.SyntaxKind.TypeReference).find((t) => {
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

export default function transformDictionaryMaps(sourceFile: morph.SourceFile): void {
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
