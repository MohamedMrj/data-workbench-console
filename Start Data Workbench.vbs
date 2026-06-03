Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)

If fso.FileExists(baseDir & "\Start Data Workbench.ps1") Then
    scriptPath = baseDir & "\Start Data Workbench.ps1"
ElseIf fso.FileExists(baseDir & "\data-workbench-console\Start Data Workbench.ps1") Then
    scriptPath = baseDir & "\data-workbench-console\Start Data Workbench.ps1"
Else
    shell.Popup "Could not find Start Data Workbench.ps1. Put this launcher either inside the app folder or on the Desktop next to the data-workbench-console folder.", 0, "Data Workbench Console", 16
    WScript.Quit 1
End If

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File " & Chr(34) & scriptPath & Chr(34)
shell.Run command, 0, False
