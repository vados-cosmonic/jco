use std::fmt::Write;

use crate::intrinsics::{JsHelperIntrinsic, RenderIntrinsicsArgs};
use crate::source::Source;
use crate::uwriteln;

impl super::BuiltinIntrinsicRenderer {
    /// Render a [`JsHelperIntrinsic`]
    pub(crate) fn render_js_helper(
        &self,
        intrinsic: &JsHelperIntrinsic,
        output: &mut Source,
        _render_args: &RenderIntrinsicsArgs,
    ) {
        match intrinsic {
            JsHelperIntrinsic::EmptyFunc => uwriteln!(output, "const emptyFunc = () => {{}};"),
            JsHelperIntrinsic::DataView => uwriteln!(
                output,
                r#"
                  let dv = new DataView(new ArrayBuffer());
                  const dataView = mem => dv.buffer === mem.buffer ? dv : dv = new DataView(mem.buffer);
                "#
            ),
        }
    }
}
