-- osascript mac-click.applescript <button label> <timeout seconds>
-- Clicks the first AXButton named <label> in the Astraea window, waiting up to
-- <timeout> seconds for it. Prints "clicked" or "absent"; errors on AX denial.
on run argv
	set label to item 1 of argv
	set limit to (item 2 of argv) as integer
	tell application "System Events"
		set p to first process whose bundle identifier is "com.astraea.workstation"
		repeat limit times
			try
				set els to entire contents of window 1 of p
				repeat with e in els
					try
						if role of e is "AXButton" then
							set n to ""
							try
								set n to name of e
							end try
							if n is missing value or n is "" then
								try
									set n to description of e
								end try
							end if
							if n is label then
								click e
								return "clicked"
							end if
						end if
					end try
				end repeat
			end try
			delay 1
		end repeat
	end tell
	return "absent"
end run
