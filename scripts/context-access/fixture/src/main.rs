//! Each call to `step` needs a shadow-stack frame (the buffer's address escapes
//! through `black_box`), so its prologue and epilogue read and write the stack
//! pointer. On wasm32-wasip3 that pointer lives in component-model context slot 0.

#[inline(never)]
fn step(i: u64) -> u64 {
    let mut buf = [0u8; 32];
    buf[0] = i as u8;
    std::hint::black_box(&mut buf);
    buf[0] as u64
}

fn main() {
    let n: u64 = std::env::args()
        .nth(1)
        .and_then(|a| a.parse().ok())
        .unwrap_or(100_000);
    let start = std::time::Instant::now();
    let mut sum = 0u64;
    for i in 0..n {
        sum = sum.wrapping_add(step(std::hint::black_box(i)));
    }
    println!("{n} calls in {:?} (sum {sum})", start.elapsed());
}
