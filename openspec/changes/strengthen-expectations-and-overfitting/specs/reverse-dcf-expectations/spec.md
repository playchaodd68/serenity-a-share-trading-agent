## ADDED Requirements

### Requirement: Market-Implied Growth
The system SHALL compute the growth rate a market value implies via a reverse DCF and compare it to the bottleneck thesis growth.

#### Scenario: Round-trip recovery
- **WHEN** a market value equals the DCF present value at a known growth rate
- **THEN** the implied growth rate recovers that growth rate.

#### Scenario: Invalid terminal assumption
- **WHEN** the discount rate does not exceed the terminal growth
- **THEN** the present-value computation raises an error rather than returning a divide-by-zero value.

### Requirement: Expectations Gap Classification
The system SHALL classify the market-implied growth against the thesis growth as priced-in, positive-expectation-gap, or in-line, as a falsifiable evidence input rather than a trade signal.

#### Scenario: Priced in
- **WHEN** market-implied growth exceeds thesis growth beyond the band
- **THEN** the verdict is priced-in with a note that new order/price/capacity evidence is required.

#### Scenario: Positive expectation gap
- **WHEN** market-implied growth is below thesis growth beyond the band
- **THEN** the verdict is positive-expectation-gap flagged as a framework inference needing evidence.
