use js_component_bindgen::{AsyncMode, InstantiationMode, TranspileOpts, transpile};
use serde_json::{Value, json};
use wasmparser::{ExternalKind, Parser, Payload, TypeRef};

/// Describe function signatures for the experimental native boundary wrappers.
fn signatures(bytes: &[u8]) -> anyhow::Result<Value> {
    let mut types = Vec::new();
    let mut functions = Vec::new();
    let mut imports = Vec::new();
    let mut exports = Vec::new();
    for payload in Parser::new(0).parse_all(bytes) {
        match payload? {
            Payload::TypeSection(section) => {
                for function in section.into_iter_err_on_gc_types() {
                    let function = function?;
                    types.push(json!({
                        "params": function.params().iter().map(ToString::to_string).collect::<Vec<_>>(),
                        "results": function.results().iter().map(ToString::to_string).collect::<Vec<_>>()
                    }));
                }
            }
            Payload::ImportSection(section) => {
                for import in section.into_imports() {
                    let import = import?;
                    if let TypeRef::FuncExact(_) = import.ty {
                        anyhow::bail!(
                            "exact function imports are unsupported by native context guards"
                        );
                    }
                    if let TypeRef::Func(index) = import.ty {
                        functions.push(index);
                        imports.push(
                            json!({"module": import.module, "name": import.name, "type": index}),
                        );
                    }
                }
            }
            Payload::FunctionSection(section) => {
                for index in section {
                    functions.push(index?);
                }
            }
            Payload::ExportSection(section) => {
                for export in section {
                    let export = export?;
                    if export.kind == ExternalKind::Func {
                        exports.push(
                            json!({"name": export.name, "type": functions[export.index as usize]}),
                        );
                    }
                }
            }
            _ => {}
        }
    }
    Ok(json!({"types": types, "imports": imports, "exports": exports}))
}

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let input = args.next().expect("input component");
    if input == "--parse" {
        let input = args.next().expect("input WAT");
        let output = args.next().expect("output Wasm");
        std::fs::write(output, wat::parse_file(input)?)?;
        return Ok(());
    }
    let output = std::path::PathBuf::from(args.next().expect("output directory"));
    // Optional comma-separated lists mark synchronous component functions as JSPI boundaries.
    let async_imports = args.next().unwrap_or_default();
    let async_exports = args.next().unwrap_or_default();
    let split = |list: String| {
        list.split(',')
            .filter(|name| !name.is_empty())
            .map(str::to_owned)
            .collect()
    };
    let bytes = std::fs::read(input)?;
    let generated = transpile(
        &wat::parse_bytes(&bytes)?,
        TranspileOpts::builder()
            .name("stack-loop".into())
            .base64_cutoff(0)
            .instantiation_mode(InstantiationMode::Async)
            .async_mode(AsyncMode::JavaScriptPromiseIntegration {
                imports: split(async_imports),
                exports: split(async_exports),
            })
            .build(),
    )?;
    let mut metadata = serde_json::Map::new();
    for (name, contents) in generated.files {
        if name.ends_with(".wasm") {
            metadata.insert(name.clone(), signatures(&contents)?);
        }
        let path = output.join(name);
        std::fs::create_dir_all(path.parent().unwrap())?;
        std::fs::write(path, contents)?;
    }
    std::fs::write(
        output.join("core-types.json"),
        serde_json::to_vec_pretty(&metadata)?,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::signatures;
    use serde_json::json;

    #[test]
    fn imported_functions_offset_export_indices() -> anyhow::Result<()> {
        let bytes = wat::parse_str(
            r#"(module
                (import "host" "call" (func (param i32)))
                (func (export "value") (result i64) (i64.const 1)))"#,
        )?;
        let metadata = signatures(&bytes)?;
        assert_eq!(metadata["imports"][0]["type"], 0);
        assert_eq!(metadata["exports"][0]["type"], 1);
        assert_eq!(metadata["types"][1]["results"], json!(["i64"]));
        Ok(())
    }

    #[test]
    fn exact_function_imports_are_not_silently_unguarded() -> anyhow::Result<()> {
        let bytes = wat::parse_str(
            r#"(module (type $signature (func))
                (import "host" "call" (func (exact (type $signature)))))"#,
        )?;
        assert!(
            signatures(&bytes)
                .unwrap_err()
                .to_string()
                .contains("exact function imports")
        );
        Ok(())
    }
}
