' Run a PowerShell script with no visible window (used by Task Scheduler)
' Usage: wscript.exe //B launch-hidden.vbs "C:\emkaro-signing\run-agent.ps1"
If WScript.Arguments.Count < 1 Then WScript.Quit 1

scriptPath = WScript.Arguments(0)
workDir = Left(scriptPath, InStrRev(scriptPath, "\") - 1)

cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptPath & """"
CreateObject("Wscript.Shell").Run cmd, 0, False
