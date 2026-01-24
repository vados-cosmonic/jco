mod bindings {
    use super::Component;
    wit_bindgen::generate!({
        world: "async-stream-tx",
    });
    export!(Component);
}

use bindings::wit_stream;
use wit_bindgen::StreamReader;

use crate::bindings::wit_stream::StreamPayload;

struct Component;

fn stream_values_async<T: StreamPayload>(vals: Vec<T>) -> Result<StreamReader<T>, String> {
    let (mut tx, rx) = wit_stream::new();
    wit_bindgen::spawn(async move {
        for val in vals {
            tx.write_all(vec![val]).await;
        }
    });
    Ok(rx)
}

impl bindings::exports::jco::test_components::get_stream::Guest for Component {
    async fn get_stream_u32(vals: Vec<u32>) -> Result<StreamReader<u32>, String> {
        stream_values_async(vals)
    }

    async fn get_stream_s32(vals: Vec<i32>) -> Result<StreamReader<i32>, String> {
        stream_values_async(vals)
    }
}

// Stub only to ensure this works as a binary
fn main() {}
