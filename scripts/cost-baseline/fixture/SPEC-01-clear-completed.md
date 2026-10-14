# Spec: Clear completed todos
Spec ID: SPEC-01
Status: approved
Supersedes: none

## Problem and user
A user of the todo library finishes tasks but cannot remove them, so the list only grows and finished work stays mixed with open work. Module: the todo library in `src/`.

## Goals / Non-goals
- Goals: remove every completed todo with one call.
- Non-goals: removing a single todo by id, persistence, undo.

## User stories
- **US-1:** As a library user, I want to remove all completed todos at once, so that the list shows only open work.

## Acceptance criteria (EARS)
- **AC-1:** WHEN `clearCompleted()` is called, the list shall remove every item whose `done` is true and return the number of removed items. [verify: unit]
- **AC-2:** WHEN `clearCompleted()` is called and no item is done, the list shall keep every item unchanged and return 0. [verify: unit]
- **AC-3:** WHEN `clearCompleted()` has removed items, the list shall keep the ids of the remaining items unchanged and never reuse a removed id for a later `add`. [verify: unit]

### Traceability

| US | AC | EC | NFR | Verify |
|---|---|---|---|---|
| US-1 | AC-1, AC-2, AC-3 | EC-1 | NFR-1 | unit |

## Edge cases
- **EC-1:** `clearCompleted()` on an empty list → returns 0, as in AC-2.

## Non-functional requirements
- **NFR-1:** WHEN `clearCompleted()` is called on a list of 10000 items, the list shall finish within 200 milliseconds. [verify: unit]

## Inputs and provenance

| Input | Source | Via | Trust |
|---|---|---|---|
| none | — | — | trusted |

## Untrusted inputs
None. The operation takes no input.

## Open questions
None
