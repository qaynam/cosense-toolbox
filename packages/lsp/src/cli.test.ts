import { describe, expect, it } from "vitest"

import { version } from "../package.json"
import { commandOf, USAGE } from "./cli"

describe("csn-lsp", () => {
  it.each([
    { args: ["--stdio"] },
    { args: ["--node-ipc"] },
    { args: ["--socket=5007"] },
    { args: ["--socket", "5007"] },
    { args: ["--pipe=csn-lsp.sock"] },
    { args: ["--pipe", "csn-lsp.sock"] },
  ])("starts the server when told how to talk to the editor: $args", ({ args }) => {
    expect(commandOf(args)).toEqual({ _tag: "serve" })
  })

  it("starts the server as VS Code launches it, with its process id after the transport", () => {
    expect(commandOf(["--stdio", "--clientProcessId=4242"])).toEqual({ _tag: "serve" })
  })

  it("starts the server wherever the transport is among the arguments", () => {
    expect(commandOf(["--clientProcessId=4242", "--stdio"])).toEqual({ _tag: "serve" })
  })

  it("runs check with the arguments after it", () => {
    expect(commandOf(["check", "src", "--no-frontmatter"])).toEqual({
      _tag: "check",
      args: ["src", "--no-frontmatter"],
    })
  })

  it.each([{ args: ["--help"] }, { args: ["-h"] }])(
    "prints the usage and passes with $args",
    ({ args }) => {
      expect(commandOf(args)).toEqual({ _tag: "print", output: USAGE, exitCode: 0 })
    },
  )

  it("prints the version and passes with --version", () => {
    expect(commandOf(["--version"])).toEqual({
      _tag: "print",
      output: `${version}\n`,
      exitCode: 0,
    })
  })

  it("stops with the usage and exit code 2 when not told how to talk to the editor", () => {
    expect(commandOf([])).toEqual({ _tag: "print", output: USAGE, exitCode: 2 })
  })

  it("stops with the usage and exit code 2 on a command it does not know", () => {
    expect(commandOf(["chekc"])).toEqual({ _tag: "print", output: USAGE, exitCode: 2 })
  })
})
