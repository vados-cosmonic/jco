use js_component_bindgen::{AsyncMode, InstantiationMode, TranspileOpts, transpile};

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let input = args.next().expect("input component");
    let output = std::path::PathBuf::from(args.next().expect("output directory"));
    let generated = transpile(
        &std::fs::read(input)?,
        TranspileOpts::builder()
            .name("stack-loop".into())
            .instantiation_mode(InstantiationMode::Async)
            .async_mode(AsyncMode::JavaScriptPromiseIntegration {
                imports: vec![],
                exports: vec![],
            })
            .build(),
    )?;
    for (name, contents) in generated.files {
        let path = output.join(name);
        std::fs::create_dir_all(path.parent().unwrap())?;
        std::fs::write(path, contents)?;
    }
    Ok(())
}
