use std::{env, fs};

use zed_extension_api::{
    self as zed, settings::LspSettings, Command, LanguageServerId,
    LanguageServerInstallationStatus, Result, Worktree,
};

/// Zed side of the Cosense language server.
///
/// There is no grammar here: `.csn` has no tree-sitter parser, and none is needed, because
/// every colour comes from the server's semantic tokens. Zed only asks for those when
/// `semantic_tokens` is turned on for the language — its default is "off" — so see the README.
struct CosenseExtension {
    /// Whether the npm copy was found or installed in this session, so the registry is asked
    /// once per start rather than every time a server is launched.
    did_find_server: bool,
}

/// The server as published, installed into the extension's own directory.
const PACKAGE_NAME: &str = "@cosense-toolbox/lsp";
const PACKAGE_SERVER: &str = "node_modules/@cosense-toolbox/lsp/dist/main.mjs";

/// The server as built in this repository, for working on the extension and the server together.
const REPOSITORY_SERVER: &str = "packages/lsp/dist/main.mjs";
const REPOSITORY_MANIFEST: &str = "packages/lsp/package.json";

fn stdio(command: String, mut args: Vec<String>, worktree: &Worktree) -> Command {
    args.push("--stdio".into());
    Command {
        command,
        args,
        env: worktree.shell_env(),
    }
}

/// True when the worktree is this repository: its `packages/lsp` is the server's own package.
fn is_repository(worktree: &Worktree) -> bool {
    worktree
        .read_text_file(REPOSITORY_MANIFEST)
        .is_ok_and(|manifest| manifest.contains(&format!("\"name\": \"{PACKAGE_NAME}\"")))
}

fn package_server_exists() -> bool {
    fs::metadata(PACKAGE_SERVER).is_ok_and(|stat| stat.is_file())
}

impl CosenseExtension {
    /// The npm copy of the server, installed or brought up to date first. A failed update is
    /// not fatal while an older copy is there: the reader keeps a working server offline.
    fn package_server(&mut self, language_server_id: &LanguageServerId) -> Result<String> {
        if self.did_find_server && package_server_exists() {
            return Ok(PACKAGE_SERVER.into());
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &LanguageServerInstallationStatus::CheckingForUpdate,
        );
        let latest = zed::npm_package_latest_version(PACKAGE_NAME);
        let installed = zed::npm_package_installed_version(PACKAGE_NAME)?;

        match latest {
            Ok(version) if installed.as_deref() != Some(version.as_str()) => {
                zed::set_language_server_installation_status(
                    language_server_id,
                    &LanguageServerInstallationStatus::Downloading,
                );
                if let Err(error) = zed::npm_install_package(PACKAGE_NAME, &version) {
                    if !package_server_exists() {
                        return Err(error);
                    }
                }
            }
            Err(error) if !package_server_exists() => return Err(error),
            _ => {}
        }

        zed::set_language_server_installation_status(
            language_server_id,
            &LanguageServerInstallationStatus::None,
        );
        self.did_find_server = true;
        Ok(PACKAGE_SERVER.into())
    }
}

impl zed::Extension for CosenseExtension {
    fn new() -> Self {
        Self {
            did_find_server: false,
        }
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

        // An installed copy next, such as one from `npm install -g @cosense-toolbox/lsp`.
        if let Some(installed) = worktree.which("csn-lsp") {
            return Ok(stdio(installed, vec![], worktree));
        }

        // In this repository, its own build, so a change to the server shows after a rebuild.
        // It is handed over without checking that it is there: `dist/` is gitignored, and Zed's
        // worktree does not index ignored files, so asking would answer "missing" for a file
        // that exists. node's own error says more than a guess here could.
        if is_repository(worktree) {
            let node = worktree
                .which("node")
                .ok_or_else(|| "node が見つかりません。PATH を確認してください".to_string())?;
            let server = format!("{}/{}", worktree.root_path(), REPOSITORY_SERVER);
            return Ok(stdio(node, vec![server], worktree));
        }

        // Otherwise the published server, run with the node that Zed ships.
        let server = self.package_server(language_server_id)?;
        let path = env::current_dir()
            .map_err(|error| error.to_string())?
            .join(server)
            .to_string_lossy()
            .into_owned();
        Ok(stdio(zed::node_binary_path()?, vec![path], worktree))
    }

    /// The reader's `initialization_options`, passed through as they are. This is where the
    /// server's settings live, such as `unresolvedLinks` (how loudly a link to a missing page
    /// is reported).
    fn language_server_initialization_options(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<zed::serde_json::Value>> {
        Ok(
            LspSettings::for_worktree(language_server_id.as_ref(), worktree)
                .ok()
                .and_then(|settings| settings.initialization_options),
        )
    }
}

zed::register_extension!(CosenseExtension);
