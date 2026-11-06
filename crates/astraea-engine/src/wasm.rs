//! Raw WebAssembly boundary: no bindings generator, just linear memory.
//!
//! The host allocates input buffers with `engine_alloc`, writes UTF-8 bytes,
//! calls `engine_call`, then reads the reply (`engine_reply_ptr` /
//! `engine_reply_len`) and frees what it allocated. One call at a time per
//! instance: each worker owns its own instance.

use std::cell::RefCell;

thread_local! {
    static REPLY: RefCell<String> = const { RefCell::new(String::new()) };
}

#[no_mangle]
pub extern "C" fn engine_alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len.max(1));
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// # Safety
/// `ptr`/`len` must come from one `engine_alloc(len)` call, freed once.
#[no_mangle]
pub unsafe extern "C" fn engine_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// # Safety
/// Both ranges must be live `engine_alloc` buffers holding UTF-8.
#[no_mangle]
pub unsafe extern "C" fn engine_call(cmd_ptr: *const u8, cmd_len: usize, args_ptr: *const u8, args_len: usize) {
    let cmd = std::str::from_utf8(std::slice::from_raw_parts(cmd_ptr, cmd_len)).unwrap_or("");
    let args = std::str::from_utf8(std::slice::from_raw_parts(args_ptr, args_len)).unwrap_or("null");
    let reply = crate::dispatch_json(cmd, args);
    REPLY.with(|r| *r.borrow_mut() = reply);
}

#[no_mangle]
pub extern "C" fn engine_reply_ptr() -> *const u8 {
    REPLY.with(|r| r.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn engine_reply_len() -> usize {
    REPLY.with(|r| r.borrow().len())
}
