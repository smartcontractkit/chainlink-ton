import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/jettons/receiver.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
