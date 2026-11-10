from atlas_agent.claude import ClaudeClient
from atlas_agent.config import Settings
from atlas_agent.contract.link import (
    FailedLinkResponse,
    LinkedResponse,
    LinkOutcome,
    LinkRequest
)
from atlas_agent.linker.checks import apply_checks
from atlas_agent.linker.instructions import build_instructions
from atlas_agent.linker.tools import SubmitSuggestions
from atlas_agent.runner import AgentOutcome, AgentSpec, Limits, run_agent
from atlas_agent.vault.links import collect_link_targets
from atlas_agent.vault.notes import list_all_notes
from atlas_agent.vault.paths import vault_for
from atlas_agent.vault.toolset import VaultTool, vault_tools

SUBMIT_TOOL_NAME = "submit_suggestions"

async def run_linker(
    request: LinkRequest,
    settings: Settings,
    claude: ClaudeClient
) -> LinkedResponse | FailedLinkResponse:
    vault = vault_for( settings, request.vault_dir )
    system_text = build_instructions( settings.max_suggestions )

    if request.guidance.strip():
        system_text = f"{system_text}\n\n## Guidance\n\n{request.guidance}"

    note = request.note
    note_body = "\n".join(
        [
            f"Title: {note.title}",
            f"Tags: {', '.join( note.tags ) if note.tags else '(none)'}",
            f"Folder: {note.folder or '(default)'}",
            "",
            "## Body",
            "",
            note.body
        ]
    )
    # A closing tag inside the note must not end the block early (TRD 3.3)
    note_text = f"<source_content>\n{note_body.replace( '</source_content>', '</source_content_>' )}\n</source_content>"
    spec = AgentSpec[ SubmitSuggestions ](
        system_text = system_text,
        first_message = note_text,
        model = request.model,
        tools = vault_tools(
            vault,
            settings,
            [ VaultTool.LIST_NOTES, VaultTool.SEARCH_VAULT, VaultTool.READ_NOTE, VaultTool.LIST_LINK_TARGETS ]
        ),
        submit_name = SUBMIT_TOOL_NAME,
        submit_description = "Submit the final link suggestions for the note. This ends the run.",
        submit_model = SubmitSuggestions,
        submission_noun = "suggestions",
        nudge = f"Finish by calling {SUBMIT_TOOL_NAME} with your suggestions, or an empty list if none fit.",
        limits = Limits(
            max_turns = settings.max_turns,
            max_tool_calls = settings.max_tool_calls,
            max_output_tokens = settings.max_output_tokens,
            timeout_seconds = settings.run_timeout_seconds
        )
    )
    run = await run_agent( spec, claude )

    if run.outcome == AgentOutcome.FAILED or run.submission is None:
        return FailedLinkResponse(
            outcome = LinkOutcome.FAILED,
            reason = run.reason or "The run failed",
            suggestions = [],
            usage = run.usage
        )

    suggestions = apply_checks(
        run.submission.suggestions,
        note,
        list_all_notes( vault ),
        collect_link_targets( vault ),
        settings
    )

    return LinkedResponse(
        outcome = LinkOutcome.LINKED,
        reason = None,
        suggestions = suggestions,
        usage = run.usage
    )
