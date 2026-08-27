import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pools/lockbox/JettonLockBox.tolk',
  withStackComments: true,
}
