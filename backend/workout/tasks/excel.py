from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Protocol


class TaskDispatcher(Protocol):
    """Minimal protocol representing a background task dispatcher."""

    def dispatch(self, task_name: str, payload: dict) -> None:
        ...


@dataclass(slots=True)
class ExcelImportRequest:
    """Metadata required to process an uploaded Excel file asynchronously."""

    storage_path: str
    initiated_by: str | None = None


def schedule_excel_import(dispatcher: TaskDispatcher, request: ExcelImportRequest) -> None:
    """Queue an Excel import job for asynchronous handling."""

    dispatcher.dispatch("excel_import", asdict(request))
