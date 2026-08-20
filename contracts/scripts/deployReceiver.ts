import { Address, toNano } from '@ton/core'
import { compile, NetworkProvider } from '@ton/blueprint'
import * as tr from '../wrappers/gen/ccip/TestReceiver'
import { generateRandomContractId } from '../src/utils'

export async function run(provider: NetworkProvider, args: string[]) {
  const [routerRaw] = args

  if (!routerRaw) {
    throw new Error(
      'Usage: yarn blueprint run deployReceiver --<network> --mnemonic <routerAddress>',
    )
  }

  const routerAddress = Address.parse(routerRaw)

  const receiverAddress = await deployReceiver(provider, routerAddress)

  console.log('✅ Receiver deployed at:', receiverAddress.toString())
}

export async function deployReceiver(
  provider: NetworkProvider,
  routerAddress: Address,
): Promise<Address> {
  const deployer = provider.sender().address!
  const receiver = provider.open(
    tr.TestReceiver.fromStorage(
      {
        id: generateRandomContractId(),
        behavior: tr.TestReceiver_Behavior.RejectAll,
        ownable: tr.Ownable2Step.create({ owner: deployer }),
        authorizedCaller: routerAddress,
      },
      { overrideContractCode: await compile('ccip.test.receiver') },
    ),
  )

  await receiver.sendDeploy(provider.sender(), toNano('0.5'))
  await provider.waitForDeploy(receiver.address)
  return receiver.address
}
