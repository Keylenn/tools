import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../cast.html', import.meta.url), 'utf8');
const coreScript = html.match(/<script id="cast-core">([\s\S]*?)<\/script>/)?.[1];
const uiScript = html.match(/<script id="cast-ui">([\s\S]*?)<\/script>/)?.[1];
assert.ok(coreScript && uiScript, '页面须提供独立核心与界面脚本');
const context = vm.createContext({});
vm.runInContext(coreScript, context);
const core = vm.runInContext('CastCore', context);
const plain = value => JSON.parse(JSON.stringify(value));
const cast = (header, events) => [header, ...events].map(value => JSON.stringify(value)).join('\n');
const decode = text => text.trim().split('\n').map(line => JSON.parse(line));
const h2 = { version:2, width:80, height:24 };
const h3 = { version:3, term:{ cols:80, rows:24 } };
const baseEvents = [[0, 'o', 'a'], [2, 'o', 'b'], [5, 'o', 'c']];
const v2 = cast(h2, baseEvents);
const v3 = cast(h3, [[0, 'o', 'a'], [2, 'o', 'b'], [3, 'o', 'c']]);
const v1Header = { version:1, width:80, height:24, stdout:[[0, 'a'], [2, 'b'], [3, 'c']] };

function edit(raw, start = 0, end, speed = 1) {
  const recording = core.parseRecording(raw);
  return core.editRecording(recording, { start, end:end ?? recording.duration, speed });
}

function browser() {
  const nodes = new Map();
  const players = [];
  const blobs = new Map();
  const downloads = [];
  const revoked = [];
  const timers = new Map();
  const handlers = {};
  let serial = 0;
  let timerId = 0;
  let library;
  const element = id => {
    if (!nodes.has(id)) {
      nodes.set(id, {
        value:id === 'theme' ? 'asciinema' : id === 'speed' ? '1' : '0',
        textContent:'', dataset:{}, files:[], checked:false, disabled:id === 'edit-fields',
        events:{}, classList:{ add() {}, remove() {} },
        addEventListener(name, callback) { this.events[name] = callback; },
        replaceChildren() {},
      });
    }
    return nodes.get(id);
  };
  const window = { addEventListener(name, callback) { handlers[name] = callback; } };
  const sandbox = vm.createContext({
    window, Blob, console,
    URL:{
      createObjectURL(blob) { const url = 'blob:test-' + ++serial; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revoked.push(url); blobs.delete(url); },
    },
    document:{
      getElementById:element,
      createElement(tag) {
        if (tag === 'script') return {};
        assert.equal(tag, 'a');
        return {
          click() { downloads.push({ filename:this.download, blob:blobs.get(this.href), url:this.href }); },
          remove() { this.removed = true; },
        };
      },
      head:{ appendChild(script) { library = script; } },
      body:{ appendChild() {} },
    },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(coreScript, sandbox);
  vm.runInContext(uiScript, sandbox);
  const run = script => vm.runInContext(script, sandbox);
  const trigger = (id, event, value = { preventDefault() {} }) => element(id).events[event](value);
  function ready() {
    window.AsciinemaPlayer = {
      create(src, container, options) {
        const player = {
          src, options, disposed:false, plays:0, events:{},
          addEventListener(name, fn) {
            // 3.10.0 已移除 init 事件，不能用宽松 mock 掩盖接口错误。
            assert.ok(['metadata', 'playing', 'pause', 'ended', 'errored'].includes(name));
            this.events[name] = fn;
          },
          play() { this.plays++; return Promise.resolve(); },
          dispose() { this.disposed = true; },
          emit(name) { this.events[name]?.(); },
        };
        players.push(player);
        return player;
      },
    };
    library.onload();
  }
  function options(start, end, speed) {
    for (const [id, value] of [['trim-start', start], ['trim-end', end], ['speed', speed]]) {
      element(id).value = String(value);
      trigger(id, 'input');
    }
  }
  return { element, run, trigger, ready, options, players, blobs, downloads, revoked, timers, handlers, failLibrary:() => library.onerror() };
}

test('两个内联脚本语法正确，运行态无额外依赖或转换接口', () => {
  new vm.Script(coreScript);
  new vm.Script(uiScript);
  assert.match(html, /asciinema-player@3\.10\.0/);
  assert.equal((html.match(/asciinema-player@3\.10\.0/g) || []).length, 2);
  assert.doesNotMatch(html, /\bagg\b|\bgif\b|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i);
  assert.match(html, /裁剪不是敏感内容擦除/);
});

for (const [name, raw] of [['v1单行', JSON.stringify(v1Header)], ['v1多行', JSON.stringify(v1Header, null, 2)], ['v2', v2], ['v3', v3]]) {
  test(`${name} 转为等价绝对时间，输出统一为v2`, () => {
    const source = core.parseRecording(raw);
    assert.deepEqual(plain(source.events), baseEvents);
    assert.equal(source.duration, 5);
    const result = core.editRecording(source, { start:0, end:5, speed:1 });
    assert.equal(decode(result.text)[0].version, 2);
    assert.equal(core.parseRecording(result.text).duration, 5);
    assert.equal(Object.hasOwn(decode(result.text)[0], 'stdout'), false);
  });
}

test('v3支持BOM、CRLF、注释、嵌套主题并累计未知/输入/退出事件的间隔', () => {
  const theme = { fg:'#eeeeee', bg:'#111111', palette:'example' };
  const input = JSON.stringify({ ...h3, term:{ ...h3.term, theme }, title:'demo', idle_time_limit:2 }) +
    '\n# 注释\n' + [[0.25, 'o', 'x'], [2.5, 'i', 'a'], [0.125, 'z', 'future'], [0.125, 'x', '0']].map(JSON.stringify).join('\n');
  const source = core.parseRecording('\uFEFF' + input.replaceAll('\n', '\r\n') + '\r\n');
  assert.equal(source.duration, 3);
  assert.deepEqual(plain(source.events).map(e => e[0]), [0.25, 2.75, 2.875, 3]);
  assert.deepEqual(plain(source.header.theme), theme);
  assert.equal(source.header.title, 'demo');
  assert.equal(Object.hasOwn(source.header, 'idle_time_limit'), false);
});

const invalidRecordings = [
  ['', /文件为空/], ['bad', /JSON/], ['null', /JSON 对象/], ['[]', /JSON 对象/],
  [cast({ version:4, term:h3.term }, [[1, 'o', 'x']]), /不支持/],
  [cast({ version:3, width:80, height:24 }, [[1, 'o', 'x']]), /正整数/],
  [cast({ ...h3, term:{ cols:0, rows:24 } }, [[1, 'o', 'x']]), /正整数/],
  [cast({ ...h3, term:{ cols:1001, rows:24 } }, [[1, 'o', 'x']]), /尺寸过大/],
  [cast(h3, []), /没有播放事件/],
  [cast(h3, [[-1, 'o', 'x']]), /非负时间间隔/],
  [cast(h3, [[1e308, 'o', 'x'], [1e308, 'o', 'y']]), /时长超出/],
  [cast(h2, [[2, 'o', 'x'], [1, 'o', 'y']]), /非递减时间/],
  [cast(h3, [[1, 'r', '0x24']]), /正整数/],
  [cast(h3, [[1, 'r', 'bad']]), /尺寸事件无效/],
  [cast(h3, [[1, 'x', 0]]), /事件无效/],
  [cast(h3, [[1, 'o']]), /事件无效/],
  [JSON.stringify(v1Header) + '\ntrailing', /单个完整/],
];
for (const [index, [raw, pattern]] of invalidRecordings.entries()) {
  test(`拒绝无效录屏 ${index + 1}`, () => assert.throws(() => core.parseRecording(raw), pattern));
}

test('非零起点裁剪：初始化在0时刻，区间事件平移和加速，末尾补时', () => {
  const result = edit(v3, 1, 4, 2);
  assert.equal(result.duration, 1.5);
  assert.equal(result.initializationCount, 1);
  assert.deepEqual(decode(result.text).slice(1), [[0, 'o', 'a'], [0.5, 'o', 'b'], [1.5, 'o', '']]);
});

test('保留起点前输出、ANSI和resize顺序，排除区间前的输入/标记/未知事件', () => {
  const source = cast(h2, [[0, 'o', '\x1b[31mred'], [0.1, 'r', '100x30'], [0.2, 'i', 'secret input'], [0.3, 'm', 'old'], [0.4, 'z', 'old'], [1, 'o', '\x1b[2J\x1b[Hready'], [3, 'o', 'done']]);
  const result = edit(source, 2, 3, 1);
  assert.deepEqual(decode(result.text).slice(1), [[0, 'o', '\x1b[31mred'], [0, 'r', '100x30'], [0, 'o', '\x1b[2J\x1b[Hready'], [1, 'o', 'done'], [1, 'o', '']]);
  assert.equal(result.initializationCount, 3);
});

test('起点和终点事件各保留一次，零间隔事件不丢失', () => {
  const result = edit(cast(h2, [[0, 'o', 'before'], [1, 'o', 'start'], [1, 'm', 'same time'], [2, 'o', 'end'], [3, 'o', 'after']]), 1, 2, 1);
  assert.deepEqual(decode(result.text).slice(1), [[0, 'o', 'before'], [0, 'o', 'start'], [0, 'm', 'same time'], [1, 'o', 'end'], [1, 'o', '']]);
});

test('无输出区间仍保留起点画面及完整尾部空闲', () => {
  const result = edit(cast(h2, [[0, 'o', 'screen'], [10, 'x', '0']]), 2, 6, 2);
  assert.deepEqual(decode(result.text).slice(1), [[0, 'o', 'screen'], [2, 'o', '']]);
  assert.equal(result.duration, 2);
});

test('重复编辑始终使用原始数据，不改写来源或复合倍速', () => {
  const source = core.parseRecording(v3);
  const before = JSON.stringify(source);
  const options = { start:1, end:5, speed:2 };
  const first = core.editRecording(source, options);
  assert.equal(core.editRecording(source, options).text, first.text);
  assert.equal(first.duration, 2);
  assert.equal(JSON.stringify(source), before);
  assert.equal(core.editRecording(source, { start:0, end:5, speed:1 }).duration, 5);
});

for (const [start, end, speed] of [[-1, 2, 1], [2, 2, 1], [3, 2, 1], [0, 6, 1], [NaN, 2, 1], [0, Infinity, 1], [0, 2, 0], [0, 2, 0.1], [0, 2, 9], [0, 2, NaN], [0, 2, Infinity]]) {
  test(`拒绝非法范围/速度 ${start},${end},${speed}`, () => assert.throws(() => edit(v2, start, end, speed)));
}

test('0.25×慢放和8×加速均真实写入输出时间轴', () => {
  assert.equal(core.parseRecording(edit(v2, 0, 5, 0.25).text).duration, 20);
  assert.equal(core.parseRecording(edit(v2, 0, 5, 8).text).duration, 0.625);
});

test('零时长录屏显示明确剪辑错误，不伪造输出时长', () => {
  assert.throws(() => edit(cast(h2, [[0, 'o', 'instant']]), 0, 0, 1), /零时长录屏/);
});

test('下载文件名不包含路径或控制字符，保留中文且不等于源文件名', () => {
  assert.equal(core.downloadName('中文.cast'), '中文.edited.cast');
  assert.equal(core.downloadName('recording.JSON'), 'recording.edited.cast');
  assert.equal(core.downloadName(''), 'recording.edited.cast');
  assert.doesNotMatch(core.downloadName('../../evil\\name\u0000.cast'), /[/\\\u0000]/);
});

test('界面应用裁剪后预览speed固定1，原始信息不变，重置恢复全长', () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  assert.equal(b.element('edit-fields').disabled, false);
  assert.match(b.element('file-info').textContent, /asciicast v3/);
  b.options(1, 5, 2); b.trigger('edit-form', 'submit');
  assert.match(b.element('edit-summary').textContent, /输出时长：2.00 秒/);
  const player = b.players.at(-1);
  assert.equal(player.options.speed, 1);
  assert.equal(player.options.idleTimeLimit, Infinity);
  assert.equal(b.run('appliedRecording.duration'), 2);
  assert.equal(b.run('originalRecording.duration'), 10);
  b.trigger('edit-form', 'submit');
  assert.equal(b.run('appliedRecording.duration'), 2);
  b.trigger('reset-edit', 'click');
  assert.match(b.element('edit-summary').textContent, /输出时长：10.00 秒/);
  assert.equal(b.element('speed').value, '1');
  b.handlers.pagehide();
});

test('坏草稿不破坏已应用预览，主题/循环/控制器不偷应用草稿', () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  b.options(1, 5, 2); b.trigger('edit-form', 'submit');
  const previous = b.players.at(-1);
  b.options(4, 2, 4); b.trigger('edit-form', 'submit');
  assert.equal(b.players.at(-1), previous);
  assert.equal(previous.disposed, false);
  assert.equal(b.element('edit-status').dataset.state, 'error');
  b.element('theme').value = 'nord'; b.element('loop').checked = true;
  b.element('hide-controls').checked = true; b.trigger('hide-controls', 'change');
  const pure = b.players.at(-1);
  assert.equal(pure.options.controls, false);
  assert.equal(pure.options.theme, 'nord');
  assert.equal(pure.options.loop, true);
  assert.equal(b.run('appliedRecording.speed'), 2);
  assert.equal(b.run('appliedRecording.duration'), 2);
  b.element('hide-controls').checked = false; b.trigger('hide-controls', 'change');
  assert.equal(b.players.at(-1).options.controls, true);
  assert.equal(b.element('mode-state').textContent, '标准播放模式');
  b.handlers.pagehide();
});

test('空输入不被当成0，下载非法草稿不会产生Blob', () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  b.options('', 4, 2); b.trigger('download-cast', 'click');
  assert.match(b.element('edit-status').textContent, /请填写/);
  assert.equal(b.downloads.length, 0);
  b.handlers.pagehide();
});

test('下载应用最新草稿，与预览Blob内容一致，延迟回收URL', async () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  b.options(1, 5, 2); b.trigger('download-cast', 'click');
  assert.equal(b.downloads.length, 1);
  const downloaded = b.downloads[0];
  assert.equal(downloaded.filename, '内置示例.edited.cast');
  assert.equal(downloaded.blob.type, 'application/x-asciicast');
  const preview = b.blobs.get(b.players.at(-1).src.url);
  assert.equal(await downloaded.blob.text(), await preview.text());
  assert.equal(core.parseRecording(await downloaded.blob.text()).duration, 2);
  assert.equal(b.revoked.includes(downloaded.url), false);
  const [id, timer] = [...b.timers].find(([, value]) => value.delay === 30000);
  timer.fn(); b.timers.delete(id);
  assert.equal(b.revoked.includes(downloaded.url), true);
  b.handlers.pagehide();
  assert.equal(b.blobs.size, 0);
});

test('CDN不可用仍能裁剪和下载，不误报播放成功', async () => {
  const b = browser(); b.failLibrary(); b.trigger('demo', 'click');
  b.options(1, 5, 2); b.trigger('download-cast', 'click');
  assert.equal(b.players.length, 0);
  assert.equal(b.element('msg').dataset.state, 'error');
  assert.equal(b.downloads.length, 1);
  assert.equal(core.parseRecording(await b.downloads[0].blob.text()).duration, 2);
  b.handlers.pagehide();
});

test('播放器metadata/暂停/结束/失败事件与旧实例隔离', () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  const player = b.players.at(-1);
  player.emit('metadata'); player.emit('playing');
  assert.match(b.element('msg').textContent, /^正在播放/);
  player.emit('pause'); assert.match(b.element('msg').textContent, /已暂停/);
  player.emit('ended'); assert.match(b.element('msg').textContent, /结束/);
  b.options(1, 5, 2); b.trigger('edit-form', 'submit');
  const message = b.element('msg').textContent;
  player.emit('metadata'); player.emit('playing');
  assert.equal(player.plays, 1);
  assert.equal(b.element('msg').textContent, message);
  b.players.at(-1).emit('errored');
  assert.equal(b.element('msg').dataset.state, 'error');
  b.handlers.pagehide();
});

test('坏文件、读取失败和50MiB限制保留当前录屏，忽略旧状态事件', async () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  const player = b.players.at(-1);
  await b.run('loadFile({name:"bad.cast",size:1,text:async()=>"broken"})');
  assert.equal(player.disposed, false);
  assert.equal(b.element('edit-fields').disabled, false);
  assert.match(b.element('file-info').textContent, /内置示例/);
  player.emit('playing'); assert.equal(b.element('msg').dataset.state, 'error');
  await b.run('loadFile({name:"big.cast",size:MAX_FILE_SIZE+1,text:async()=>{throw Error("不应读取");}})');
  assert.match(b.element('msg').textContent, /50 MiB/);
  await b.run('loadFile({name:"unreadable.cast",size:1,text:async()=>{throw Error("read failed");}})');
  assert.match(b.element('msg').textContent, /read failed/);
  b.handlers.pagehide();
});

test('过期读取不能覆盖新示例，读取期间禁止编辑，恢复缓存页面可重建', async () => {
  const b = browser(); b.ready(); b.trigger('demo', 'click');
  b.run('globalThis.pending=loadFile({name:"slow.cast",size:1,text:()=>new Promise(resolve=>globalThis.finish=resolve)})');
  assert.equal(b.element('edit-fields').disabled, true);
  b.trigger('demo', 'click'); b.run('finish("bad")'); await b.run('pending');
  assert.equal(b.element('edit-fields').disabled, false);
  assert.equal(b.element('msg').dataset.state, '');
  const count = b.players.length;
  b.handlers.pagehide();
  assert.equal(b.blobs.size, 0);
  b.handlers.pageshow({ persisted:true });
  assert.equal(b.players.length, count + 1);
  b.handlers.pagehide();
});

test('文件选择和拖放事件接线、空选择及多文件拒绝', async () => {
  const b = browser(); b.ready();
  const file = { name:'drop.cast', size:v3.length, text:async () => v3 };
  b.element('file').files = [file]; b.trigger('file', 'change');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.run('readingSequence'), 0);
  assert.match(b.element('file-info').textContent, /drop.cast/);
  assert.equal(b.element('file').value, '');
  const current = b.players.at(-1);
  b.element('file').files = []; b.trigger('file', 'change');
  assert.equal(b.players.at(-1), current);
  b.trigger('dropzone', 'drop', { preventDefault() {}, dataTransfer:{ files:[file, file] } });
  assert.match(b.element('msg').textContent, /一次选择一个/);
  b.trigger('dropzone', 'drop', { preventDefault() {}, dataTransfer:{ files:[file] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.run('readingSequence'), 0);
  assert.match(b.element('file-info').textContent, /drop.cast/);
  b.handlers.pagehide();
});
