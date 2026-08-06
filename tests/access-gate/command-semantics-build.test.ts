// tests/access-gate/command-semantics-build.test.ts
// build 命令族（build.ts adapter）：cargo/go/make

import { defineAdapterTests } from "./helpers";

defineAdapterTests("build", [
  { cmd: "cargo build", name: "cargo build is execute", cls: "execute" },
  { cmd: "cargo test", name: "cargo test is execute", cls: "execute" },
  { cmd: "cargo clean", name: "cargo clean is modify (deletes target/ without invoking compiler)", cls: "modify" },
  { cmd: "cargo install cargo-binstall", name: "cargo install is execute with network", cls: "execute", effects: ["network"] },
  { cmd: "cargo bogus-thing", name: "cargo unknown subcommand is opaque", cls: "unknown", opaque: true },
  { cmd: "cargo fmt", name: "cargo fmt is modify", cls: "modify" },
  { cmd: "cargo fix", name: "cargo fix is modify", cls: "modify" },
  { cmd: ["cargo clippy", "cargo doc", "cargo bench"], name: "cargo clippy/doc/bench are execute", cls: "execute" },
  { cmd: "cargo add serde", name: "cargo add is modify with network", cls: "modify", effects: ["network"] },
  { cmd: "cargo remove serde", name: "cargo remove is modify with network", cls: "modify", effects: ["network"] },
  { cmd: ["cargo tree", "cargo metadata"], name: "cargo tree and metadata are inspect", cls: "inspect" },
  { cmd: ["cargo search serde", "cargo --version"], name: "cargo search and version are inspect", cls: "inspect" },
  { cmd: ["cargo run --bin app", "cargo check", "cargo update"], name: "cargo run/check/update are execute", cls: "execute" },
  { cmd: "go build ./...", name: "go build is execute", cls: "execute" },
  { cmd: "go version", name: "go version is inspect", cls: "inspect" },
  { cmd: "go mod tidy", name: "go mod tidy is modify (edits go.mod without compiling)", cls: "modify" },
  { cmd: "go get example.com/foo", name: "go get is execute with network", cls: "execute", effects: ["network"] },
  { cmd: ["go fmt", "go clean"], name: "go fmt and clean are modify", cls: "modify" },
  { cmd: "go mod download", name: "go mod download is execute with network", cls: "execute", effects: ["network"] },
  { cmd: "go vet", name: "go vet is execute", cls: "execute" },
  { cmd: "go generate", name: "go generate is execute", cls: "execute" },
  { cmd: "go env GOPATH", name: "go env is inspect", cls: "inspect" },
  { cmd: ["go doc fmt", "go list ./..."], name: "go doc and list are inspect", cls: "inspect" },
  { cmd: "make install", name: "make is execute", cls: "execute" },
  { cmd: "make -f Makefile build", name: "make -f still executes", cls: "execute" },
]);
