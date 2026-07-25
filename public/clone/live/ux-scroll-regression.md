# Mobile chat scroll regression checklist

- Workspace is a single fixed app viewport on screens up to 900px.
- Only the messages area scrolls in the Dialog tab.
- Chips and composer participate in normal layout and never overlay messages.
- The logic/passport panel is shown only in the Passport tab on mobile.
- Bottom navigation sits outside the content area and respects safe-area insets.
- Bottom navigation and chips hide while the question field is focused.
- The viewport uses `interactive-widget=resizes-content` to respond to the mobile keyboard.
- Layout remains usable down to 320px width.
