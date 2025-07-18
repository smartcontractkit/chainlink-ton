import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/test/mocks/fee_quoter.tolk',
  withStackComments: true,
}
