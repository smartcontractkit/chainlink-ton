import { Address, toNano } from '@ton/core'
import { NetworkProvider } from '@ton/blueprint'
import * as tr from '../wrappers/gen/ccip/TestReceiver'

export async function run(provider: NetworkProvider, args: string[]) {
  const [receiverRaw, behaviorRaw] = args

  if (!receiverRaw || !behaviorRaw) {
    throw new Error(
      'Usage: yarn blueprint run updateReceiverBehavior --<network> --mnemonic <receiverAddress> <behavior>',
    )
  }

  const receiver = Address.parse(receiverRaw)

  // Map string -> enum value
  const behavior = (tr.TestReceiver_Behavior as any)[
    behaviorRaw as keyof typeof tr.TestReceiver_Behavior
  ]

  if (behavior === undefined) {
    throw new Error(
      `Unknown behavior "${behaviorRaw}". Valid values: ${Object.keys(tr.TestReceiver_Behavior).join(', ')}`,
    )
  }

  await updateReceiverBehavior(provider, receiver, behavior)

  console.log(`✅ Updated receiver ${receiver.toString()} behavior to ${behaviorRaw}`)
}

async function updateReceiverBehavior(
  provider: NetworkProvider,
  receiver: Address,
  behavior: tr.TestReceiver_Behavior,
) {
  const receiverContract = provider.open(tr.TestReceiver.fromAddress(receiver))
  await receiverContract.sendTestReceiverUpdateBehavior(provider.sender(), toNano('0.05'), {
    behavior,
  })
}
