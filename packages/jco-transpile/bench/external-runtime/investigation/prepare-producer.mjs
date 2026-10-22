import assert from 'node:assert/strict';
import { access, copyFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [profile, source, destination, ...extra] = process.argv.slice(2);
assert.ok(
    ['factory', 'named'].includes(profile) && source && destination && !extra.length,
    'Usage: node prepare-producer.mjs factory|named SOURCE_ROOT FRESH_DRIVER_DIRECTORY',
);
const root = await realpath(source);
const dependency = join(root, 'crates/js-component-bindgen');
await access(join(dependency, 'Cargo.toml'));
const output = resolve(destination);
await mkdir(output);
await copyFile(new URL('./producer.rs', import.meta.url), join(output, 'main.rs'));
await copyFile(new URL(`./${profile}-producer.lock`, import.meta.url), join(output, 'Cargo.lock'));
await writeFile(
    join(output, 'Cargo.toml'),
    `[package]
name = "jco-matched-${profile}-producer"
version = "0.0.0"
edition = "2024"
[workspace]
resolver = "2"
[dependencies]
js-component-bindgen = { path = ${JSON.stringify(dependency)} }
wat = { version = "=1.259.0", default-features = false, features = ["component-model"] }
[[bin]]
name = "jco-matched-${profile}-producer"
path = "main.rs"
`,
    { flag: 'wx' },
);
console.log(JSON.stringify({ profile, source: root, manifest: join(output, 'Cargo.toml'), timingCollected: false }));
