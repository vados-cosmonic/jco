//! Intrinsics that represent helpers that should be used from JS code

use crate::{intrinsics::RenderIntrinsicsArgs, source::Source};

/// This enum contains intrinsics that function as JS helpers
///
/// For example, intrinsics in this enum may create global JS variables,
/// polyfills, or perform commonly used JS functionality.
#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq)]
pub enum JsHelperIntrinsic {
    /// A Helper function that is simply an empty function
    EmptyFunc,

    /// A helper function that creates a JS `DataView` from a given memory index
    DataView,
}

impl JsHelperIntrinsic {
    pub(crate) fn runtime_import(&self) -> super::runtime::RuntimeImport {
        use super::runtime::{RuntimeContext, RuntimeImport};
        RuntimeImport {
            suffix: "intrinsics/js-helper",
            export: self.name(),
            context: match self {
                Self::EmptyFunc => None,
                Self::DataView => Some(RuntimeContext::DataViewCache),
            },
        }
    }

    /// Retrieve global names for
    pub fn get_global_names() -> impl IntoIterator<Item = &'static str> {
        ["emptyFunc", "dataView"]
    }

    /// Get the name for the intrinsic
    pub fn name(&self) -> &'static str {
        match self {
            Self::EmptyFunc => "emptyFunc",
            Self::DataView => "dataView",
        }
    }

    /// Render an intrinsic to a string
    pub fn render(&self, output: &mut Source, _args: &RenderIntrinsicsArgs) {
        match self {
            Self::EmptyFunc => output.push_str("
                const emptyFunc = () => {};
            "),
            Self::DataView => output.push_str("
                let dv = new DataView(new ArrayBuffer());
                const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
            "),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::TranspileOpts;
    use crate::intrinsics::{Intrinsic, render_intrinsics, runtime::render_imports};
    use std::collections::BTreeSet;

    #[test]
    fn cache_state_is_selected_only_for_data_view_users() {
        for selected in [JsHelperIntrinsic::EmptyFunc, JsHelperIntrinsic::DataView] {
            let mut intrinsics = BTreeSet::from([Intrinsic::JsHelper(selected)]);
            let opts = TranspileOpts::builder()
                .name("cache".into())
                .cm_runtime_es_module("runtime-package".into())
                .build();
            let source = render_intrinsics(
                RenderIntrinsicsArgs::builder()
                    .intrinsics(&mut intrinsics)
                    .transpile_opts(&opts)
                    .build(),
            );
            let mut imports = Source::default();
            render_imports(&mut imports, &intrinsics, "runtime-package");
            assert!(!source.contains("let dv ="));
            assert!(!source.contains("new DataView"));
            assert!(!source.contains("const emptyFunc"));
            assert!(imports.contains("runtime-package/intrinsics/js-helper"));
            assert_eq!(
                source.contains("_jcoInitializeDataViewCache()"),
                selected == JsHelperIntrinsic::DataView
            );
            assert_eq!(
                imports.contains("initializeDataViewCache as _jcoInitializeDataViewCache"),
                selected == JsHelperIntrinsic::DataView
            );
            for unrelated in [
                "TextEncoder",
                "TextDecoder",
                "Bitcast",
                "WebAssembly.Global",
                "new Map",
            ] {
                assert!(!source.contains(unrelated), "{unrelated}");
            }
        }
    }
}
