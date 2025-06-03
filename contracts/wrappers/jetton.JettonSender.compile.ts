import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/jettons/send-jettons/sender.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
