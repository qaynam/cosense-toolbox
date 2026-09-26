use zed_extension_api::{
    self as zed, settings::LspSettings, Command, LanguageServerId, Result, Worktree,
};

/// Zed side of the Cosense language server.
///
/// There is no grammar here: `.csn` has no tree-sitter parser, and none is needed, because
/// every colour comes from the server's semantic tokens. Zed only asks for those when
/// `semantic_tokens` is turned on for the language — its default is "off" — so see the README.
struct CosenseExtension;

const SERVER_RELATIVE: &str = "packages/language-server/dist/main.mjs";

impl zed::Extension for CosenseExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Command> {
        // Whatever the reader configured wins, so a checkout somewhere else, or a bun build
        // instead of node, needs no change here.
        if let Ok(settings) = LspSettings::for_worktree(language_server_id.as_ref(), worktree) {
            if let Some(binary) = settings.binary {
                if let Some(path) = binary.path {
                    return Ok(Command {
                        command: path,
                        args: binary.arguments.unwrap_or_else(|| vec!["--stdio".into()]),
                        env: worktree.shell_env(),
                    });
                }
            }
        }

        // An installed copy next, for anyone who wants the highlighting without the repository.
        if let Some(installed) = worktree.which("cosense-language-server") {
            return Ok(Command {
                command: installed,
                args: vec!["--stdio".into()],
                env: worktree.shell_env(),
            });
        }

        // Otherwise the checkout's own build. It is handed over without checking that it is
        // there: `dist/` is gitignored, and Zed's worktree does not index ignored files, so
        // asking it would answer "missing" for a file that exists. node's own error says more
        // than a guess here could.
        let node = worktree
            .which("node")
            .ok_or_else(|| "node が見つかりません。PATH を確認してください".to_string())?;
        Ok(Command {
            command: node,
            args: vec![
                format!("{}/{}", worktree.root_path(), SERVER_RELATIVE),
                "--stdio".into(),
            ],
            env: worktree.shell_env(),
        })
    }
}

zed::register_extension!(CosenseExtension);
