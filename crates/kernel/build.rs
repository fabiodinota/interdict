fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    // SAFETY: build.rs runs single-threaded during compilation;
    // no other thread reads or writes the PROTOC environment variable concurrently.
    unsafe {
        std::env::set_var("PROTOC", protoc);
    }

    tonic_prost_build::configure()
        .build_server(false)
        .build_client(true)
        .compile_protos(
            &[
                "../../proto/interdict/evidence/v1/evidence.proto",
                "../../proto/interdict/policy/v1/policy_distribution.proto",
            ],
            &["../../proto/"],
        )?;

    Ok(())
}
