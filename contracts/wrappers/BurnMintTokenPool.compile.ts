import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/pool/burn_mint_token_pool/contract.tolk',
  withStackComments: true,
}