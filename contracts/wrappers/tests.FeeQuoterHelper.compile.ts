import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/test/fee_quoter_helper/contract.tolk',
  withStackComments: true,
}
