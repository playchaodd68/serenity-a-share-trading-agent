## ADDED Requirements

### Requirement: A-share Market Snapshot
The system SHALL fetch an A-share market snapshot with code, name, industry, concept, market cap, float market cap, PE, turnover, net inflow, latest price, and percent change when the public endpoint is available.

#### Scenario: Public data endpoint succeeds
- **WHEN** the user runs `npm run screen`
- **THEN** the system fetches the configured number of A-share rows
- **AND** validates required fields before scoring.

### Requirement: Candidate Scoring
The system SHALL rank candidates by chokepoint relevance, evidence quality, theme fit, liquidity, valuation sanity, and risk penalties.

#### Scenario: High relevance industry
- **WHEN** a stock's industry or concept matches a configured bottleneck theme
- **THEN** the candidate receives a theme score
- **AND** the report includes which keywords matched.

### Requirement: Research Report Output
The system SHALL generate markdown and JSON reports for each screen run.

#### Scenario: Screening run completes
- **WHEN** candidate screening completes
- **THEN** the system writes a run report under `reports/`
- **AND** each candidate includes score components, trace IDs, source coverage, and risk notes.
