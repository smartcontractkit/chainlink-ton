import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/async-communication/request-reply/storage.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
