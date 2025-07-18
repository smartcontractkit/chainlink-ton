import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/test/examples/async-communication/request-reply/price_registry.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
