import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pools/lockbox/JettonLockbox.tolk',
  withStackComments: true,
}
