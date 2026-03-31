# Changelog

## [v0.9.2] - 2026-03-31

### Changed
- Reduced gap between text and underline bar for label-only range events
- Improved text alignment and connector rendering for label-style events

## [v0.9.1] - 2026-03-30

### Added
- Application version display in the UI
- Icon support for toggle buttons in controls
- GitHub Pages deployment workflow

### Changed
- Mobile-friendly design
- Improved pointer drag handling (capture only after drag confirmation)
- Improved callout positioning and event height calculation for notes
- Range bracket indicators for ranged events
- Import/export functionality for timelines

### Fixed
- Consistent callout margins across event styles
- Timeline height preserved when switching timelines
- Viewport state persisted per active timeline
- Font loading handled in event layer rendering

## [v0.9.0] - 2026-03-28

### Added
- Initial release
- Timeline view with pan and zoom
- Event creation and editing (title, dates, color, notes)
- Multiple display styles: solid, outline, label only
- Multiple timelines support
- Weekend highlighting
- Date picker with locale-aware formatting
- Docker support
- CI workflow for container builds

[Unreleased]: https://github.com/ybizeul/timeline/compare/v0.9.2...HEAD
[v0.9.2]: https://github.com/ybizeul/timeline/compare/v0.9.1...v0.9.2
[v0.9.1]: https://github.com/ybizeul/timeline/compare/v0.9.0...v0.9.1
[v0.9.0]: https://github.com/ybizeul/timeline/releases/tag/v0.9.0
