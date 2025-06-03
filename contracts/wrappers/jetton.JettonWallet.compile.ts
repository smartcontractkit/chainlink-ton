import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/jettons/impl/basic/jetton-wallet.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
