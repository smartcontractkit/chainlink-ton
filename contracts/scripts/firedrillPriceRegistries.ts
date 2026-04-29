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

  // Get chain selector from entrypoint
  const chainSelector = await entrypoint.getChainSelector()

  console.log('🚀 Sending drill price registries...\n')

  await entrypoint.sendDrillPriceRegistries(sender, toNano('0.5'))

  await new Promise((resolve) => setTimeout(resolve, 3000))

  console.log('\n📋 Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Entrypoint:     ${entrypointAddress.toString()}`)
  console.log(`Chain Selector: ${chainSelector}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  console.log('\n✅ Drill price registries completed!')
}
