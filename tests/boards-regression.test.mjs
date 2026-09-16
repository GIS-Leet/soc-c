import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const pages = ['qna.html', 'feedback.html', 'support.html'];
const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} exists`);
  const declarationStart = source.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  let depth = 0;
  let bodyStarted = false;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') { depth++; bodyStarted = true; }
    if (source[i] === '}' && --depth === 0 && bodyStarted) return source.slice(declarationStart, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

async function loadFunction(page, name) {
  const context = {};
  vm.runInNewContext(`${extractFunction(read(page), name)}; this.fn = ${name}`, context);
  return context.fn;
}

function extractWindowAssignment(source, name) {
  const start = source.indexOf(`window.${name} = async`);
  assert.notEqual(start, -1, `${name} exists`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 2);
  }
  throw new Error(`unterminated ${name}`);
}

test('board escaping handles non-string database values and every HTML-significant character', () => {
  for (const page of pages) {
    const context = {};
    vm.runInNewContext(`${extractFunction(read(page), 'escapeHTML')}; this.escapeHTML = escapeHTML`, context);
    assert.equal(context.escapeHTML(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;', page);
    assert.equal(context.escapeHTML(1234), '1234', page);
  }
});

test('all board pages expose labels and render question toggles as buttons', () => {
  for (const page of pages) {
    const source = read(page);
    for (const id of ['titleInput', 'authorInput', 'pwInput', 'questionInput']) {
      assert.match(source, new RegExp(`<label[^>]+for=["']${id}["']`), `${page}: ${id}`);
    }
    assert.match(source, /<button[^>]+class="(?:q-row|item-row)"[^>]+aria-expanded=/, page);
  }
});

test('writes wait for Firebase acknowledgement and keep editor values on rejection', () => {
  for (const page of pages) {
    const source = read(page);
    assert.doesNotMatch(source, /window\.addReply\s*=\s*\([^)]*\)\s*=>/s, `${page}: reply handler must be async`);
    assert.match(source, /window\.addReply\s*=\s*async/s, page);
    assert.match(source, /await push\(dbRef\(db, `(?:questions|feedback|support)\/\$\{id\}\/replies`/s, page);
    assert.match(source, /window\.saveEdit\s*=\s*async/s, page);
    assert.match(source, /await commitWrite\(/s, page);
  }
});

test('question search initializes from q and follows browser history', () => {
  const source = read('qna.html');
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('q'\)/);
  assert.match(source, /addEventListener\('popstate'/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{ if \(!boardEmpty\.hidden\)/);
  assert.match(source, /onChildAdded\(questionsRef,[\s\S]+?,\s*handleBoardError\)/);
});

test('acknowledged write helper calls Firebase once and mutates UI only after success', async () => {
  for (const page of pages) {
    const commitWrite = await loadFunction(page, 'commitWrite');
    let calls = 0;
    let rendered = false;
    await commitWrite(async () => { calls++; }, () => { rendered = true; });
    assert.equal(calls, 1, page);
    assert.equal(rendered, true, page);

    calls = 0;
    rendered = false;
    await assert.rejects(commitWrite(async () => { calls++; throw new Error('offline'); }, () => { rendered = true; }));
    assert.equal(calls, 1, page);
    assert.equal(rendered, false, page);
  }
});

test('actual edit handlers issue one write and preserve the editor when it fails', async () => {
  for (const page of pages) {
    let calls = 0;
    const alerts = [];
    const fields = {
      'edit-title-safe': { value: '수정 제목' },
      'edit-textarea-safe': { value: '수정 내용' }
    };
    const context = {
      window: { AppModal: { show: (options) => alerts.push(options.msg) } },
      document: { getElementById: (id) => fields[id] },
      db: {},
      dbRef: (_db, path) => path,
      update: async () => { calls++; throw new Error('offline'); }
    };
    vm.runInNewContext(`${extractFunction(read(page), 'commitWrite')}; ${extractWindowAssignment(read(page), 'saveEdit')}`, context);
    await context.window.saveEdit('safe');
    assert.equal(calls, 1, page);
    assert.equal(fields['edit-title-safe'].value, '수정 제목', page);
    assert.equal(fields['edit-textarea-safe'].value, '수정 내용', page);
    assert.match(alerts[0], /유지됩니다/, page);
  }
});

test('malicious Firebase keys are rejected before inline rendering', async () => {
  for (const page of pages) {
    const isSafeFirebaseKey = await loadFunction(page, 'isSafeFirebaseKey');
    assert.equal(isSafeFirebaseKey('-Oabc_123'), true, page);
    assert.equal(isSafeFirebaseKey(`x');alert(1)//`), false, page);
    assert.match(read(page), /if \(!isSafeFirebaseKey\(id\)\) return;/, page);
  }
});

test('all live database dates are escaped before entering rendered HTML', () => {
  for (const page of pages) {
    const source = read(page);
    assert.doesNotMatch(source, /\$\{(?:data\.time|bodyDiv\.dataset\.time)\}/, page);
  }
});
