# Uninstall and user-data policy (declared before the retention check)

Applies to the Windows packages built from `0b5828b1` in this run.

## Locations

| Data | Path | Owner |
| --- | --- | --- |
| Program files | `%LOCALAPPDATA%\Astraea Workstation` (NSIS) / `C:\Program Files\Astraea Workstation` (MSI) | installer |
| App profile (WebView2 profile, including the "this browser" project slot) | `%LOCALAPPDATA%\com.astraea.workstation` | app / user |
| User project files and exports | wherever the user saved them (native dialogs) | user |
| Registry | uninstall entry under `HKCU\…\Uninstall` (NSIS) / `HKLM\…\Uninstall` (MSI) | installer |

## Declared behaviour

1. **Uninstall removes program files and the uninstaller registration only.** It
   never deletes user-chosen project files or exports; those live outside the
   install directory and are the user's.
2. **The app profile is not removed by uninstall.** The "this browser" project
   slot lives in the WebView2 profile under `%LOCALAPPDATA%\com.astraea.workstation`.
   Uninstalling does not delete it, so reinstalling the same version sees the same
   local slot. A user who wants a clean slate must delete that folder manually
   after uninstalling. This is disclosed here rather than silently erased.
3. **No hidden copy of user projects is kept elsewhere.** The only app-owned
   copies are the explicitly saved project files and the local slot described
   above; exports are written where the user chooses.

## What the check below exercises

- Uninstall with a saved project file and a populated local slot (NSIS package).
- After uninstall: program directory and registry entry gone; the saved project
  file present with its SHA-256 unchanged; the app profile directory still
  present (the exact profile path is the declaration above, not a value printed
  by the retention receipt).
- Reinstall and launch: the local slot opens as the stored revision, which
  shows the saved project file and the local slot survived the cycle.

What this check does **not** do: it performs no filesystem-wide search for hidden
copies, does not test the integrity of unrelated profile data, and performs no
edit or export while the 3D viewport is in its fallback state. Statements 2 and 3
above (profile retention, no hidden copies) are the declared policy; the receipt
covers only the items listed in this section.
