shell := if os() == "macos" { "/bin/zsh" } else { env_var_or_default("SHELL", "/usr/bin/zsh") }

just := env_var_or_default("JUST", "just")
just_dir := env_var_or_default("JUST_DIR", justfile_directory())

cargo := env_var_or_default("CARGO", "cargo")
npm := env_var_or_default("NPM", "npm")

@_default:
    {{just}} --list

# Ensure a given binary is installed
_ensure-bin name:
    #!{{shell}}
    if [[ ! $(command -v {{name}}) ]]; then
      echo "[error] missing binary [{{name}}], please ensure it is installed"
    fi

# Build the project
@build:
    {{just}} _ensure-bin {{cargo}}
    {{just}} _ensure-bin {{npm}}
    {{just}} build-rust
    {{just}} build-js

# Build rust code
@build-rust:
    {{cargo}} build -p wasm-tools-js --target=wasm32-wasi
    {{cargo}} build -p js-component-bindgen --target=wasm32-wasi
    {{cargo}} build -p js-component-bindgen-component --target=wasm32-wasi
    {{cargo}} build -p jco

# Build JS code
@build-js:
    {{npm}} build

# Test all code
@test:
    {{just}} test-rust
    {{just}} test-js

# Test Rust code
@test-rust:
    {{cargo}} test -p wasm-tools-js
    {{cargo}} test -p js-component-bindgen
    {{cargo}} test -p js-component-bindgen-component

# Test JS code
@test-js:
    cd packages/jco && {{npm}} test
    cd packages/preview2-shim && {{npm}} test
