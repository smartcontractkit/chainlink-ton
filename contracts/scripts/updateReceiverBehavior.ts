import { Address, toNano } from '@ton/core'
import { NetworkProvider } from '@ton/blueprint'
import { Receiver, ReceiverBehavior } from '../wrappers/ccip/Receiver'

export async function run(provider: NetworkProvider, args: string[]) {
  const [receiverRaw, behaviorRaw] = args

  if (!receiverRaw || !behaviorRaw) {
    throw new Error(
      'Usage: yarn blueprint run updateReceiverBehavior --<network> --mnemonic <receiverAddress> <behavior>',
    )
  }

  const receiver = Address.parse(receiverRaw)

  // Map string -> enum value
  const behavior = (ReceiverBehavior as any)[behaviorRaw as keyof typeof ReceiverBehavior]

  if (behavior === undefined) {
    throw new Error(
      `Unknown behavior "${behaviorRaw}". Valid values: ${Object.keys(ReceiverBehavior).join(', ')}`,
    )
  }

  await updateReceiverBehavior(provider, receiver, behavior)

  console.log(`✅ Updated receiver ${receiver.toString()} behavior to ${behaviorRaw}`)
}

async function updateReceiverBehavior(
  provider: NetworkProvider,
  receiver: Address,
  behavior: ReceiverBehavior,
) {
  const receiverContract = provider.open(Receiver.createFromAddress(receiver))
  await receiverContract.sendUpdateBehavior(provider.sender(), toNano('0.05'), { behavior })
}
