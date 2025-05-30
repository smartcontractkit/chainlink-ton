import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/async-communication/request-reply/price_registry.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
