//! Reading one change folder into the plain data the text sections print.

mod dependency;
mod human;
mod next;
pub(crate) mod placeholder;
mod steering;

use std::fs;
use std::path::{Path, PathBuf};

use osq_core::TaskStatus;
use osq_kernel_specs::{parse_frontmatter, read_proposal, read_task_file};
use osq_kernel_storage::{Location, parse_result_sections};
use yaml_rust2::Yaml;

use crate::facts::{Facts, LandFacts};
use crate::lookup::Found;

pub(crate) use next::NextStep;

/// The status a change shows after its markers are read.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SpecStatus {
    /// No approval seal.
    Unapproved,
    /// An unmet dependency.
    Blocked,
    /// A dead task or change.
    Dead,
    /// A running task.
    Running,
    /// Waiting for a task.
    Pending,
    /// Every task is done.
    Done,
    /// A regressed task or change.
    Regressed,
}

impl SpecStatus {
    /// The lowercase status text TypeScript prints between brackets.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Unapproved => "unapproved",
            Self::Blocked => "blocked",
            Self::Dead => "dead",
            Self::Running => "running",
            Self::Pending => "pending",
            Self::Done => "done",
            Self::Regressed => "regressed",
        }
    }
}

/// One halt marker's facts and trimmed body.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Marker {
    /// The frontmatter's `reason` string, or empty text.
    pub(crate) reason: String,
    /// Whether the frontmatter's `stuck` is the boolean `true`.
    pub(crate) stuck: bool,
    /// Whether the frontmatter's `verification_passed` is the boolean `true`.
    pub(crate) verification_passed: bool,
    /// The trimmed body, when non-empty.
    pub(crate) diagnostic: Option<String>,
}

/// One task file with the marker state the text prints.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Task {
    /// The task number, from its file name.
    pub(crate) number: String,
    /// The frontmatter title.
    pub(crate) title: String,
    /// The status the task line prints.
    pub(crate) status: TaskStatus,
    /// The status TypeScript's next-step derivation reads.
    pub(crate) state_status: TaskStatus,
    /// The trimmed verify command, else empty text.
    pub(crate) verify: String,
    /// The scope entries.
    pub(crate) scope: Vec<String>,
    /// The task's entry paths.
    pub(crate) entry: Vec<String>,
    /// The task's skills.
    pub(crate) skills: Vec<String>,
    /// The acceptance lines.
    pub(crate) acceptance: Vec<String>,
    /// The dead marker, when the file exists.
    pub(crate) dead: Option<Marker>,
    /// The regressed marker, when the file exists.
    pub(crate) regressed: Option<Marker>,
    /// Whether `.run/done/<n>` exists.
    pub(crate) done: bool,
    /// Whether `.run/running/<n>.pid` exists.
    pub(crate) running: bool,
    /// The trimmed result file body, when non-empty.
    pub(crate) result: Option<String>,
    /// The real disclosure names of the result file.
    pub(crate) disclosures: Option<String>,
}

impl Task {
    /// The dead marker's reason, when it is non-empty.
    pub(crate) fn dead_reason(&self) -> Option<&str> {
        self.dead
            .as_ref()
            .map(|marker| marker.reason.as_str())
            .filter(|reason| !reason.is_empty())
    }

    /// The dead marker's trimmed diagnostic, when non-empty.
    pub(crate) fn dead_diagnostic(&self) -> Option<&str> {
        self.dead
            .as_ref()
            .and_then(|marker| marker.diagnostic.as_deref())
    }
}

/// One change folder with everything the task's text sections need.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Change {
    /// The folder's leading digits, or its whole name without digits.
    pub(crate) id: String,
    /// The folder's name.
    pub(crate) folder: String,
    /// The change folder's path.
    pub(crate) path: PathBuf,
    /// Where the folder sits.
    pub(crate) location: Location,
    /// The proposal's title.
    pub(crate) title: String,
    /// The status header.
    pub(crate) status: SpecStatus,
    /// The trimmed approval seal, when there is one.
    pub(crate) approved_hash: Option<String>,
    /// The proposal's dependencies.
    pub(crate) depends_on: Vec<String>,
    /// The proposal's `features.reads`.
    pub(crate) reads: Vec<String>,
    /// The delta spec folders the change writes.
    pub(crate) writes: Vec<String>,
    /// The proposal's goal.
    pub(crate) goal: String,
    /// The proposal's contract.
    pub(crate) contract: String,
    /// The proposal's non-goals.
    pub(crate) non_goals: String,
    /// The proposal's delta.
    pub(crate) delta: String,
    /// The `### Before approval` steps, when non-empty.
    pub(crate) before_approval: Option<String>,
    /// The `### After landing` steps, when non-empty.
    pub(crate) after_landing: Option<String>,
    /// The change's tasks in task-number order.
    pub(crate) tasks: Vec<Task>,
    /// What the change needs next, absent for a rejected change.
    pub(crate) next: Option<NextStep>,
    /// Whether this change is archived.
    pub(crate) archived: bool,
}

/// Reads a found change folder into its text model.
///
/// # Errors
///
/// Returns the message TypeScript prints when the folder has neither a
/// proposal nor a spec, or when the specs kernel refuses a file.
pub(crate) fn read(
    found: &Found,
    facts: &Facts,
    land: Option<&LandFacts>,
) -> Result<Change, String> {
    let folder = &found.path;
    let proposal_path = folder.join("proposal.md");
    let spec_path = folder.join("spec.md");
    if !proposal_path.is_file() && !spec_path.is_file() {
        return Err(format!(
            "Neither proposal.md nor spec.md found in {}",
            folder.display()
        ));
    }
    let proposal = proposal(&proposal_path)?;
    let (before_approval, after_landing) = human::read(&proposal_path)?;
    let approved_hash = approved_hash(folder);
    let writes = written_capabilities(folder);
    let tasks = tasks(folder)?;
    let change_regressed = read_marker(&marker_path(folder, "regressed", "change"));
    let unmet = if found.location == Location::Active {
        dependency::unmet(
            folder.parent().unwrap_or_else(|| Path::new("")),
            &proposal.depends_on,
        )
    } else {
        Vec::new()
    };
    let steering = steering::has(&tasks, change_regressed.as_ref(), approved_hash.is_some())
        .then_some(Steering);
    let status = status(found.location, &tasks, approved_hash.is_some(), &unmet);
    let id = id(&found.folder);
    let archived_unlanded = found.location == Location::Archived
        && facts.vcs_enabled()
        && land.is_some_and(|land| !land.landed);
    let next = next_step(&NextInput {
        location: found.location,
        id: &id,
        approved: approved_hash.is_some(),
        verify: &proposal.verify,
        brief: folder.join("brief.md").exists(),
        before_approval: before_approval.as_deref(),
        tasks: &tasks,
        change_regressed: change_regressed.as_ref(),
        unmet: &unmet,
        steering,
        archived_unlanded,
    });
    Ok(Change {
        id,
        folder: found.folder.clone(),
        path: folder.clone(),
        location: found.location,
        title: proposal.title,
        status,
        approved_hash,
        depends_on: proposal.depends_on,
        reads: proposal.reads,
        writes,
        goal: proposal.goal,
        contract: proposal.contract,
        non_goals: proposal.non_goals,
        delta: proposal.delta,
        before_approval,
        after_landing,
        tasks,
        next,
        archived: found.location == Location::Archived,
    })
}

/// The proposal fields a model reads.
struct ProposalFields {
    /// The trimmed title.
    title: String,
    /// The dependency ids.
    depends_on: Vec<String>,
    /// The read capabilities.
    reads: Vec<String>,
    /// The trimmed verify command.
    verify: String,
    /// The trimmed goal.
    goal: String,
    /// The trimmed contract.
    contract: String,
    /// The trimmed non-goals.
    non_goals: String,
    /// The trimmed delta.
    delta: String,
}

/// Reads a proposal, falling back to the folder when it has no proposal.
fn proposal(path: &Path) -> Result<ProposalFields, String> {
    if !path.is_file() {
        return Ok(ProposalFields {
            title: String::new(),
            depends_on: Vec::new(),
            reads: Vec::new(),
            verify: String::new(),
            goal: String::new(),
            contract: String::new(),
            non_goals: String::new(),
            delta: String::new(),
        });
    }
    let parsed = read_proposal(path).map_err(|error| error.to_string())?;
    Ok(ProposalFields {
        title: parsed.title,
        depends_on: parsed.depends_on,
        reads: parsed.reads,
        verify: parsed.verify,
        goal: parsed.goal,
        contract: parsed.contract,
        non_goals: parsed.non_goals,
        delta: parsed.delta,
    })
}

/// The change id: its leading digits, else its folder name.
fn id(folder: &str) -> String {
    let digits: String = folder.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        folder.to_owned()
    } else {
        digits
    }
}

/// The trimmed `.run/approved` seal, or `None` when absent or empty.
fn approved_hash(folder: &Path) -> Option<String> {
    let text = fs::read_to_string(folder.join(".run").join("approved")).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// The delta spec folders the change writes, sorted by name.
fn written_capabilities(folder: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(folder.join("specs")) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect();
    names.sort();
    names
}

/// Reads every `tasks/*.md` file in task-number order.
fn tasks(folder: &Path) -> Result<Vec<Task>, String> {
    let dir = folder.join("tasks");
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(Vec::new());
    };
    let mut files: Vec<(String, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let number = name.strip_suffix(".md")?.to_owned();
            Some((number, entry.path()))
        })
        .collect();
    files.sort_by(|left, right| compare_tasks(&left.0, &right.0));
    files
        .into_iter()
        .map(|(number, path)| read_task(folder, &number, &path))
        .collect()
}

/// Orders task names by leading number, then by text.
fn compare_tasks(left: &str, right: &str) -> std::cmp::Ordering {
    match (leading_number(left), leading_number(right)) {
        (Some(left_number), Some(right_number)) => {
            left_number.cmp(&right_number).then_with(|| left.cmp(right))
        }
        _ => left.cmp(right),
    }
}

/// The integer a task name leads with.
fn leading_number(text: &str) -> Option<u128> {
    let digits: String = text.chars().take_while(char::is_ascii_digit).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

/// Reads one task file, its markers, result and disclosures.
fn read_task(folder: &Path, number: &str, path: &Path) -> Result<Task, String> {
    let plan = read_task_file(path).map_err(|error| error.to_string())?;
    let done = folder.join(".run").join("done").join(number).exists();
    let running = folder
        .join(".run")
        .join("running")
        .join(format!("{number}.pid"))
        .exists();
    let dead = read_marker(&marker_path(folder, "dead", number));
    let regressed = read_marker(&marker_path(folder, "regressed", number));
    let state_status = state_status(done, running, dead.as_ref(), regressed.as_ref());
    let status = display_status(done, running, dead.as_ref(), regressed.as_ref());
    let result = result(folder, number);
    let disclosures = result.as_deref().and_then(disclosures);
    Ok(Task {
        number: number.to_owned(),
        title: plan.title.clone(),
        status,
        state_status,
        verify: plan.verify.clone(),
        scope: plan.scope.clone(),
        entry: plan.entry.clone(),
        skills: plan.skills.clone(),
        acceptance: plan.acceptance.clone(),
        dead,
        regressed,
        done,
        running,
        result,
        disclosures,
    })
}

/// The status a task line prints: regressed, dead, done, running, then pending.
fn display_status(
    done: bool,
    running: bool,
    dead: Option<&Marker>,
    regressed: Option<&Marker>,
) -> TaskStatus {
    if regressed.is_some() {
        TaskStatus::Regressed
    } else if dead.is_some() {
        TaskStatus::Dead
    } else if done {
        TaskStatus::Done
    } else if running {
        TaskStatus::Running
    } else {
        TaskStatus::Pending
    }
}

/// The status next-step derivation reads: regressed, done, dead, running, pending.
fn state_status(
    done: bool,
    running: bool,
    dead: Option<&Marker>,
    regressed: Option<&Marker>,
) -> TaskStatus {
    if regressed.is_some() {
        TaskStatus::Regressed
    } else if done {
        TaskStatus::Done
    } else if dead.is_some() {
        TaskStatus::Dead
    } else if running {
        TaskStatus::Running
    } else {
        TaskStatus::Pending
    }
}

/// The marker file path of one target in one marker folder.
fn marker_path(folder: &Path, kind: &str, target: &str) -> PathBuf {
    folder.join(".run").join(kind).join(format!("{target}.md"))
}

/// Reads one halt marker, or `None` when its file does not exist.
fn read_marker(path: &Path) -> Option<Marker> {
    if !path.exists() {
        return None;
    }
    let text = fs::read_to_string(path).unwrap_or_default();
    let (data, body) = match parse_frontmatter(&text) {
        Ok(frontmatter) => (Some(frontmatter.data), frontmatter.body),
        Err(_) => (None, text),
    };
    Some(Marker {
        reason: string_field(data.as_ref(), "reason").unwrap_or_default(),
        stuck: bool_field(data.as_ref(), "stuck"),
        verification_passed: bool_field(data.as_ref(), "verification_passed"),
        diagnostic: trimmed(&body),
    })
}

/// A YAML field's string value.
fn string_field(data: Option<&yaml_rust2::yaml::Hash>, key: &str) -> Option<String> {
    data?
        .get(&Yaml::String(key.to_owned()))?
        .as_str()
        .map(ToOwned::to_owned)
}

/// Whether a YAML field is the boolean `true`.
fn bool_field(data: Option<&yaml_rust2::yaml::Hash>, key: &str) -> bool {
    matches!(
        data.and_then(|data| data.get(&Yaml::String(key.to_owned()))),
        Some(Yaml::Boolean(true))
    )
}

/// The trimmed result file body, or `None` when absent or empty.
fn result(folder: &Path, number: &str) -> Option<String> {
    let text = fs::read_to_string(
        folder
            .join(".run")
            .join("results")
            .join(format!("{number}.md")),
    )
    .ok()?;
    trimmed(&text)
}

/// The real disclosure names of a result file, in TypeScript's order.
fn disclosures(text: &str) -> Option<String> {
    let sections = parse_result_sections(text);
    let mut names = Vec::new();
    if sections.deviated.is_some() {
        names.push("deviated");
    }
    if sections.missing_context.is_some() {
        names.push("missing context");
    }
    if sections.outside_scope.is_some() {
        names.push("outside scope");
    }
    (!names.is_empty()).then(|| names.join(", "))
}

/// A trimmed text, or `None` when it is empty.
fn trimmed(text: &str) -> Option<String> {
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_owned())
}

/// Derives the status header from the archive, approval, task markers and dependencies.
fn status(location: Location, tasks: &[Task], approved: bool, unmet: &[String]) -> SpecStatus {
    if location == Location::Archived {
        return SpecStatus::Done;
    }
    if !approved {
        return SpecStatus::Unapproved;
    }
    if tasks
        .iter()
        .any(|task| task.status == TaskStatus::Regressed)
    {
        return SpecStatus::Regressed;
    }
    if tasks.iter().any(|task| task.status == TaskStatus::Dead) {
        return SpecStatus::Dead;
    }
    if tasks.iter().any(|task| task.status == TaskStatus::Running) {
        return SpecStatus::Running;
    }
    if !tasks.is_empty() && tasks.iter().all(|task| task.status == TaskStatus::Done) {
        return SpecStatus::Done;
    }
    if !unmet.is_empty() {
        return SpecStatus::Blocked;
    }
    if tasks
        .iter()
        .any(|task| task.state_status == TaskStatus::Pending)
    {
        SpecStatus::Pending
    } else {
        SpecStatus::Done
    }
}

/// The inputs one next step is derived from.
struct NextInput<'a> {
    /// Where the change sits.
    location: Location,
    /// The change's id.
    id: &'a str,
    /// Whether the change holds a non-empty approval seal.
    approved: bool,
    /// The proposal's verify command.
    verify: &'a str,
    /// Whether the change has a brief.
    brief: bool,
    /// The before-approval steps, when non-empty.
    before_approval: Option<&'a str>,
    /// The change's tasks.
    tasks: &'a [Task],
    /// The change-level regression marker, when it exists.
    change_regressed: Option<&'a Marker>,
    /// The unmet dependencies, in proposal order.
    unmet: &'a [String],
    /// The active steering trigger marker, when there is one.
    steering: Option<Steering>,
    /// Whether the change is archived but its default branch lacks it.
    archived_unlanded: bool,
}

/// A marker that an approved change has an active steering trigger.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Steering;

/// Derives what the change needs next, without planner, auto-steer or pause records.
fn next_step(input: &NextInput<'_>) -> Option<NextStep> {
    if input.location == Location::Rejected {
        return None;
    }
    if input.location == Location::Archived {
        return Some(if input.steering.is_some() {
            NextStep::dead_steering(input.id)
        } else if input.archived_unlanded {
            NextStep::archived_not_landed(input.id)
        } else {
            NextStep::landed()
        });
    }
    if !input.approved {
        return Some(unapproved_next(input));
    }
    if input.steering.is_some() {
        return Some(NextStep::dead_steering(input.id));
    }
    let state = next_state_status(input.tasks, input.change_regressed.is_some(), input.unmet);
    if let Some(task) = input
        .tasks
        .iter()
        .find(|task| matches!(task.state_status, TaskStatus::Dead | TaskStatus::Regressed))
    {
        return Some(NextStep::dead_retry(input.id, Some(&task.number)));
    }
    if matches!(state, SpecStatus::Dead | SpecStatus::Regressed) {
        return Some(NextStep::dead_retry(input.id, None));
    }
    if state == SpecStatus::Blocked {
        return Some(NextStep::blocked(input.unmet));
    }
    Some(NextStep::running(input.id))
}

/// The next step of a change that has no approval seal.
fn unapproved_next(input: &NextInput<'_>) -> NextStep {
    let verify = input.verify.trim();
    if verify.is_empty() || placeholder::is_placeholder(verify) {
        return NextStep::unplanned(input.id, input.brief);
    }
    NextStep::ready_for_approval(input.id, input.before_approval.is_some())
}

/// The status TypeScript's `deriveSpecState` gives an approved change.
fn next_state_status(tasks: &[Task], change_regressed: bool, unmet: &[String]) -> SpecStatus {
    if change_regressed
        || tasks
            .iter()
            .any(|task| matches!(task.state_status, TaskStatus::Regressed))
    {
        return SpecStatus::Regressed;
    }
    if tasks
        .iter()
        .any(|task| matches!(task.state_status, TaskStatus::Dead))
    {
        return SpecStatus::Dead;
    }
    if tasks
        .iter()
        .any(|task| matches!(task.state_status, TaskStatus::Running))
    {
        return SpecStatus::Running;
    }
    if !unmet.is_empty() {
        return SpecStatus::Blocked;
    }
    if tasks
        .iter()
        .any(|task| matches!(task.state_status, TaskStatus::Pending))
    {
        SpecStatus::Pending
    } else {
        SpecStatus::Done
    }
}
