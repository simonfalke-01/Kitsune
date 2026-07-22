set dotenv-load := true

default:
  @just --list

dev:
  pnpm --dir web dev

serve:
  cargo run -p kitsune-server

test:
  cargo test --workspace
  pnpm test

lint:
  cargo fmt --all -- --check
  cargo clippy --workspace --all-targets --all-features -- -D warnings
  pnpm lint
  pnpm check

e2e:
  pnpm --dir web test:e2e

load:
  cargo run --manifest-path tests/load/Cargo.toml --release

build:
  cargo build --workspace --all-features
  pnpm build

openapi:
  cargo run -p kitsune-cli -- openapi --output web/openapi.json

