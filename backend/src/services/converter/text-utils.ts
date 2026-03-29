export function splitPlainTextLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/\x00/g, ''))
}

export function convertHtmlToLines(html: string): string[] {
  const { htmlToText } = require('html-to-text')

  const text = htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'script', format: 'skip' },
      { selector: 'style', format: 'skip' },
      { selector: 'link', format: 'skip' },
      { selector: 'a', format: 'skip' },
      { selector: 'img', format: 'skip' },
      { selector: 'svg', format: 'skip' },
      { selector: 'audio', format: 'skip' },
      { selector: 'video', format: 'skip' },
      { selector: 'nav', format: 'skip' },
      { selector: 'div', format: 'block' },
      { selector: 'p', format: 'block' },
      { selector: 'entry', format: 'block' },
      { selector: 'hwg', format: 'block' },
      { selector: 'def', format: 'block' },
      { selector: 'column', format: 'block' },
      { selector: 'section', format: 'block' },
      { selector: 'article', format: 'block' },
      { selector: 'blockquote', format: 'block' },
      { selector: 'li', format: 'block' },
      { selector: 'h1', format: 'block' },
      { selector: 'h2', format: 'block' },
      { selector: 'h3', format: 'block' },
      { selector: 'h4', format: 'block' },
      { selector: 'h5', format: 'block' },
      { selector: 'h6', format: 'block' },
      { selector: 'span', format: 'inline' },
      { selector: 'sup', format: 'inline' },
      { selector: 'small', format: 'inline' },
      { selector: 'ex', format: 'inline' },
      { selector: 'note', format: 'inline' },
      { selector: 'num', format: 'inline' },
      { selector: 'ps', format: 'inline' },
      { selector: 'pinyin', format: 'inline' },
      {
        selector: 'hw',
        format: 'inline',
        options: {
          trailingLineBreaks: 0,
        },
      },
      {
        selector: 'pinyin',
        format: 'inline',
        options: {
          leadingLineBreaks: 0,
        },
      },
      { selector: 'ci', format: 'skip' },
      { selector: 'cont', format: 'skip' },
      { selector: 'br', format: 'inline' },
    ],
    preserveNewlines: true,
  })

  return splitPlainTextLines(text)
}
