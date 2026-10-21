import { describe, expect, it } from 'vitest';
import {
  detectCodeLanguage,
  normalizeLanguageToken,
  parseFenceLanguage,
  resolveCodeLanguage,
} from '@/lib/markdown/code-language';

describe('fence language parsing', () => {
  it('normalizes common fence spellings', () => {
    expect(normalizeLanguageToken('ts')).toBe('ts');
    expect(normalizeLanguageToken('  TypeScript  ')).toBe('typescript');
    expect(normalizeLanguageToken('js title="demo"')).toBe('js');
    expect(normalizeLanguageToken('{.js}')).toBe('js');
    expect(normalizeLanguageToken('language-css')).toBe('css');
    expect(normalizeLanguageToken('')).toBeNull();
    expect(normalizeLanguageToken(null)).toBeNull();
  });

  it('reads the language class marked writes', () => {
    expect(parseFenceLanguage('language-js')).toBe('js');
    expect(parseFenceLanguage('hljs language-python extra')).toBe('python');
    expect(parseFenceLanguage('')).toBeNull();
  });

  it('resolves aliases, plaintext and unknown languages differently', () => {
    expect(resolveCodeLanguage('js')).toEqual({ kind: 'language', id: 'javascript' });
    expect(resolveCodeLanguage('c++')).toEqual({ kind: 'language', id: 'cpp' });
    expect(resolveCodeLanguage('txt')).toEqual({ kind: 'plain' });
    expect(resolveCodeLanguage('not-a-language')).toEqual({ kind: 'unsupported' });
    expect(resolveCodeLanguage(null)).toEqual({ kind: 'none' });
  });
});

describe('automatic language detection', () => {
  const cases: Array<[string, string | null]> = [
    ['{"name":"studio","n":2}', 'json'],
    ['const add = (a, b) => a + b;\nconsole.log(add(1, 2));', 'javascript'],
    ['interface User { id: string }\nconst user: User = { id: "a" };', 'typescript'],
    ['const App = () => {\n  const [n, setN] = useState<number>(0);\n  return <div>{n}</div>;\n};', 'tsx'],
    ['<!DOCTYPE html>\n<html><body><h1>hi</h1></body></html>', 'html'],
    ['.card {\n  color: #fff;\n  margin: 8px;\n}', 'css'],
    ['$brand: #c93f6d;\n.card { color: $brand; }', 'scss'],
    ['def greet(name):\n    print(f"hi {name}")', 'python'],
    ['#!/usr/bin/env bash\nset -euo pipefail\npnpm build', 'bash'],
    ['name: studio\nversion: 1.0.0', 'yaml'],
    ['[package]\nname = "studio"', 'toml'],
    ['[package.deps]\nshiki = "^1.0"', 'toml'],
    ['[package]\nauthors = [{ name = "Alice" }]', 'toml'],
    ['[package]\ntags = ["a", "b"]', 'toml'],
    ['; old-style TOML comment\n[package]\nname = "studio"', 'toml'],
    ['SELECT id, name FROM users WHERE age > 18;', 'sql'],
    ['package main\n\nfunc main() {\n\tfmt.Println("hi")\n}', 'go'],
    ['fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}', 'rust'],
    ['<?php\necho "hi";', 'php'],
    ['<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = "hi";\n</script>', 'vue'],
    ['GET /api/posts HTTP/1.1\nHost: example.com', 'http'],
    ['这是一段普通文字，没有代码。\n第二行也一样。', null],
    ['', null],
  ];

  for (const [code, expected] of cases) {
    it(`${expected ?? 'plain'} ← ${code.split('\n')[0]?.slice(0, 42)}`, () => {
      expect(detectCodeLanguage(code)).toBe(expected);
    });
  }

  it('does not let a placeholder detector override a real match', () => {
    // 同一段代码同时像 JSX 和 TSX 时，带类型标注的要拿到 TSX。
    expect(detectCodeLanguage('const id = (value: string) => value;\nreturn <App id={id} />;')).toBe('tsx');
    // INI 的 `;` 注释不算 TOML。
    expect(detectCodeLanguage('; config\n[server]\nhost = 127.0.0.1')).toBe('ini');
  });
});
