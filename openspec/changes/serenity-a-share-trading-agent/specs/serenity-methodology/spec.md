## ADDED Requirements

### Requirement: Traceable Chokepoint Methodology
The system SHALL represent Serenity's investment logic as a structured methodology whose scoring factors are individually traceable to source IDs.

#### Scenario: Methodology note generation
- **WHEN** the user runs methodology ingestion
- **THEN** the system writes a canonical methodology note
- **AND** the note includes prior formation, evidence update, negative evidence, expected-value gate, and rotation rules
- **AND** each major claim references at least one source ID.

### Requirement: Evidence Quality Tiers
The system SHALL classify evidence into P0, P1, and P2 tiers and require higher confidence candidates to include P0 evidence.

#### Scenario: Candidate without primary evidence
- **WHEN** a candidate only has social or market evidence
- **THEN** the system caps the candidate at low confidence
- **AND** reports the missing P0 evidence as a coverage gap.

### Requirement: Bayesian Update Trace
The system SHALL expose a deterministic explanation of how each evidence item changes a candidate's confidence score.

#### Scenario: Explain candidate
- **WHEN** a user asks `/why <code>`
- **THEN** the response includes prior score, positive evidence deltas, negative evidence deltas, posterior score, and source IDs.
