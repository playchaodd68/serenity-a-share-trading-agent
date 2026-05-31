## ADDED Requirements

### Requirement: Obsidian Knowledgebase Initialization
The system SHALL create a dedicated Obsidian folder with subfolders for methodology, industries, companies, reports, sources, runs, and templates.

#### Scenario: Default vault path exists
- **WHEN** the user runs `npm run obsidian:init`
- **THEN** the system creates `/Users/apple/Documents/HenryXu/Serenity-A股产业投研`
- **AND** writes index and methodology files.

### Requirement: Source Registry
The system SHALL maintain a machine-readable source registry with source ID, URL/path, title, tier, author/publisher, observed date, and notes.

#### Scenario: Source added
- **WHEN** a connector records a source
- **THEN** duplicate source IDs are merged
- **AND** the registry remains valid JSON.

### Requirement: Report and High-quality Information Ingestion
The system SHALL support local markdown, text, PDF metadata, and URL manifest ingestion for sell-side reports and high-quality information.

#### Scenario: Licensed report files are available
- **WHEN** the user places files under the configured report inbox
- **THEN** the system registers each file and writes Obsidian source notes.
