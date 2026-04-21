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
  if (args.length < 1) {
    throw new Error('Usage: yarn run getKeyPair --testnet|--mainnet <mnemonic>')
  }
  const chain = args[0]
  if (chain !== '--testnet' && chain !== '--mainnet') {
    throw new Error('Usage: yarn run getKeyPair --testnet|--mainnet <mnemonic>')
  }
  const mnemonic = args.slice(1)
  if (mnemonic.length != 1 && mnemonic.length != 12 && mnemonic.length != 24) {
    throw new Error('Usage: yarn run getKeyPair --testnet|--mainnet <mnemonic>')
  }

  const mnemonicArray = mnemonic.length == 1 ? mnemonic[0].split(' ') : mnemonic

  // derive private and public keys from the mnemonic
  const keyPair = await mnemonicToPrivateKey(mnemonicArray)
  const walletKey = await mnemonicToWalletKey(mnemonicArray)
  const wallet = WalletContractV5R1.create({
    workchain: 0,
    publicKey: walletKey.publicKey,
    walletId: {
      // -239 is mainnet, -3 is testnet
      networkGlobalId: chain === '--mainnet' ? -239 : -3,
      context: 0,
    },
  })

  console.log('Public Key: ' + keyPair.publicKey.toString('hex'))
  console.log('Private Key: ' + keyPair.secretKey.toString('hex'))
  console.log('Wallet Version: V5R1')
  console.log('Wallet Address: ' + wallet.address.toString())
}
