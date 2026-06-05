## ADDED Requirements

### Requirement: External Methodology Source Registration
The system SHALL register external methodology distillation material as an attributable source with evidence semantics that distinguish it from primary company evidence.

#### Scenario: Source registry includes distillation input
- **WHEN** source registry seeds are loaded
- **THEN** the registry includes the `serenity-reply` distillation repository as a methodology source

#### Scenario: Distillation is not primary company evidence
- **WHEN** the agent evaluates candidate confidence
- **THEN** the distillation source MUST NOT satisfy candidate-level P0 evidence requirements

### Requirement: Distilled Methodology Rules
The system SHALL expose stable distilled Serenity-derived rules in the canonical methodology summary.

#### Scenario: Methodology includes reasoning provenance
- **WHEN** a user requests the methodology summary
- **THEN** the summary explains the distinction between direct evidence, multi-source synthesis, framework extrapolation, and unsupported gaps

#### Scenario: Methodology includes limitations
- **WHEN** a user requests the methodology summary
- **THEN** the summary includes limitations such as valuation discipline, survivorship bias, substitution risk, and unverified credentials

### Requirement: Non-Impersonation Boundary
The system SHALL use the external distillation as a research framework without impersonating Serenity or presenting direct trading instructions.

#### Scenario: Agent prompt uses framework framing
- **WHEN** the trading agent is created
- **THEN** its system prompt frames the methodology as Serenity-derived research and forbids first-person Serenity role-play

#### Scenario: High-risk trading requests remain bounded
- **WHEN** a user asks for leverage, all-in, borrowing, or exact allocation guidance
- **THEN** the agent MUST keep the response research-only and refuse specific allocation or leverage instructions
