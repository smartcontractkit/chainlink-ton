import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/wton/JettonMinter.tolk',
  withStackComments: true,
}
