import { Address, toNano } from '@ton/core'
import { compile, NetworkProvider } from '@ton/blueprint'
import { Receiver, ReceiverBehavior } from '../wrappers/examples/Receiver'
import { generateRandomContractId } from '../src/utils'
import { loadContractCode } from '../wrappers/codeLoader'
import { TickerReceiver } from '../wrappers/examples/TickerReceiver'

export async function run(provider: NetworkProvider, args: string[]) {
  const [routerRaw] = args

  if (!routerRaw) {
    throw new Error(
      'Usage: yarn blueprint run deployReceiver --<network> --mnemonic <routerAddress>',
    )
  }

  const routerAddress = Address.parse(routerRaw)

  const receiverAddress = await deployTickerReceiver(provider, routerAddress)

  console.log('✅ Receiver deployed at:', receiverAddress.toString())
}

export async function deployTickerReceiver(
  provider: NetworkProvider,
  routerAddress: Address,
): Promise<Address> {
  const deployer = provider.sender().address!
  const receiver = provider.open(
    TickerReceiver.createFromConfig(
      {
        id: generateRandomContractId(),
        router: routerAddress,
      },
      await loadContractCode('examples.TickerReceiver'),
    ),
  )
  await receiver.sendDeploy(provider.sender(), toNano('0.5'))
  await provider.waitForDeploy(receiver.address)
  return receiver.address
}
