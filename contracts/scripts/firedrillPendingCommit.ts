import { Address, toNano } from '@ton/core'
import { NetworkProvider } from '@ton/blueprint'
import { FiredrillEntrypoint } from '../wrappers/firedrill/FiredrillEntrypoint'

export async function run(provider: NetworkProvider) {
  // Get entrypoint address from user
  const entrypointAddressStr = await provider.ui().input('Enter Entrypoint contract address:')

  if (!entrypointAddressStr) {
    throw new Error('Entrypoint address is required')
  }

  const entrypointAddress = Address.parse(entrypointAddressStr)

  // Get sender info
  const sender = provider.sender()
  const senderAddress = sender.address
  if (!senderAddress) {
    throw new Error('Sender address not available')
  }

  console.log(`\n🔑 Sender address: ${senderAddress.toString()}`)

  // Open entrypoint contract
  const entrypoint = provider.open(FiredrillEntrypoint.createFromAddress(entrypointAddress))

  // Verify sender is owner
  const owner = await entrypoint.getOwner()
  if (!owner.equals(senderAddress)) {
    throw new Error(
      `Sender is not the owner. Owner: ${owner.toString()}, Sender: ${senderAddress.toString()}`,
    )
  }
  console.log('✅ Sender verified as owner\n')

  // Get ramp addresses from entrypoint
  const onRampAddress = await entrypoint.getOnRampAddress()
  const chainSelector = await entrypoint.getChainSelector()
  console.log(`📍 OnRamp: ${onRampAddress.toString()}\n`)

  // Get drill parameters
  const fromSeqStr = await provider.ui().input('Enter starting sequence number (e.g., 1):')
  const toSeqStr = await provider.ui().input('Enter ending sequence number (e.g., 10):')

  const fromSeq = BigInt(fromSeqStr)
  const toSeq = BigInt(toSeqStr)

  if (fromSeq > toSeq) {
    throw new Error(`Invalid range: from (${fromSeq}) must be <= to (${toSeq})`)
  }

  console.log(`\n🚀 Sending drill pending commit (sequence ${fromSeq} to ${toSeq})...\n`)

  await entrypoint.sendDrillPendingCommitPendingQueueTxSpike(sender, {
    value: toNano('1.0'),
    from: fromSeq,
    to: toSeq,
  })

  await new Promise((resolve) => setTimeout(resolve, 3000))

  console.log('\n📋 Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Entrypoint:     ${entrypointAddress.toString()}`)
  console.log(`OnRamp:         ${onRampAddress.toString()}`)
  console.log(`Chain Selector: ${chainSelector}`)
  console.log(`Sequence Range: ${fromSeq} - ${toSeq}`)
  console.log(`Messages Sent:  ${toSeq - fromSeq + 1n}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  console.log('\n✅ Drill pending commit completed!')
}
