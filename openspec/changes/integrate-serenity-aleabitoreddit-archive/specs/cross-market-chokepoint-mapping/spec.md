## ADDED Requirements

### Requirement: Thesis Archive Source Registration
The system SHALL register the external Serenity thesis-archive skill as an attributable methodology source whose evidence semantics differ from primary company evidence.

#### Scenario: Source registry includes the thesis archive
- **WHEN** source registry seeds are loaded
- **THEN** the registry includes the `yan-labs/serenity-aleabitoreddit` thesis archive as a P1 repo methodology source

#### Scenario: Thesis archive is not A-share candidate evidence
- **WHEN** the agent evaluates A-share candidate confidence
- **THEN** the thesis-archive source MUST NOT satisfy candidate-level P0 evidence requirements and MUST NOT appear as candidate-relevant evidence

### Requirement: Concept-Based Chokepoint Mapping
The system SHALL expose a concept-keyed chokepoint mapping that links Serenity-derived bottleneck concepts to the local theme taxonomy and to A-share segment keywords.

#### Scenario: Chokepoint maps to local themes
- **WHEN** a known chokepoint concept is mapped
- **THEN** the result references one or more configured `DEFAULT_THEMES` and A-share segment keywords for constituent resolution

#### Scenario: No clean A-share equivalent is surfaced, not forced
- **WHEN** a chokepoint has no clean A-share equivalent
- **THEN** the mapping marks it as a non-mappable / substitution-watch item instead of forcing a candidate match

### Requirement: Cross-Market Evidence Gate
The system SHALL treat Serenity US/HK theses as research lines of inquiry only, requiring independent A-share P0 confirmation before any high-confidence A-share claim.

#### Scenario: US thesis stays a line of inquiry
- **WHEN** the methodology summary or mapping output references a Serenity thesis
- **THEN** it is framed as a line of inquiry that must be confirmed by independent A-share P0 evidence, never as proof an A-share candidate controls the bottleneck

#### Scenario: Methodology documents the mapping framework
- **WHEN** a user requests the methodology summary
- **THEN** the summary includes a cross-market A-share mapping framework covering concept → segment → A-share resolution, the 国产替代 / geopolitical premium-discount dimension, and the evidence gate
