from pathlib import Path

from atlas_agent.claude import ClaudeClient
from atlas_agent.config import Settings
from atlas_agent.contract.syllabus import (
    DraftedSyllabus,
    FailedSyllabus,
    SyllabusOutcome,
    SyllabusRequest,
    TargetLevel
)
from atlas_agent.contract.link import AgentUsage
from atlas_agent.runner import AgentOutcome, AgentSpec, Limits, run_agent
from atlas_agent.syllabus.instructions import LOCKED_INSTRUCTIONS
from atlas_agent.syllabus.submit import SubmitSyllabus
from atlas_agent.vault.paths import vault_for
from atlas_agent.vault.toolset import VaultTool, vault_tools

SUBMIT_TOOL_NAME = "submit_syllabus"
FOLDER_NOT_FOUND = "Subject folder not found"

LEVEL_LABELS: dict[ TargetLevel, str ] = {
    TargetLevel.AWARENESS: "Awareness",
    TargetLevel.WORKING: "Working knowledge",
    TargetLevel.PROFICIENT: "Proficient",
    TargetLevel.EXPERT: "Expert"
}

def resolve_subject_folder( vault: Path, subject_folder: str ) -> Path | None:
    candidate = vault / subject_folder

    try:
        resolved = candidate.resolve( strict = True )
    except OSError:
        return None

    if not resolved.is_dir() or not resolved.is_relative_to( vault.resolve() ):
        return None

    return resolved

def build_first_message( request: SyllabusRequest ) -> str:
    return "\n".join(
        [
            f"Subject: {request.name}",
            f"Target level: {LEVEL_LABELS[ request.level ]}",
            *( [] if request.intent is None else [ f"Intent: {request.intent}" ] ),
            "",
            "The learner's notes on the subject are in a folder you reach through the tools."
        ]
    )

async def run_syllabus(
    request: SyllabusRequest,
    settings: Settings,
    claude: ClaudeClient
) -> DraftedSyllabus | FailedSyllabus:
    vault = vault_for( settings, request.vault_dir )
    subject_root = resolve_subject_folder( vault, request.subject_folder )

    if subject_root is None:
        return FailedSyllabus(
            outcome = SyllabusOutcome.FAILED,
            reason = FOLDER_NOT_FOUND,
            usage = AgentUsage(
                input_tokens = 0,
                output_tokens = 0,
                cache_read_input_tokens = 0,
                cache_creation_input_tokens = 0,
                tool_calls = 0,
                turns = 0
            )
        )

    system_text = LOCKED_INSTRUCTIONS

    if request.guidance.strip():
        system_text = f"{system_text}\n\n## Guidance\n\n{request.guidance}"

    spec = AgentSpec[ SubmitSyllabus ](
        system_text = system_text,
        first_message = build_first_message( request ),
        model = request.model,
        tools = vault_tools(
            subject_root,
            settings,
            [ VaultTool.LIST_NOTES, VaultTool.SEARCH_VAULT, VaultTool.READ_NOTE ]
        ),
        submit_name = SUBMIT_TOOL_NAME,
        submit_description = "Submit the finished syllabus. This ends the run.",
        submit_model = SubmitSyllabus,
        submission_noun = "syllabus",
        nudge = f"Finish by calling {SUBMIT_TOOL_NAME} with the syllabus.",
        limits = Limits(
            max_turns = settings.syllabus_max_turns,
            max_tool_calls = settings.syllabus_max_tool_calls,
            max_output_tokens = settings.syllabus_max_output_tokens,
            timeout_seconds = settings.syllabus_timeout_seconds
        )
    )
    run = await run_agent( spec, claude )

    if run.outcome == AgentOutcome.FAILED or run.submission is None:
        return FailedSyllabus(
            outcome = SyllabusOutcome.FAILED,
            reason = run.reason or "The run failed",
            usage = run.usage
        )

    return DraftedSyllabus(
        outcome = SyllabusOutcome.DRAFTED,
        reason = None,
        sections = run.submission.sections,
        usage = run.usage
    )
