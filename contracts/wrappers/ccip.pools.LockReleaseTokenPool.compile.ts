import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pools/lock_release_token_pool/contract.tolk',
  withStackComments: true,
}
