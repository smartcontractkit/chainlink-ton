import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pools/lock_release_lockbox/contract.tolk',
  withStackComments: true,
}
