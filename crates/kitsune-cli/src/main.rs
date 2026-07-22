//! `kit` operator command.

use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(name = "kit", version, about = "Operate a Kitsune CTF platform")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Print build and schema versions.
    Version,
    /// Write the code-generated OpenAPI 3.1 document.
    #[command(hide = true)]
    Openapi {
        /// Destination JSON path.
        #[arg(long, default_value = "web/openapi.json")]
        output: PathBuf,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Version => {
            println!("kit {} (OpenAPI 3.1)", env!("CARGO_PKG_VERSION"));
        }
        Command::Openapi { output } => {
            let body = serde_json::to_vec_pretty(&kitsune_api::openapi_json())
                .context("serialize OpenAPI")?;
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent).context("create OpenAPI directory")?;
            }
            std::fs::write(&output, body).with_context(|| format!("write {}", output.display()))?;
            println!("wrote {}", output.display());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use clap::Parser;

    use super::*;

    #[test]
    fn openapi_output_is_configurable() {
        let cli =
            Cli::try_parse_from(["kit", "openapi", "--output", "out.json"]).expect("parse command");
        assert!(matches!(
            cli.command,
            Command::Openapi { output } if output == std::path::Path::new("out.json")
        ));
    }
}
