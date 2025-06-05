import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/jetton/governance/jetton-wallet.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
