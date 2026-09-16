import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pools/burn_mint/contract.tolk',
  withStackComments: true,
}
