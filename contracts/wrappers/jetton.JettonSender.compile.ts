import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/jetton/sender.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
