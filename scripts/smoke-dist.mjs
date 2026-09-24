import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const require = createRequire(import.meta.url)

let failed = false
for (const subpath of Object.keys(pkg.exports)) {
  const specifier = pkg.name + subpath.slice(1)
  try {
    const viaImport = await import(specifier)
    const viaRequire = require(specifier)
    const n = Object.keys(viaImport).length
    if (n === 0) throw new Error('no exports')
    if (viaRequire !== viaImport) throw new Error('require() and import() returned different module instances')
    console.log(`ok   ${specifier} (${n} exports)`)
  } catch (e) {
    failed = true
    console.log(`FAIL ${specifier}: ${e.code ?? String(e.message).split('\n')[0]}`)
  }
}
process.exit(failed ? 1 : 0)
