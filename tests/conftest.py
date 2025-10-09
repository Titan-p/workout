import os
from copy import deepcopy
from types import SimpleNamespace
from typing import Any, Callable, Dict, List

import pytest

os.environ.setdefault("SUPABASE_URL", "http://test.supabase.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from backend.workout import create_app


class QueryBuilder:
    def __init__(self, storage: Dict[str, List[Dict[str, Any]]], table_name: str):
        self.storage = storage
        self.table_name = table_name
        self.action = "select"
        self.filters: List[Callable[[Dict[str, Any]], bool]] = []
        self.ordering: tuple[str, bool] | None = None
        self.limit_value: int | None = None
        self.payload: Any = None

    # Query builders -------------------------------------------------
    def select(self, *args, **kwargs):
        self.action = "select"
        return self

    def insert(self, payload):
        self.action = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.action = "update"
        self.payload = payload
        return self

    def delete(self):
        self.action = "delete"
        return self

    def eq(self, field, value):
        self.filters.append(lambda row, field=field, value=value: row.get(field) == value)
        return self

    def gt(self, field, value):
        def _predicate(row, field=field, value=value):
            current = row.get(field)
            if current is None:
                return False
            return current > value

        self.filters.append(_predicate)
        return self

    def in_(self, field, values):
        values_set = set(values)
        self.filters.append(
            lambda row, field=field, values_set=values_set: row.get(field) in values_set
        )
        return self

    def order(self, field, desc=False):
        self.ordering = (field, bool(desc))
        return self

    def limit(self, value: int):
        self.limit_value = value
        return self

    # Execution ------------------------------------------------------
    def execute(self):
        records = self.storage.setdefault(self.table_name, [])

        if self.action == "insert":
            payloads = self.payload if isinstance(self.payload, list) else [self.payload]
            inserted = []
            for item in payloads:
                clone = deepcopy(item)
                records.append(clone)
                inserted.append(deepcopy(clone))
            return SimpleNamespace(data=inserted)

        if self.action == "update":
            updated = []
            for record in records:
                if all(predicate(record) for predicate in self.filters):
                    record.update(self.payload)
                    updated.append(deepcopy(record))
            return SimpleNamespace(data=updated)

        if self.action == "delete":
            kept = []
            deleted = []
            for record in records:
                if all(predicate(record) for predicate in self.filters):
                    deleted.append(deepcopy(record))
                else:
                    kept.append(record)
            self.storage[self.table_name] = kept
            return SimpleNamespace(data=deleted)

        # default select
        selected = [
            deepcopy(record)
            for record in records
            if all(predicate(record) for predicate in self.filters)
        ]

        if self.ordering:
            field, desc = self.ordering
            selected.sort(key=lambda item: item.get(field), reverse=desc)

        if self.limit_value is not None:
            selected = selected[: self.limit_value]

        return SimpleNamespace(data=selected)


class SupabaseStub:
    def __init__(self):
        self.storage: Dict[str, List[Dict[str, Any]]] = {}

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(self.storage, name)

    # Convenience helpers for tests
    def seed(self, table: str, rows: List[Dict[str, Any]]):
        self.storage[table] = [deepcopy(row) for row in rows]


@pytest.fixture
def supabase_stub():
    return SupabaseStub()


@pytest.fixture
def app(supabase_stub):
    app = create_app(
        {
            "TESTING": True,
            "SUPABASE_CLIENT": supabase_stub,
        }
    )
    yield app


@pytest.fixture
def client(app):
    return app.test_client()
