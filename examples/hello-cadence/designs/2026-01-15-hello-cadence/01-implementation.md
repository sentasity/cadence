---
title: Hello-Cadence — Implementation
---

# Implementation

## Function signature

> [!summary] Plain English
> One function that takes no arguments and returns a string. The string is the current UTC time in ISO 8601 format, ending in `Z`.

```python
def current_time_iso() -> str:
    ...
```

## Behavior

> [!summary] Plain English
> Get the current UTC time from the OS. Format it `YYYY-MM-DDTHH:MM:SSZ`. Return the string. Don't include microseconds.

```python
import datetime

def current_time_iso() -> str:
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
```

## `__main__` entry

> [!summary] Plain English
> When the module is run directly (`python -m hello_cadence.now`), print the result of calling `current_time_iso()`.

```python
if __name__ == "__main__":
    print(current_time_iso())
```

## Test

> [!summary] Plain English
> One test verifying the output matches the ISO 8601 pattern. We can't assert on the exact value (time moves), but we can assert on the shape.

```python
import re
from hello_cadence.now import current_time_iso

def test_current_time_iso_matches_pattern():
    result = current_time_iso()
    assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", result)
```
