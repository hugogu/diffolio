// services/converter/index.ts

import { registry, ConverterRegistry } from './registry.js'
import { MdxToTxtConverter } from './mdx-to-txt.js'
import { MdxToDocxConverter } from './mdx-to-docx.js'

let defaultConvertersRegistered = false

export function ensureDefaultConvertersRegistered(): void {
  if (defaultConvertersRegistered) {
    return
  }

  registry.register(new MdxToTxtConverter())
  registry.register(new MdxToDocxConverter())
  defaultConvertersRegistered = true
}

export { registry, ConverterRegistry }
export type { Converter, ConvertOptions, ConversionResult } from './types.js'
export { MdxToTxtConverter } from './mdx-to-txt.js'
export { MdxToDocxConverter } from './mdx-to-docx.js'
