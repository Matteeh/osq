//! Scanning Rust source text for calls that spawn Node.

use std::fmt;
use std::path::PathBuf;
use syn::spanned::Spanned;
use syn::visit::Visit;
use syn::{Expr, ExprCall, Lit};

/// One place a Rust source spawns Node.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NodeSpawn {
    /// The file the source came from, as the caller gave it.
    pub file: String,
    /// The 1-based line where the call's path starts.
    pub line: usize,
    /// The program the call spawns, as the string literal holds it.
    pub program: String,
}

/// Why scanning a source or a workspace failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScanError {
    /// A file could not be read or is not UTF-8.
    Read {
        /// The path that could not be read.
        path: PathBuf,
        /// What went wrong.
        message: String,
    },
    /// Source text does not parse.
    Parse {
        /// The path that holds the source.
        path: PathBuf,
        /// The 1-based line the parser reports.
        line: usize,
        /// What went wrong.
        message: String,
    },
    /// A workspace manifest has no usable members array.
    Manifest {
        /// The manifest that could not be read.
        path: PathBuf,
        /// What went wrong.
        message: String,
    },
}

impl fmt::Display for ScanError {
    /// Writes the error's message, naming the file and, for a parse error, its line.
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Read { path, message } => write!(formatter, "{}: {message}", path.display()),
            Self::Parse {
                path,
                line,
                message,
            } => write!(formatter, "{}:{line}: {message}", path.display()),
            Self::Manifest { path, message } => {
                write!(formatter, "{}: {message}", path.display())
            }
        }
    }
}

impl std::error::Error for ScanError {}

/// Returns every place `source` spawns Node, in source order.
///
/// # Errors
///
/// Returns `ScanError::Parse` when `source` does not parse.
///
/// Implements: rust-linter/node-spawns
pub fn node_spawns(file: &str, source: &str) -> Result<Vec<NodeSpawn>, ScanError> {
    let syntax = syn::parse_file(source).map_err(|error| ScanError::Parse {
        path: PathBuf::from(file),
        line: error.span().start().line,
        message: error.to_string(),
    })?;
    let mut visitor = SpawnVisitor {
        file,
        spawns: Vec::new(),
    };
    visitor.visit_file(&syntax);
    Ok(visitor.spawns)
}

/// Collects the Node spawns it visits.
struct SpawnVisitor<'source> {
    /// The file name to report on each spawn.
    file: &'source str,
    /// The spawns found so far, in visit order.
    spawns: Vec<NodeSpawn>,
}

impl<'ast> Visit<'ast> for SpawnVisitor<'_> {
    /// Records a call that spawns Node, then visits its children.
    fn visit_expr_call(&mut self, call: &'ast ExprCall) {
        if let Some(spawn) = spawn_at(self.file, call) {
            self.spawns.push(spawn);
        }
        syn::visit::visit_expr_call(self, call);
    }
}

/// Builds the spawn of one call expression, or none when it does not spawn Node.
fn spawn_at(file: &str, call: &ExprCall) -> Option<NodeSpawn> {
    let Expr::Path(function) = &*call.func else {
        return None;
    };
    if !is_command_new(&function.path) {
        return None;
    }
    let Expr::Lit(literal) = call.args.first()? else {
        return None;
    };
    let Lit::Str(text) = &literal.lit else {
        return None;
    };
    let program = text.value();
    if !names_node(&program) {
        return None;
    }
    Some(NodeSpawn {
        file: file.to_owned(),
        line: function.path.span().start().line,
        program,
    })
}

/// Whether a path ends in the segments `Command` and `new`.
fn is_command_new(path: &syn::Path) -> bool {
    let Some(new_segment) = path.segments.last() else {
        return false;
    };
    let Some(command_segment) = path.segments.iter().rev().nth(1) else {
        return false;
    };
    new_segment.ident == "new" && command_segment.ident == "Command"
}

/// Whether a program's file name is exactly `node`, `npx` or `openspec`.
fn names_node(program: &str) -> bool {
    let name = program.rsplit(['/', '\\']).next().unwrap_or(program);
    let name = name
        .strip_suffix(".exe")
        .or_else(|| name.strip_suffix(".cmd"))
        .unwrap_or(name);
    matches!(name, "node" | "npx" | "openspec")
}
