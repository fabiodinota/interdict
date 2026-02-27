use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "interdict-verify")]
#[command(about = "Verify Interdict evidence bundles")]
struct Cli {
    #[arg(long)]
    json: bool,
    #[arg(long)]
    kernel_id: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    Bundle {
        file: String,
    },
    Range {
        dir: String,
        #[arg(long)]
        from: String,
        #[arg(long)]
        to: String,
    },
    Chain {
        dir: String,
    },
}

fn output_not_implemented(command: &str, json: bool) {
    if json {
        let kernel_scope = "kernel filter optional";
        println!(
            "{{\"status\":\"not_implemented\",\"command\":\"{command}\",\"note\":\"{kernel_scope}\"}}"
        );
    } else {
        println!("{command}: not yet implemented");
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    match cli.command {
        Commands::Bundle { .. } => output_not_implemented("verify bundle", cli.json),
        Commands::Range { .. } => output_not_implemented("verify range", cli.json),
        Commands::Chain { .. } => output_not_implemented("verify chain", cli.json),
    }

    Ok(())
}
