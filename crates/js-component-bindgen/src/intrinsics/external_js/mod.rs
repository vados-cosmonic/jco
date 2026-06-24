//! Intrinsic renderer that uses an external JS package for implementation

use crate::source::Source;

use super::{IntrinsicRender, RenderIntrinsicsArgs};

/// Built-in (default) intrinsic renderer
pub struct ExternalJsRenderer;

impl IntrinsicRender for ExternalJsRenderer {
    type SingleIntrinsic = ();

    fn render(
        &self,
        _intrinsic: &Self::SingleIntrinsic,
        _output: &mut Source,
        _args: &RenderIntrinsicsArgs,
    ) {
        // External JS renderer never renders *any* intrinsics, as all intrinsics should be provided
        // by an already-imported external library
    }
}
