const assert = require('node:assert/strict')
const { readFileSync, statSync } = require('node:fs')
const { extname } = require('node:path')
const { fileURLToPath, pathToFileURL } = require('node:url')

const distUrl = new URL('../dist/', pathToFileURL(__filename))
const indexUrl = new URL('index.html', distUrl)
const html = readFileSync(indexUrl, 'utf8')
const assetExtensions = new Set()
let checkedAssets = 0

// Check the emitted HTML using the same file:// resolution as loadFile().
// Remote resources (such as Google Fonts) are unrelated to packaged assets.
for (const [, assetPath] of html.matchAll(
  /\b(?:src|href)=["']([^"']+)["']/gi,
)) {
  if (/^https?:\/\//i.test(assetPath)) continue

  assert(
    !assetPath.startsWith('/') && !/^[a-z][a-z\d+.-]*:/i.test(assetPath),
    `Electron asset must use a relative path: ${assetPath}`,
  )

  const assetUrl = new URL(assetPath, indexUrl)
  assert(
    assetUrl.href.startsWith(distUrl.href),
    `Electron asset resolves outside dist: ${assetPath}`,
  )
  assert(
    statSync(assetUrl).isFile(),
    `Electron asset is not a file: ${assetPath}`,
  )

  assetExtensions.add(extname(fileURLToPath(assetUrl)))
  checkedAssets += 1
}

// Avoid passing on an empty or incomplete entry point.
assert(
  assetExtensions.has('.js'),
  'No local JavaScript found in dist/index.html',
)
assert(
  assetExtensions.has('.css'),
  'No local stylesheet found in dist/index.html',
)

process.stdout.write(
  `[check-electron-assets] ${checkedAssets} local assets resolve inside dist\n`,
)
