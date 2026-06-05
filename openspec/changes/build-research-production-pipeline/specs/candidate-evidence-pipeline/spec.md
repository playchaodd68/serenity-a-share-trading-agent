## ADDED Requirements

### Requirement: Candidate Evidence Extraction
The system SHALL extract structured candidate-level evidence from registered sources and candidate context.

#### Scenario: Extract evidence from matching source
- **WHEN** a source mentions a candidate code, name, theme keyword, product, customer, supplier, capacity, or risk term
- **THEN** the system records an evidence item with source IDs, tier, polarity, confidence, and snippet

#### Scenario: Preserve P0 gating
- **WHEN** extracted evidence comes from generic primary-source portals
- **THEN** it MUST NOT satisfy candidate-level P0 requirements unless it is tied to a concrete candidate document or record

### Requirement: Evidence In Reports
Reports SHALL include the strongest candidate evidence, graph relationships, and next research actions.

#### Scenario: Report candidate with evidence
- **WHEN** a screen report is generated
- **THEN** each candidate includes evidence highlights and coverage gaps derived from structured evidence
