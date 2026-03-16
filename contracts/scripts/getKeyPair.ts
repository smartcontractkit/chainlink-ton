import { mnemonicToPrivateKey, mnemonicToWalletKey } from '@ton/crypto'
import { WalletContractV5R1 } from '@ton/ton'

const args = process.argv.slice(2)
run(args)
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

export async function run(args: string[]) {
  if (args.length != 1 && args.length != 12 && args.length != 24) {
    throw new Error('Usage: yarn run getKeyPair <mnemonic>')
  }

  const mnemonicArray = args.length == 1 ? args[0].split(' ') : args

  // derive private and public keys from the mnemonic
  const keyPair = await mnemonicToPrivateKey(mnemonicArray)
  const walletKey = await mnemonicToWalletKey(mnemonicArray)
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: walletKey.publicKey })

  console.log('Public Key: ' + keyPair.publicKey.toString('hex'))
  console.log('Private Key: ' + keyPair.secretKey.toString('hex'))
  console.log('Wallet Version: V5R1')
  console.log('Wallet Address: ' + wallet.address.toString())
}
