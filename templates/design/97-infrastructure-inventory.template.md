---
title: <DESIGN_TITLE> — Infrastructure Inventory
---

# Infrastructure Inventory

Every service and resource this design touches (existing + new), one line each, named as an operator would know it. No file paths: the plan maps these to code.

## Existing infrastructure (reused)

| Resource | Type | Where | Notes |
|---|---|---|---|
| <name> | <Lambda \| RDS \| S3 \| etc.> | <account / region / console URL> | <one-line note> |

## New infrastructure (created by this design)

| Resource | Type | Where it'll live | Notes |
|---|---|---|---|
| <name> | <type> | <account / region> | <one-line note> |

## IAM / cross-account chains

<Document any new permissions, cross-account roles, or trust relationships.>
