// services/converter/index.ts

import { registry, ConverterRegistry } from './registry.js'
import { MdxToTxtConverter } from './mdx-to-txt.js'
import { MdxToDocxConverter } from './mdx-to-docx.js'
import { EpubToTxtConverter } from './epub-to-txt.js'
import { EpubToDocxConverter } from './epub-to-docx.js'

let defaultConvertersRegistered = false

export function ensureDefaultConvertersRegistered(): void {
  if (defaultConvertersRegistered) {
    return
  }

  registry.register(new MdxToTxtConverter())
  registry.register(new MdxToDocxConverter())
  registry.register(new EpubToTxtConverter())
  registry.register(new EpubToDocxConverter())
  defaultConvertersRegistered = true
}

export { registry, ConverterRegistry }
export type { Converter, ConvertOptions, ConversionResult } from './types.js'
export { MdxToTxtConverter } from './mdx-to-txt.js'
export { MdxToDocxConverter } from './mdx-to-docx.js'
export { EpubToTxtConverter } from './epub-to-txt.js'
export { EpubToDocxConverter } from './epub-to-docx.js'
