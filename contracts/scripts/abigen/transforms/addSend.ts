import * as morph from 'ts-morph'

// ---------------------------------------------------------------------------
//   send(body: c.Cell) transform
//
//   add a `send(body: c.Cell)` method to the generated contract class, so
//   callers can send arbitrary cells without needing to wrap them in a message
//   struct.
// ---------------------------------------------------------------------------

export default function addSend(sourceFile: morph.SourceFile): void {
  // For every class that `implements c.Contract`, add a `send(body: c.Cell)` method if it doesn't already exist.
  for (const classDecl of sourceFile.getClasses()) {
    const implementsContract = classDecl.getImplements().some((impl) => {
      const type = impl.getExpression().getText()
      return type === 'c.Contract'
    })
    if (!implementsContract) continue

    const hasSendMethod = classDecl.getInstanceMethod('send') !== undefined
    if (hasSendMethod) continue

    // Insert after sendDeploy if it exists, otherwise at the end of the class.
    const sendDeployMethod = classDecl.getInstanceMethod('sendDeploy')
    const insertIndex = sendDeployMethod
      ? classDecl.getMembers().indexOf(sendDeployMethod) + 1
      : classDecl.getMembers().length

    classDecl.insertMethod(insertIndex, {
      name: 'send',
      parameters: [
        { name: 'provider', type: 'ContractProvider' },
        { name: 'via', type: 'Sender' },
        { name: 'msgValue', type: 'coins' },
        { name: 'body', type: 'c.Cell' },
        { name: 'extraOptions', type: 'ExtraSendOptions', hasQuestionToken: true },
      ],
      returnType: 'Promise<void>',
      statements: `return provider.internal(via, {
    value: msgValue,
    body,
    ...extraOptions
});`,
    })
  }
}
