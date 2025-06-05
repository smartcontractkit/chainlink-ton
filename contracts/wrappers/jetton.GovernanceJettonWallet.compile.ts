import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/jettons/governance/jetton-wallet.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
