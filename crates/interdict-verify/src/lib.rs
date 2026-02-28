pub mod chain;
pub mod merkle;
pub mod report;
pub mod signature;

pub mod proto {
    tonic::include_proto!("interdict.evidence.v1");
}
