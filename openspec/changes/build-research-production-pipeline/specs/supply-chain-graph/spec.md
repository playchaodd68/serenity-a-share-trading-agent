## ADDED Requirements

### Requirement: Supply Chain Graph Construction
The system SHALL build traceable relationship graphs connecting candidates, themes, products, sources, customers, suppliers, and risk factors.

#### Scenario: Candidate graph contains sourced edges
- **WHEN** a candidate has matched themes or extracted evidence
- **THEN** the graph contains edges with relationship type, source IDs, tier, polarity, and confidence

#### Scenario: Graph avoids unsupported relationships
- **WHEN** a relationship is only inferred from a generic theme match
- **THEN** the edge is marked as framework inference and not direct evidence

### Requirement: Graph Summary
The system SHALL provide a compact graph summary for reports and Feishu explanations.

#### Scenario: Explain candidate graph
- **WHEN** the user asks why a candidate is on the list
- **THEN** the explanation includes the strongest sourced relationships and unresolved missing links
