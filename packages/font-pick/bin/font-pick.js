#!/usr/bin/env node

const opentype = require('opentype.js')
const minimist = require("minimist")
const path = require('path')
var fs = require('fs');

const argv = minimist(process.argv.slice(2), {
  alias: {
    'string': 's',
    'font': 'f',
    'base': 'b',
    'dir': 'd',
  },
  string: ['font', 'base', 'string', 'dir'],
  'default': {
    'font': './font.ttf',
    'dir': process.cwd()
  }
})

console.log(111, argv.string)
if(argv.help) {
  console.log("Usage:")
  console.log("  fp --help // print help information");
  console.log("  fp -s 0123 // The string that needs to be picked");
  process.exit(0);
} else if(!argv.string) {
  console.error('[Error in font-pick:]', 'parameter [string] is required!')
  process.exit(-1);
}


async function pick() {
  try {
  const fontDir = path.resolve(argv.dir, argv.font)
  const [fontName] = path.basename(fontDir).split('.')
  console.log('font:', fontDir, fontName)

  const font = await opentype.load(fontDir)
  

  const stringGlyphs =  font.stringToGlyphs(argv.string)

  const create = (glyphs = []) => {
    const pickedFont = new opentype.Font({
      familyName: font.names.fontFamily.en,
      styleName: font.names.fontSubfamily.en,
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      glyphs
    })

    // @TODO
    fs.writeFile('./font-pick.ttf', Buffer.from(pickedFont.toArrayBuffer()), (err) => {
      if (err) throw err;
      console.log('The file has been saved!');
    })
  }

    if(argv.base) {
      const baseDir = path.resolve(argv.dir, argv.base)
      console.log('baseFontDir:', baseDir)
      const base = await opentype.load(baseDir)
      const isExisted = (g) =>base.glyphNames.names.some(n => n === g.name)
    } else {
       create(stringGlyphs)
      
    }

  } catch (error) {
    console.error('[Error in font-pick:]', error)
  }
}


pick()

