// ---------------------------------------------------------------------------
//   Lisp-list wire-format correction
//
// Acton emits list cells with the element ref before the tail ref. Tolk's
// lisp_list.packToBuilder format (and Acton's generated decoder) use the
// opposite order: ref[0] is the tail and ref[1] is the element. The mismatch
// is invisible for empty lists but corrupts non-empty and nested lists.
// ---------------------------------------------------------------------------

import * as morph from 'ts-morph'

export default function transformLispListStore(sourceFile: morph.SourceFile): void {
  const fn = sourceFile.getFunction('storeLispListOf')
  if (!fn) return

  fn.setBodyText(`
    let tail = c.Cell.EMPTY;
    for (let i = 0; i < v.length; ++i) {
        let itemB = beginCell();
        itemB.storeRef(tail);
        storeFn_T(v[i], itemB);
        tail = itemB.endCell();
    }
    b.storeRef(tail);
  `)
}
