#!/usr/bin/env node

const opentype = require('opentype.js')
const minimist = require("minimist")
const path = require('path')
const chalk = require('chalk')
const fs = require('fs')
const elapsed = require("elapsed-time-logger")
const http = require('http')
const https = require('https')

const defaultArgv = {
  font: './font.ttf',
  dir: process.cwd(),
  output: './font-pick'
}

const argv = minimist(process.argv.slice(2), {
  alias: {
    'string': 's',
    'font': 'f',
    'base': 'b',
    'dir': 'd',
    'output': 'o',
    'name': 'n',
  },
  string: ['font', 'base', 'string', 'dir', 'output', 'name'],
  default: defaultArgv,
})


const log = console.log
const bashChalk = chalk.hex('#c864c8')
const pathChalk = (p) => chalk.yellow(p)
const errorChalk = (msg) => log(chalk.red('❌ Failed to pick font:'), msg)


if(argv.help) {
  log(`${chalk.green('🗂️ Usage:')}`)
  log(`  ${bashChalk('fp --help')} // Print help information`)
  log(`  ${bashChalk('fp -s ')}${bashChalk.italic('0123')} // The string that needs to be picked`)
  log(`  ${bashChalk('fp -f ')}${bashChalk.italic('./font.ttf')} // Full font package path, the default option is ${defaultArgv.font}`)
  log(`  ${bashChalk('fp -b ')}${bashChalk.italic('./base.ttf')} // Basic font package path, new fonts will be based on this font package`)
  log(`  ${bashChalk('fp -d ')}${bashChalk.italic('./font')} // Directory where font packages are looked up and generated, the default option is the current working directory`)
  log(`  ${bashChalk('fp -o ')}${bashChalk.italic('./font-pick')} // Directory where the font package is generated,  the default option is ${defaultArgv.output}`)
  log(`  ${bashChalk('fp -n ')}${bashChalk.italic('font')} // The name of the generated font package, the default option is the basename of the font option`)
  process.exit(0)
} else if(!argv.string) {
  errorChalk(`Parameter [string] is required! Run "${bashChalk("fp --help")}" to learn more`)
  process.exit(-1)
}


function loadFontFromUrl(url) {
  return new Promise((resolve, reject) => {
    const {protocol, hostname, pathname, port} = new URL(url)
    const isHttps = protocol === "https:"

    const callback = function(res) {
      const chunks = []
      res.on('data', function(chunk) {
        chunks.push(chunk)
      })
      res.on('end', function() {
        const buffer = Buffer.concat(chunks)
        const font = opentype.parse(buffer.buffer)
        resolve(font)
      })
    }

    const ClientRequest = isHttps ? https.get({
      hostname,
      port,
      path: pathname,
      method: 'GET',
      rejectUnauthorized: false, // ignore certificate verification
    }, callback) : http.get(url, callback)
    
    ClientRequest.on('error', function(err) {
      reject(err)
    })

  })
}

const isPathUrl = s =>  /^http(s)?/.test(s)

function parsePath(p) {
  const names =  path.basename(p).split('.')
  const ext = names.pop()
  return {
    name: names.join('.'),
    ext
  }
}

async function pick() {
  try {
    const isFontPathUrl = isPathUrl(argv.font)
    const fontPath = isFontPathUrl ? argv.font : path.resolve(argv.dir, argv.font)
    const {name: fontName, ext} = parsePath(fontPath)

    const progressElapsedTimer = elapsed.start()
    // @TODO 封装成方法
    const loadFont = isFontPathUrl ? loadFontFromUrl : opentype.load
    log('fontPath:', pathChalk(argv.font))
    const font = await loadFont(fontPath)
    const stringGlyphs =  font.stringToGlyphs(argv.string)
    console.log(111, stringGlyphs)

    const create = (glyphs = []) => {
      const pickedFont = new opentype.Font({
        familyName: font.names.fontFamily.en,
        styleName: font.names.fontSubfamily.en,
        unitsPerEm: 1000,
        ascender: 800,
        descender: -200,
        glyphs
      })

      const outputDir = path.resolve(argv.dir, argv.output)
      const outputBaseName = `${argv.name || fontName}.${ext}`
      const outputPath = path.join(outputDir, outputBaseName)
      log('outputPath:', chalk.yellow(outputPath))

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir)

      fs.writeFileSync(outputPath, Buffer.from(pickedFont.toArrayBuffer()))
    }

    if(argv.base) {
      const isBasePathUrl = isPathUrl(argv.base)
      const basePath = isBasePathUrl ? argv.base : path.resolve(argv.dir, argv.base)
      log('basePath:', chalk.yellow(argv.base))
      const loadBase = isBasePathUrl ? loadFontFromUrl : opentype.load
      const base = await loadBase(basePath)

      const mergedGlyphs = []
      const nameUnicodeMap = {}

      const baseGlyphsObject = base.glyphs.glyphs
      for (const key in baseGlyphsObject) {
          if (Object.hasOwnProperty.call(baseGlyphsObject, key)) {
              const glyph = baseGlyphsObject[key]
              nameUnicodeMap[glyph.name] = glyph.unicode
              mergedGlyphs.push(glyph)
          }
      }

      for (sg  of stringGlyphs) {
        if(nameUnicodeMap[sg.name]) continue
        nameUnicodeMap[sg.name] = sg.unicode
        mergedGlyphs.push(sg)
      }
      create(mergedGlyphs)

    } else {
      create(stringGlyphs)
    }
    progressElapsedTimer.end(chalk.green('✅ Pick font successfully!'))
  } catch (error) {
    errorChalk(error)
  }
}


pick()

