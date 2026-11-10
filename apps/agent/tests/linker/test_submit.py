from atlas_agent.linker.tools import SubmitSuggestions

def test_the_submit_tool_takes_suggestions_without_a_kind() -> None:
    schema = SubmitSuggestions.model_json_schema()
    suggestion = schema[ "$defs" ][ "SubmittedSuggestion" ]

    assert schema[ "required" ] == [ "suggestions" ]
    assert sorted( suggestion[ "properties" ] ) == [ "anchor", "reason", "target" ]
    assert "kind" not in suggestion[ "properties" ]
