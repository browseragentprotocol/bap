from __future__ import annotations

from importlib.metadata import version

from browseragentprotocol import (
    BAPClient,
    BAPClientSync,
    __version__,
    label,
    ref,
    role,
    test_id,
)


def test_core_exports_are_available() -> None:
    assert BAPClient.__name__ == "BAPClient"
    assert BAPClientSync.__name__ == "BAPClientSync"
    assert __version__ == version("browser-agent-protocol")


def test_selector_factories_return_expected_shapes() -> None:
    submit_button = role("button", "Submit")
    email_field = label("Email address")
    stable_ref = ref("@e1")
    test_selector = test_id("login-submit")

    assert submit_button.model_dump() == {
        "type": "role",
        "role": "button",
        "name": "Submit",
        "exact": None,
    }
    assert email_field.model_dump() == {
        "type": "label",
        "value": "Email address",
        "exact": None,
    }
    assert stable_ref.model_dump() == {"type": "ref", "ref": "@e1"}
    assert test_selector.model_dump() == {"type": "testId", "value": "login-submit"}
