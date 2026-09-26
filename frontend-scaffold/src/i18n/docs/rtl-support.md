# RTL Layout Support Assessment

## Current Status
Stellar Tipz currently supports LTR layout exclusively.
The application uses document.documentElement.dir = "ltr" by default.

## RTL Language Support
The i18n config includes isRtlLanguage and applyLanguageAttributes that sets dir="rtl" for RTL languages.

### Components Requiring RTL Review
| Component | RTL Ready | Notes |
|-----------|-----------|-------|
| Header | Partial | Navigation may need RTL-aware layout |
| Footer | Partial | Flex direction should be reviewed |
| Input | Partial | Text alignment should flip |
| Card | Partial | Shadow direction should flip |
| Avatar | Ready | Initials are language-agnostic |
| Badge | Ready | Emoji labels are universal |
| Divider | Ready | Orientation-based |
| Loader | Ready | Spin is direction-agnostic |
