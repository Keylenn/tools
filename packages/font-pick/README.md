# font-pick 🧺

<a href="https://www.npmjs.com/package/font-pick"><img alt="NPM version" src="https://img.shields.io/npm/v/font-pick.svg"></a> <a href="https://www.npmjs.com/package/font-pick"><img alt="NPM downloads" src="https://img.shields.io/npm/dm/font-pick.svg"></a>

[[简体中文]](./README-ZH-CN.md) | [[English]](./README.md)

Pick only the fonts you want. 只选你想要的字体。

## ✨特性
+ 更轻量，压缩后的字体包xxx

## ⚡️ 快速开始
```bash
  # npx
  npx font-pick -s 'Hello world' 

  # pnpx
  pnpx font-pick -s 'Hello world' 
```

## 📦 安装
```bash
  # npm
  npm i font-pick -g

  # yarn
  yarn global add font-pick

  # pnpm
  pnpm add font-pick -g
```

## 💡 指令
```bash
  font-pick [options...]
```

| 选项🎯 | 别名🚀 | 描述📝 |
| :-----: | :----: | :----: |
| --help | 🙅‍♂️ | 查看具体用法 |
| --string | -s | 需要新增的字符串，必需❗️ |
| --font | -f | 完整字体包路径，默认选项为`./font.ttf` |
| --base | -b | 基本字体包路径，新增字体会基于这个字体包 |
| --dir | -d | 查找和生成字体包的目录，默认选项为当前工作目录`process.cwd()` |
| --output | -o | 生成字体包的目录，默认选项为`./font-pick` |
| --name | -n | 生成的字体包名称，默认选项为`--font`选项的basename |

## 🥂 字体支持说明

| 格式💤 | 本地路径🗂 | http(s)🔗 |
| :-----: | :----: | :----: |
| ```.ttf``` | ✅ | ✅ |
| ```.otf``` | ✅ | ✅ |
| ```.woff``` | ✅ |  ❌  |
| ```.woff2``` | ❌ |  ❌  |

## 🙋‍♂️ Q&A


## 🏗 TODO 
+ 新增支持其他字体格式
+ 新增LOGO