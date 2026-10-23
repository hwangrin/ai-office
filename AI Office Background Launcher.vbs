' Hidden Windows launcher for AI Office 3D (runs without visible terminal window)
Option Explicit
Dim fso, shell, rootDir, action, i, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
rootDir = fso.GetParentFolderName(WScript.ScriptFullName)
action = "start"
If WScript.Arguments.Count > 0 Then
  action = WScript.Arguments(0)
End If
cmd = "node """ & rootDir & "\tools\launcher-bg.cjs"" " & action
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " " & WScript.Arguments(i)
Next
shell.CurrentDirectory = rootDir
shell.Run cmd, 0, True
