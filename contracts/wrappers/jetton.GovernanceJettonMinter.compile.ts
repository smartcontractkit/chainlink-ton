import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/jettons/governance/jetton-minter.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
