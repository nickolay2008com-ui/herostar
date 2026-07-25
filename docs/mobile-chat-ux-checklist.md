# Mobile chat UX regression checklist

- The workspace uses one app viewport on screens up to 900px.
- Only the messages area scrolls in the Dialog tab.
- Prompt chips and the composer remain in normal layout and never cover messages.
- The logic/passport panel appears only in the Passport tab on mobile.
- Bottom navigation remains outside content and respects safe-area insets.
- Bottom navigation and prompt chips leave the screen while the keyboard is active.
- The viewport responds to the mobile keyboard through `interactive-widget=resizes-content`.
- The layout remains usable at 320px width.
