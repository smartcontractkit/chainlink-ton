import * as morph from 'ts-morph'

// ---------------------------------------------------------------------------
//   embedded code cell removal
//
//   acton embeds each contract's compiled bytecode in the wrapper as
//   `static CodeCell = c.Cell.fromBase64('...')`, and `fromStorage()` falls
//   back to it when no code override is given. That leaves every wrapper
//   carrying a stale copy of the bytecode, which silently diverges from
//   build/ after a contract change. Drop the embedded cell and require callers
//   to pass the code explicitly: `fromStorage()` throws when
//   `overrideContractCode` is missing.
// ---------------------------------------------------------------------------

export default function removeCodeCell(sourceFile: morph.SourceFile): void {
  for (const cls of sourceFile.getClasses()) {
    const codeCell = cls.getStaticProperty('CodeCell')
    if (!codeCell) continue
    codeCell.remove()

    const fromStorage = cls.getStaticMethod('fromStorage')
    if (!fromStorage) continue

    const className = cls.getName() ?? 'Contract'
    fromStorage.insertStatements(
      0,
      `if (!deployedOptions?.overrideContractCode) {
    throw new Error('${className}.fromStorage requires deployedOptions.overrideContractCode');
}`,
    )

    for (const assignment of fromStorage.getDescendantsOfKind(
      morph.SyntaxKind.PropertyAssignment,
    )) {
      if (assignment.getName() !== 'code') continue
      if (!assignment.getInitializer()?.getText().includes('.CodeCell')) continue
      assignment.setInitializer('deployedOptions.overrideContractCode')
    }
  }
}
