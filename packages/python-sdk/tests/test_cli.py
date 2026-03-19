from __future__ import annotations

import sys

import pytest

from browseragentprotocol import __version__
from browseragentprotocol.cli import main


def test_version_command_prints_current_package_version(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(sys, "argv", ["bap", "version"])

    with pytest.raises(SystemExit) as exc_info:
        main()

    assert exc_info.value.code == 0
    assert capsys.readouterr().out.strip() == f"browseragentprotocol {__version__}"


def test_no_args_prints_help(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(sys, "argv", ["bap"])

    with pytest.raises(SystemExit) as exc_info:
        main()

    assert exc_info.value.code == 0
    assert "Browser Agent Protocol (BAP) Python SDK CLI" in capsys.readouterr().out
